const STOP_ALL_KEY = "__all__";

const stopVersions = new Map;
const activeWorkersByScope = new Map;

function getScrapeScopeKey(message) {
    if (message && message.guildId) return `guild:${message.guildId}`;
    if (message && message.channelId) return `dm:${message.channelId}`;
    return "global";
}

function getStopVersion(scopeKey) {
    const key = scopeKey || "global";
    return stopVersions.get(key) || 0;
}

function captureStopSnapshot(scopeKey) {
    const key = scopeKey || "global";
    return {
        key: key,
        scopeVersion: getStopVersion(key),
        allVersion: getStopVersion(STOP_ALL_KEY)
    };
}

function isStopRequested(scopeKey, snapshot) {
    const key = scopeKey || "global";
    const snap = snapshot || captureStopSnapshot(key);
    return getStopVersion(key) !== snap.scopeVersion || getStopVersion(STOP_ALL_KEY) !== snap.allVersion;
}

function registerWorker(scopeKey, proc) {
    if (!proc || typeof proc.kill !== "function") return;
    const key = scopeKey || "global";
    let set = activeWorkersByScope.get(key);
    if (!set) {
        set = new Set;
        activeWorkersByScope.set(key, set);
    }
    set.add(proc);
}

function unregisterWorker(scopeKey, proc) {
    const key = scopeKey || "global";
    const set = activeWorkersByScope.get(key);
    if (!set) return;
    set.delete(proc);
    if (!set.size) activeWorkersByScope.delete(key);
}

function killWorkerProcess(proc) {
    if (!proc) return false;
    try {
        proc.kill("SIGTERM");
        return true;
    } catch (e) {
        return false;
    }
}

function stopWorkersForScope(scopeKey) {
    const key = scopeKey || "global";
    const set = activeWorkersByScope.get(key);
    if (!set || !set.size) return 0;
    let killed = 0;
    for (const proc of Array.from(set)) {
        if (killWorkerProcess(proc)) killed++;
    }
    activeWorkersByScope.delete(key);
    return killed;
}

function stopWorkersAll() {
    let killed = 0;
    for (const [key, set] of activeWorkersByScope.entries()) {
        for (const proc of Array.from(set)) {
            if (killWorkerProcess(proc)) killed++;
        }
        activeWorkersByScope.delete(key);
    }
    return killed;
}

function requestStopForScope(scopeKey) {
    const key = scopeKey || "global";
    stopVersions.set(key, getStopVersion(key) + 1);
    return stopWorkersForScope(key);
}

function requestStopAllScopes() {
    stopVersions.set(STOP_ALL_KEY, getStopVersion(STOP_ALL_KEY) + 1);
    return stopWorkersAll();
}

function getActiveWorkerCount(scopeKey) {
    if (!scopeKey) {
        let total = 0;
        for (const set of activeWorkersByScope.values()) total += set.size;
        return total;
    }
    const set = activeWorkersByScope.get(scopeKey || "global");
    return set ? set.size : 0;
}

module.exports = {
    getScrapeScopeKey: getScrapeScopeKey,
    captureStopSnapshot: captureStopSnapshot,
    isStopRequested: isStopRequested,
    registerWorker: registerWorker,
    unregisterWorker: unregisterWorker,
    requestStopForScope: requestStopForScope,
    requestStopAllScopes: requestStopAllScopes,
    getActiveWorkerCount: getActiveWorkerCount
};
