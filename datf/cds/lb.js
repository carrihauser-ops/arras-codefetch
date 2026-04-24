const {EmbedBuilder: EmbedBuilder} = require("discord.js");
const {fork: fork} = require("child_process");
const path = require("path");
const fs = require("fs");
const {getScrapeScopeKey: getScrapeScopeKey, captureStopSnapshot: captureStopSnapshot, isStopRequested: isStopRequested, registerWorker: registerWorker, unregisterWorker: unregisterWorker} = require("./scrape_control");
const tf_prot = "http";
function readIntEnv(name, fallback, min, max) {
    const raw = parseInt(String(process.env[name] || ""), 10);
    if (!Number.isFinite(raw)) return fallback;
    return Math.max(min, Math.min(max, raw));
}
const LB_MAX_ATTEMPTS = 1;
const LB_REQUIRED_ENTRIES = 10;
const LB_TIMEOUT_FLOOR = 6500;
const LB_TIMEOUT_CEIL = 24e3;
const LB_WORKER_TIMEOUT_CEIL = 21e3;
const LB_WORKERS = readIntEnv("LB_WORKERS", 4, 1, 5);
function computeAdaptiveTimeouts(proxyScore, queueDepth) {
    const base = 11500;
    const penalty = queueDepth > 1 ? Math.min(2200, (queueDepth - 1) * 400) : 0;
    const bonus = proxyScore > 0 ? Math.min(1800, proxyScore * 110) : 0;
    const attempt = Math.max(LB_TIMEOUT_FLOOR, Math.min(LB_TIMEOUT_CEIL, base + penalty - bonus));
    const worker = Math.max(3000, Math.min(LB_WORKER_TIMEOUT_CEIL, attempt - 500));
    return { attempt, worker };
}
const LB_PROGRESS_EDIT_THROTTLE_MS = readIntEnv("LB_PROGRESS_EDIT_THROTTLE_MS", 700, 200, 5e3);
function parseTeamCodeToken(value) {
    const token = String(value || "").toLowerCase().trim().replace(/^#/, "");
    const match = token.match(/^([a-z]{2,3})([1-4])([a-z0-9]*)$/i);
    if (!match) return null;
    const hash = `${match[1].toLowerCase()}${match[2]}${match[3] || ""}`;
    const teamDigit = parseInt(match[2], 10);
    if (!(teamDigit >= 1 && teamDigit <= 4)) return null;
    return {
        hash: hash,
        teamDigit: teamDigit,
        url: `https://arras.io/#${hash}`
    };
}
function isStrictTeamHash(value) {
    const token = String(value || "").toLowerCase().trim().replace(/^#/, "");
    return /^[a-z]{2,3}[1-4][a-z0-9]*$/.test(token);
}
function extractTeamCode(url) {
    const input = String(url || "").trim();
    if (!input) return null;
    let source = input;
    if (/^arras\.io\//i.test(source) || /^www\.arras\.io\//i.test(source)) {
        source = `https://${source}`;
    }
    if (/^https?:\/\//i.test(source)) {
        try {
            const parsed = new URL(source);
            const hashToken = String(parsed.hash || "").replace(/^#/, "").split("?")[0].toLowerCase();
            if (isStrictTeamHash(hashToken)) {
                return parseTeamCodeToken(hashToken);
            }
            source = `${parsed.hash || ""} ${parsed.search || ""} ${source}`;
        } catch (e) {
            source = input;
        }
    }
    const hashMatch = source.match(/#([a-z]{2,3}[1-4][a-z0-9]*)(?![a-z0-9])(?:\?q=[1-4])?/i);
    if (hashMatch) {
        return parseTeamCodeToken(hashMatch[1]);
    }
    const tokenMatch = source.match(/(?:^|[^a-z0-9])([a-z]{2,3}[1-4][a-z0-9]*)(?![a-z0-9])/i);
    if (tokenMatch) {
        return parseTeamCodeToken(tokenMatch[1]);
    }
    return parseTeamCodeToken(source);
}
function extractServerPrefix(value) {
    const input = String(value || "").trim().replace(/^#/, "");
    if (!input) return null;
    const match = input.match(/^([a-z]{2,3})/i);
    if (!match) return null;
    return match[1].toLowerCase();
}
function normalizeJoinPrefix(value) {
    const prefix = extractServerPrefix(value);
    if (!prefix) return null;
    const lettersOnly = String(prefix).toLowerCase().replace(/[^a-z]/g, "").slice(0, 3);
    if (lettersOnly.length < 2) return null;
    return lettersOnly;
}
function sanitizeWorkerError(value) {
    let msg = String(value || "").trim();
    if (!msg) return "";
    if (/no working proxy found/i.test(msg)) return "No working proxy found.";
    msg = msg.replace(/[A-Za-z]:\\[^\s`]+/g, "[path hidden]");
    msg = msg.replace(/proxies\.txt\/proxies/gi, "proxy list");
    msg = msg.replace(/https?:\/\/\S+/gi, "[url hidden]");
    return msg;
}
function getTfProxyProtocol() {
    const raw = String(tf_prot || "socks5").trim().toLowerCase();
    if (raw === "http" || raw === "https") return "http";
    if (raw === "socks" || raw === "socks5" || raw === "socks5h") return "socks5";
    return "socks5";
}
function expandProxyLine(line) {
    const raw = String(line || "").trim();
    if (!raw || raw.startsWith("#")) return [];
    const protocol = getTfProxyProtocol();
    if (/^socks5?:\/\//i.test(raw) || /^socks:\/\/?/i.test(raw)) {
        if (protocol !== "socks5") return [];
        const normalized = raw.replace(/^socks:\/\//i, "socks5://");
        return [ {
            type: "socks",
            url: normalized
        } ];
    }
    if (/^https?:\/\//i.test(raw)) {
        if (protocol !== "http") return [];
        return [ {
            type: "http",
            url: raw
        } ];
    }
    const parts = raw.split(":");
    if (parts.length >= 4) {
        const host = parts[0];
        const port = parts[1];
        const user = encodeURIComponent(parts[2]);
        const pass = encodeURIComponent(parts.slice(3).join(":"));
        if (protocol === "http") {
            return [ {
                type: "http",
                url: `http://${user}:${pass}@${host}:${port}`
            } ];
        }
        return [ {
            type: "socks",
            url: `socks5://${user}:${pass}@${host}:${port}`
        } ];
    }
    if (parts.length === 2) {
        const host = parts[0];
        const port = parts[1];
        if (protocol === "http") {
            return [ {
                type: "http",
                url: `http://${host}:${port}`
            } ];
        }
        return [ {
            type: "socks",
            url: `socks5://${host}:${port}`
        } ];
    }
    return [];
}
function getProxyFileCandidates() {
    const explicit = process.env.PROXIES_FILE ? path.resolve(process.env.PROXIES_FILE) : null;
    return [ explicit, path.resolve(__dirname, "..", "proxies.txt"), path.resolve(__dirname, "..", "proxies"), path.join(__dirname, "..", "workerfiles", "proxies.txt"), path.join(__dirname, "..", "workerfiles", "proxies") ].filter(Boolean);
}
function loadProxyCandidatesFromDisk() {
    const files = [];
    const proxies = [];
    const seen = new Set;
    const seenFiles = new Set;
    for (const file of getProxyFileCandidates()) {
        try {
            if (!fs.existsSync(file)) continue;
            const normalizedFile = path.resolve(file);
            if (!seenFiles.has(normalizedFile)) {
                seenFiles.add(normalizedFile);
                files.push(normalizedFile);
            }
            const lines = fs.readFileSync(file, "utf8").split(/\r?\n/);
            for (const line of lines) {
                const expanded = expandProxyLine(line);
                for (const proxy of expanded) {
                    const key = `${proxy.type}|${proxy.url}`;
                    if (seen.has(key)) continue;
                    seen.add(key);
                    proxies.push(proxy);
                }
            }
        } catch (e) {}
    }
    return {
        files: files,
        proxies: proxies
    };
}
const TELEMETRY_PATH = path.resolve(__dirname, "..", "logs", "lb_telemetry.jsonl");
function logTelemetry(entry) {
    try {
        const payload = Object.assign({ ts: Date.now() }, entry || {});
        fs.mkdirSync(path.dirname(TELEMETRY_PATH), { recursive: true });
        fs.appendFileSync(TELEMETRY_PATH, JSON.stringify(payload) + "\n");
    } catch (e) {
        // best effort
    }
}
const lbQueueByGuild = new Map;
const proxyHealth = new Map(); // key=url, value={ok:count, fail:count, score:number}
function recordProxyResult(proxy, ok) {
    if (!proxy || !proxy.url) return;
    const state = proxyHealth.get(proxy.url) || { ok: 0, fail: 0, score: 0 };
    if (ok) state.ok += 1; else state.fail += 1;
    state.score = state.ok - state.fail * 2;
    proxyHealth.set(proxy.url, state);
}
function chooseProxy(proxyPool) {
    if (!proxyPool || !proxyPool.length) return null;
    const scored = proxyPool.map(p => {
        const h = proxyHealth.get(p.url) || { score: 0 };
        return { proxy: p, score: h.score };
    });
    scored.sort((a, b) => b.score - a.score);
    return scored[0].proxy;
}
function getLbQueueKey(message) {
    return getScrapeScopeKey(message);
}
function getLbQueuePosition(key) {
    const state = lbQueueByGuild.get(key);
    if (!state) return 0;
    return state.queue.length + (state.running ? 1 : 0);
}
function enqueueLbTask(key, task) {
    let state = lbQueueByGuild.get(key);
    if (!state) {
        state = {
            running: false,
            queue: []
        };
        lbQueueByGuild.set(key, state);
    }
    return new Promise((resolve, reject) => {
        state.queue.push({
            task: task,
            resolve: resolve,
            reject: reject
        });
        runNextLbTask(key);
    });
}
async function runNextLbTask(key) {
    const state = lbQueueByGuild.get(key);
    if (!state || state.running) return;
    const item = state.queue.shift();
    if (!item) {
        lbQueueByGuild.delete(key);
        return;
    }
    state.running = true;
    try {
        const result = await item.task();
        item.resolve(result);
    } catch (err) {
        item.reject(err);
    } finally {
        state.running = false;
        if (!state.queue.length) {
            lbQueueByGuild.delete(key);
        } else {
            setImmediate(() => runNextLbTask(key));
        }
    }
}
const KNOWN_TANK_NAMES = [ "Basic", "Twin", "Double Twin", "Triple Shot", "Penta Shot", "Sniper", "Machine Gun", "Gunner", "Machine Gunner", "Nailgun", "Pincer", "Flank Guard", "Hexa Tank", "Octo Tank", "Cyclone", "HexaTrapper", "TriAngle", "Fighter", "Booster", "Falcon", "Bomber", "AutoTriAngle", "Surfer", "Auto3", "Auto4", "Auto5", "Mega3", "Banshee", "Trap Guard", "Buchwhacker", "Gunner Trapper", "Conqueror", "Bulwark", "TriTrapper", "Fortress", "Septatrapper", "Whirlwind", "Nona", "SeptaMachine", "Architect", "TripleTwin", "Director", "Overseer", "Underseer", "Cruiser", "Spawner", "Mega Spawner", "Ultra Spawner", "Director Drive", "Honcho", "Manager", "Foundry", "Top Banana", "Shopper", "Pounder", "Destroyer", "Annihilator", "Launcher", "Rocketeer", "Swarmer", "Twister", "Firework", "Leviathan", "Necromancer", "Mingler", "Automingler", "Browser", "Strider", "Sprayer", "Redistributor", "Spreadshot", "Gale", "Crackshot", "Healer", "Physician", "Captrapper", "Hognose", "Collision", "Impulse", "Catcher", "Jerk", "Slammer", "Peregrine", "Brisker" ];
const TANK_LOOKUP = new Map(KNOWN_TANK_NAMES.map(name => [ String(name).toLowerCase().replace(/[^a-z0-9]/g, ""), name ]));
const TANK_ALIAS_LOOKUP = new Map([ [ "captappe", "Captrapper" ], [ "captrappe", "Captrapper" ], [ "captrapper", "Captrapper" ], [ "hognos", "Hognose" ], [ "hognose", "Hognose" ], [ "hogn0s", "Hognose" ], [ "hogn0se", "Hognose" ], [ "brisskee", "Brisker" ], [ "briskee", "Brisker" ], [ "firewrok", "Firework" ], [ "firerowk", "Firework" ], [ "firerwok", "Firework" ] ]);
function normalizeTankToken(value) {
    return String(value || "").toLowerCase().replace(/[|!]/g, "l").replace(/0/g, "o").replace(/5/g, "s").replace(/[^a-z0-9]/g, "");
}
function levenshtein(a, b, maxDistance = 3) {
    const aLen = a.length;
    const bLen = b.length;
    if (!aLen) return bLen;
    if (!bLen) return aLen;
    if (Math.abs(aLen - bLen) > maxDistance) return maxDistance + 1;
    const prev = new Array(bLen + 1);
    const curr = new Array(bLen + 1);
    for (let j = 0; j <= bLen; j++) prev[j] = j;
    for (let i = 1; i <= aLen; i++) {
        curr[0] = i;
        let rowMin = curr[0];
        const aChar = a.charCodeAt(i - 1);
        for (let j = 1; j <= bLen; j++) {
            const cost = aChar === b.charCodeAt(j - 1) ? 0 : 1;
            curr[j] = Math.min(prev[j] + 1, curr[j - 1] + 1, prev[j - 1] + cost);
            if (curr[j] < rowMin) rowMin = curr[j];
        }
        if (rowMin > maxDistance) return maxDistance + 1;
        for (let j = 0; j <= bLen; j++) prev[j] = curr[j];
    }
    return prev[bLen];
}
function normalizeLeaderboardTankName(rawTank) {
    const text = String(rawTank || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    const normalized = normalizeTankToken(text);
    if (!normalized) return text;
    const alias = TANK_ALIAS_LOOKUP.get(normalized);
    if (alias) return alias;
    const direct = TANK_LOOKUP.get(normalized);
    if (direct) return direct;
    let bestName = "";
    let bestDistance = Number.MAX_SAFE_INTEGER;
    for (const [token, name] of TANK_LOOKUP.entries()) {
        const maxDistance = token.length >= 10 ? 3 : 2;
        const distance = levenshtein(normalized, token, maxDistance);
        if (distance < bestDistance) {
            bestDistance = distance;
            bestName = name;
        }
    }
    if (!bestName) return text;
    if (bestDistance <= 2) return bestName;
    if (bestDistance === 3 && normalized.length >= 10) return bestName;
    return text;
}
function normalizeLeaderboardDisplayName(rawName) {
    const text = String(rawName || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    const separators = [ " - ", " – ", " — " ];
    let splitAt = -1;
    let splitLen = 0;
    for (const separator of separators) {
        const idx = text.lastIndexOf(separator);
        if (idx > splitAt) {
            splitAt = idx;
            splitLen = separator.length;
        }
    }
    if (splitAt <= 0) {
        const standaloneTank = normalizeLeaderboardTankName(text);
        const isLikelyStandaloneTank = !/[\[\]{}()]/.test(text) && !/\d/.test(text) && text.length <= 24;
        if (isLikelyStandaloneTank && standaloneTank !== text) return standaloneTank;
        return text;
    }
    const player = text.slice(0, splitAt).trim();
    const tankRaw = text.slice(splitAt + splitLen).replace(/\s*[:\-–—]+\s*$/, "").trim();
    if (!player || !tankRaw) return text;
    if (tankRaw.length < 2 || tankRaw.length > 36) return text;
    const tank = normalizeLeaderboardTankName(tankRaw);
    return `${player} - ${tank}`;
}
function parseLeaderboardEntries(entries) {
    if (!Array.isArray(entries)) return [];
    const out = [];
    const LB_MIN_SCORE_VALUE = 1e3;
    const SCORE_PATTERN = "[0-9][0-9,]*(?:\\.[0-9]+)?(?:[kmb])?";
    const STRING_ENTRY_RE = new RegExp(`^\\s*(?:\\d+\\.\\s*)?(.+?)\\s*[:\\-\\u2013\\u2014]?\\s*(${SCORE_PATTERN})\\s*$`, "i");
    const isBlockedLeaderboardName = value => {
        const name = String(value || "").replace(/\s+/g, " ").trim();
        if (!name) return true;
        const lower = name.toLowerCase();
        if (name.length > 72) return true;
        if (lower === "score" || lower === "leaderboard") return true;
        if (lower.includes("want to connect with other members")) return true;
        if (lower.includes("join our public discord server")) return true;
        if (lower.includes("public discord server")) return true;
        if (lower.includes("discord.gg")) return true;
        if (lower.includes("community") && lower.includes("discord")) return true;
        if (lower.includes("join our") && lower.includes("discord")) return true;
        if (lower.includes("discord") && lower.includes("server") && lower.includes("join")) return true;
        if (/^(press|click|loading|connecting|reconnecting)\b/i.test(lower)) return true;
        if (lower.startsWith("coordinates:")) return true;
        if (lower.startsWith("you have ")) return true;
        if (lower.startsWith("the server was ")) return true;
        if (lower.startsWith("survived for ")) return true;
        if (/^(level|lvl)(?:\s|:|$)/i.test(lower)) return true;
        if (/\b(memory|mib|fps|ping|latency|rendering|performance|graphics)\b/i.test(lower)) return true;
        if (/\bo=\S+\b/i.test(lower) || /\bc=\S+\b/i.test(lower) || /\bt=\S+\b/i.test(lower)) return true;
        return false;
    };
    const parseScoreValue = rawScore => {
        const text = String(rawScore || "").trim().toLowerCase().replace(/,/g, "");
        const match = text.match(/^([0-9]+(?:\.[0-9]+)?)([kmb])?$/i);
        if (!match) return Number.NEGATIVE_INFINITY;
        const base = parseFloat(match[1]);
        if (!Number.isFinite(base)) return Number.NEGATIVE_INFINITY;
        const suffix = String(match[2] || "").toLowerCase();
        const multiplier = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1;
        return base * multiplier;
    };
    for (let i = 0; i < entries.length; i++) {
        const item = entries[i];
        if (!item) continue;
        if (typeof item === "string") {
            const text = String(item).trim();
            const match = text.match(STRING_ENTRY_RE);
            if (!match) continue;
            const name = normalizeLeaderboardDisplayName(match[1].trim());
            const lowerName = name.toLowerCase();
            if (!name || lowerName === "score" || lowerName === "leaderboard" || isBlockedLeaderboardName(name)) continue;
            const score = match[2].trim();
            const scoreValue = parseScoreValue(score);
            if (!Number.isFinite(scoreValue)) continue;
            if (scoreValue < LB_MIN_SCORE_VALUE) continue;
            out.push({
                rank: Number.MAX_SAFE_INTEGER,
                name: name,
                score: score,
                scoreValue: scoreValue
            });
            continue;
        }
        if (typeof item === "object") {
            const name = normalizeLeaderboardDisplayName(String(item.name || "").trim());
            const score = String(item.score || "").trim();
            const lowerName = name.toLowerCase();
            if (lowerName === "score" || lowerName === "leaderboard" || isBlockedLeaderboardName(name)) continue;
            if (!name || !score) continue;
            const scoreValue = parseScoreValue(score);
            if (!Number.isFinite(scoreValue)) continue;
            if (scoreValue < LB_MIN_SCORE_VALUE) continue;
            const rank = Number.isInteger(item.rank) && item.rank > 0 ? item.rank : Number.MAX_SAFE_INTEGER;
            out.push({
                rank: rank,
                name: name,
                score: score,
                scoreValue: scoreValue
            });
        }
    }
    const deduped = new Map;
    for (const entry of out) {
        const key = String(entry.name || "").toLowerCase();
        const existing = deduped.get(key);
        if (!existing || entry.scoreValue > existing.scoreValue) deduped.set(key, entry);
    }
    return Array.from(deduped.values()).sort((a, b) => {
        if (a.scoreValue !== b.scoreValue) return b.scoreValue - a.scoreValue;
        const aRanked = Number.isInteger(a.rank) && a.rank > 0 && a.rank !== Number.MAX_SAFE_INTEGER;
        const bRanked = Number.isInteger(b.rank) && b.rank > 0 && b.rank !== Number.MAX_SAFE_INTEGER;
        if (aRanked && bRanked && a.rank !== b.rank) return a.rank - b.rank;
        if (aRanked !== bRanked) return aRanked ? -1 : 1;
        return String(a.name || "").localeCompare(String(b.name || ""));
    }).slice(0, 10).map((entry, index) => ({
        rank: index + 1,
        name: entry.name,
        score: entry.score,
        line: `${index + 1}. ${entry.name}: ${entry.score}`
    }));
}
async function safeEditMessage(message, payload) {
    try {
        await message.edit(payload);
        return true;
    } catch (e) {
        return false;
    }
}
function formatLeaderboardLines(entries) {
    const cleaned = parseLeaderboardEntries(entries);
    if (!cleaned.length) return "";
    return cleaned.slice(0, 10).map((entry, idx) => `${idx + 1}. ${entry.name}: ${entry.score}`).join("\n");
}
function parseScoreMagnitude(rawScore) {
    const text = String(rawScore || "").trim().toLowerCase().replace(/,/g, "");
    const match = text.match(/^([0-9]+(?:\.[0-9]+)?)([kmb])?$/i);
    if (!match) return Number.NEGATIVE_INFINITY;
    const base = parseFloat(match[1]);
    if (!Number.isFinite(base)) return Number.NEGATIVE_INFINITY;
    const suffix = String(match[2] || "").toLowerCase();
    const multiplier = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1;
    return base * multiplier;
}
function mergeLeaderboardCandidates(currentEntries, candidateEntries) {
    const combinedRaw = [];
    for (const entry of Array.isArray(currentEntries) ? currentEntries : []) {
        if (!entry || !entry.name || !entry.score) continue;
        combinedRaw.push({
            name: entry.name,
            score: entry.score,
            rank: Number.isInteger(entry.rank) ? entry.rank : Number.MAX_SAFE_INTEGER
        });
    }
    for (const entry of Array.isArray(candidateEntries) ? candidateEntries : []) {
        if (!entry || !entry.name || !entry.score) continue;
        combinedRaw.push({
            name: entry.name,
            score: entry.score,
            rank: Number.isInteger(entry.rank) ? entry.rank : Number.MAX_SAFE_INTEGER
        });
    }
    return parseLeaderboardEntries(combinedRaw);
}
function getLeaderboardQuality(entries) {
    const rows = Array.isArray(entries) ? entries : [];
    let totalScore = 0;
    for (const row of rows) {
        const value = parseScoreMagnitude(row && row.score);
        if (Number.isFinite(value) && value > 0) totalScore += value;
    }
    return {
        count: rows.length,
        totalScore: totalScore
    };
}
function isBetterLeaderboard(nextEntries, currentEntries) {
    const next = getLeaderboardQuality(nextEntries);
    const current = getLeaderboardQuality(currentEntries);
    if (next.count !== current.count) return next.count > current.count;
    if (next.totalScore !== current.totalScore) return next.totalScore > current.totalScore;
    const nextKey = (Array.isArray(nextEntries) ? nextEntries : []).map(entry => `${entry && entry.name || ""}:${entry && entry.score || ""}`).join("|");
    const currentKey = (Array.isArray(currentEntries) ? currentEntries : []).map(entry => `${entry && entry.name || ""}:${entry && entry.score || ""}`).join("|");
    return nextKey !== currentKey;
}
function pickPreferredAttemptResult(current, candidate) {
    if (!candidate) return current || null;
    if (!current) return candidate;
    const currentCount = Array.isArray(current.entries) ? current.entries.length : 0;
    const candidateCount = Array.isArray(candidate.entries) ? candidate.entries.length : 0;
    if (candidateCount !== currentCount) return candidateCount > currentCount ? candidate : current;
    const currentOk = Boolean(current.ok);
    const candidateOk = Boolean(candidate.ok);
    if (candidateOk !== currentOk) return candidateOk ? candidate : current;
    const currentDuration = Number.isFinite(current.durationMs) ? current.durationMs : Number.MAX_SAFE_INTEGER;
    const candidateDuration = Number.isFinite(candidate.durationMs) ? candidate.durationMs : Number.MAX_SAFE_INTEGER;
    if (candidateDuration !== currentDuration) return candidateDuration < currentDuration ? candidate : current;
    const currentError = String(current.error || "");
    const candidateError = String(candidate.error || "");
    if (!currentError && candidateError) return current;
    if (!candidateError && currentError) return candidate;
    return current;
}
function sanitizeServerStatusLine(value, max = 260) {
    const text = String(value || "").replace(/\s+/g, " ").trim();
    if (!text) return "";
    return text.length > max ? text.slice(0, max - 3).trimEnd() + "..." : text;
}
function normalizeMsptText(value) {
    const text = sanitizeServerStatusLine(value || "", 80);
    if (!text) return "";
    const ratioMatch = text.match(/\b(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)(?:\s*mspt)?\b/i);
    if (ratioMatch) {
        return `${ratioMatch[1]}/${ratioMatch[2]} mspt`;
    }
    const numberMatch = text.match(/\b(\d+(?:\.\d+)?)(?:\s*mspt)?\b/i);
    if (numberMatch && /\bmspt\b/i.test(text)) {
        return `${numberMatch[1]} mspt`;
    }
    return /\bmspt\b/i.test(text) ? text.replace(/\bmspt\b/gi, "mspt") : "";
}
function isRatioMspt(value) {
    return /\b\d+(?:\.\d+)?\/\d+(?:\.\d+)?\s+mspt\b/i.test(String(value || ""));
}
function normalizeServerStats(value) {
    if (!value || typeof value !== "object") return {};
    const out = {};
    const arenaStatus = sanitizeServerStatusLine(value.arenaStatus || value.arena || value.arenaLine || "");
    if (arenaStatus) out.arenaStatus = arenaStatus;
    const mspt = normalizeMsptText(value.mspt || value.msptLine || "");
    if (mspt) out.mspt = mspt;
    const playersHud = sanitizeServerStatusLine(value.playersHud || value.players || "", 40).toLowerCase();
    if (playersHud) out.playersHud = playersHud;
    if (Number.isFinite(value.playersOnline)) out.playersOnline = Math.max(0, Math.floor(Number(value.playersOnline)));
    return out;
}
function mergeServerStats(current, incoming) {
    const base = normalizeServerStats(current);
    const next = normalizeServerStats(incoming);
    if (next.arenaStatus && (!base.arenaStatus || next.arenaStatus.length > base.arenaStatus.length)) {
        base.arenaStatus = next.arenaStatus;
    }
    const baseMsptIsRatio = isRatioMspt(base.mspt);
    const nextMsptIsRatio = isRatioMspt(next.mspt);
    if (next.mspt && (!base.mspt || baseMsptIsRatio && !nextMsptIsRatio || !baseMsptIsRatio && !nextMsptIsRatio && base.mspt !== next.mspt)) {
        base.mspt = next.mspt;
    }
    if (next.playersHud && !base.playersHud) {
        base.playersHud = next.playersHud;
    }
    if (Number.isFinite(next.playersOnline) && (!Number.isFinite(base.playersOnline) || next.playersOnline > base.playersOnline)) {
        base.playersOnline = next.playersOnline;
    }
    return base;
}
function parseArenaStatusTimes(arenaStatus) {
    const text = sanitizeServerStatusLine(arenaStatus || "");
    if (!text) return null;
    const match = text.match(/arena has been open for\s+(.+?)\s+and can remain open for at most\s+(.+?)(?:[.!]| note that|$)/i);
    if (!match) return null;
    const openFor = sanitizeServerStatusLine(match[1] || "", 80);
    const closingIn = sanitizeServerStatusLine(match[2] || "", 80);
    if (!openFor || !closingIn) return null;
    return {
        openFor: openFor,
        closingIn: closingIn
    };
}
function formatServerStatsLines(serverStats) {
    const stats = normalizeServerStats(serverStats);
    const lines = [];
    const arenaTimes = parseArenaStatusTimes(stats.arenaStatus);
    if (arenaTimes) {
        lines.push(`Open for: \`${arenaTimes.openFor}\``);
        lines.push(`Closing in: \`${arenaTimes.closingIn}\``);
    } else if (stats.arenaStatus) {
        lines.push(`Status Text: \`${stats.arenaStatus}\``);
    }
    if (stats.mspt) lines.push(`MSPT: \`${stats.mspt}\``);
    return lines;
}
function extractServerStatsFromStdoutChunk(chunk, currentStats) {
    const text = String(chunk || "");
    if (!text.trim()) return {};
    const lines = text.split(/\r?\n/).map(line => line.replace(/\s+/g, " ").trim()).filter(Boolean);
    if (!lines.length) return {};
    const stats = {};
    let existingArena = sanitizeServerStatusLine(currentStats && currentStats.arenaStatus || "");
    let pendingMsptRatio = "";
    const currentMspt = normalizeMsptText(currentStats && currentStats.mspt || "");
    const currentRatioMatch = currentMspt.match(/\b(\d+(?:\.\d+)?)\/(\d+(?:\.\d+)?)\s+mspt\b/i);
    if (currentRatioMatch) pendingMsptRatio = `${currentRatioMatch[1]}/${currentRatioMatch[2]}`;
    for (const rawLine of lines) {
        const line = rawLine.replace(/^\[[^\]]+\]\s*/g, "").trim();
        if (!line) continue;
        const lower = line.toLowerCase();
        if (lower.includes("arena has been open for") && lower.includes("can remain open for")) {
            const arenaLine = sanitizeServerStatusLine(line);
            if (arenaLine) {
                existingArena = arenaLine;
                stats.arenaStatus = existingArena;
            }
        } else if (lower.includes("arena may close sooner")) {
            const noteLine = sanitizeServerStatusLine(line);
            if (noteLine) {
                const combined = existingArena ? sanitizeServerStatusLine(`${existingArena} ${noteLine}`) : noteLine;
                existingArena = combined;
                stats.arenaStatus = combined;
            }
        }
        const ratioMatch = line.match(/\b(\d+(?:\.\d+)?)\s*\/\s*(\d+(?:\.\d+)?)\b/);
        if (ratioMatch) {
            pendingMsptRatio = `${ratioMatch[1]}/${ratioMatch[2]}`;
        }
        const msptText = normalizeMsptText(line);
        if (msptText) {
            stats.mspt = msptText;
        } else if (/^mspt$/i.test(line) && pendingMsptRatio) {
            stats.mspt = `${pendingMsptRatio} mspt`;
        }
        const playersMatch = line.match(/\b(\d+\s+players)\b/i);
        if (playersMatch) {
            const playersText = String(playersMatch[1] || "").toLowerCase().replace(/\s+/g, " ").trim();
            if (playersText) stats.playersHud = playersText;
        }
    }
    return stats;
}
async function fetchServerRuntimeStats(serverPrefix) {
    const normalizedPrefix = normalizeJoinPrefix(serverPrefix);
    if (!normalizedPrefix) return {};
    const endpoints = [ "https://arras.io/status", "https://ak7oqfc2u4qqcu6i-c.uvwx.xyz:8443/2222/status", "https://qrp6ujau11f36bnm-c.uvwx.xyz:8443/2222/status", "https://t4mebdah2ksfasgi-c.uvwx.xyz:8443/2222/status", "https://kvn3s3cpcdk4fl6j-c.uvwx.xyz:8443/2222/status" ];
    for (const endpoint of endpoints) {
        try {
            const response = await fetch(endpoint, {
                method: "GET",
                headers: {
                    accept: "application/json"
                },
                cache: "no-store"
            });
            if (!response || !response.ok) continue;
            const bodyText = await response.text();
            if (!bodyText || !bodyText.trim()) continue;
            let payload = null;
            try {
                payload = JSON.parse(bodyText);
            } catch (e) {
                continue;
            }
            if (!payload || typeof payload !== "object" || payload.ok !== true) continue;
            const status = payload.status;
            if (!status || typeof status !== "object") continue;
            let entry = status[normalizedPrefix];
            if (!entry || typeof entry !== "object") {
                const values = Object.values(status);
                entry = values.find(item => item && typeof item === "object" && String(item.name || "").toLowerCase() === normalizedPrefix) || null;
            }
            if (!entry || typeof entry !== "object") continue;
            if (entry.online === false) {
                return {
                    playersOnline: 0,
                    mspt: Number.isFinite(Number(entry.mspt)) ? `${Number(entry.mspt)} mspt` : ""
                };
            }
            const clients = Number(entry.clients);
            const playersOnline = !Number.isFinite(clients) || clients < 0 ? 0 : Math.floor(clients);
            const msptValue = Number(entry.mspt);
            const mspt = Number.isFinite(msptValue) ? `${msptValue} mspt` : "";
            return {
                playersOnline: playersOnline,
                mspt: mspt
            };
        } catch (e) {}
    }
    return {};
}
function createProgressEmbed({serverPrefix: serverPrefix, workerCount: workerCount, attempt: attempt, totalAttempts: totalAttempts, bestCount: bestCount, statusText: statusText}) {
    return (new EmbedBuilder).setTitle("Arras Server Stat Fetcher").setDescription(`Server Prefix: \`${serverPrefix}\`\n` + `Workers: \`${workerCount}\`\n` + `Attempt: \`${attempt}/${totalAttempts}\`\n` + `Best Result: \`${bestCount}\` entries\n` + `Status: \`${statusText}\``).setColor(16753920).setTimestamp();
}
function runLeaderboardWorkerAttempt({headlessPath: headlessPath, queueKey: queueKey, serverPrefix: serverPrefix, proxy: proxy, attemptTimeoutMs: attemptTimeoutMs, workerTimeoutMs: workerTimeoutMs, onStdout: onStdout, onProgress: onProgress, onProcess: onProcess}) {
    return new Promise(resolve => {
        const startedAt = Date.now();
        const botProcess = fork(headlessPath, [], {
            silent: false,
            stdio: "pipe",
            env: {
                ...process.env,
                IS_WORKER: "true",
                PROXIES_FILE: path.resolve(__dirname, "..", "proxies.txt"),
                MAX_PROXY_CHECKS: String(process.env.MAX_PROXY_CHECKS || "200"),
                USE_LOCAL_CLIENT: "false",
                USE_SCRIPT_CACHE: "false",
                USE_LOCAL_WASM: "false"
            }
        });
        registerWorker(queueKey, botProcess);
        if (typeof onProcess === "function") {
            try {
                onProcess(botProcess);
            } catch (e) {}
        }
        let finished = false;
        let lastWorkerError = "";
        let timer = null;
        let timerExtendedAfterOpen = false;
        let bestProgressEntries = [];
        let websocketOpened = false;
        let lastPlayersOnline = null;
        let lastServerStats = {};
        const updateServerStats = stats => {
            lastServerStats = mergeServerStats(lastServerStats, stats);
        };
        const armAttemptTimer = timeoutMs => {
            if (timer) clearTimeout(timer);
            timer = setTimeout(() => {
                finish({
                    ok: false,
                    entries: bestProgressEntries,
                    error: "Leaderboard fetch timed out.",
                    source: "attempt-timeout"
                });
            }, timeoutMs);
        };
        const extendAttemptTimerAfterOpen = source => {
            if (finished || timerExtendedAfterOpen) return;
            timerExtendedAfterOpen = true;
            const extraMs = Math.max(2500, Math.min(8e3, workerTimeoutMs + 1800));
            armAttemptTimer(extraMs);
            console.log(`[LB] Extended worker timer after ${source} by ${extraMs}ms for ${serverPrefix}`);
        };
        const finish = payload => {
            if (finished) return;
            finished = true;
            unregisterWorker(queueKey, botProcess);
            if (timer) clearTimeout(timer);
            try {
                botProcess.kill("SIGTERM");
            } catch (e) {}
            const parsedEntries = parseLeaderboardEntries(payload && Array.isArray(payload.entries) && payload.entries.length > 0 ? payload.entries : bestProgressEntries);
            const resolvedPlayersOnline = Number.isFinite(payload && payload.playersOnline) ? Math.max(0, Math.floor(payload.playersOnline)) : Number.isFinite(lastPlayersOnline) ? Math.max(0, Math.floor(lastPlayersOnline)) : null;
            const resolvedServerStats = mergeServerStats(lastServerStats, payload && payload.serverStats ? payload.serverStats : null);
            resolve({
                ok: Boolean(payload && payload.ok),
                entries: parsedEntries,
                source: String(payload && payload.source || "worker"),
                error: payload && payload.error ? String(payload.error) : "",
                playersOnline: resolvedPlayersOnline,
                serverStats: resolvedServerStats,
                websocketOpened: websocketOpened,
                durationMs: Date.now() - startedAt
            });
        };
        if (botProcess.stdout) {
            botProcess.stdout.on("data", data => {
                const text = data.toString();
                console.log(`[BOT] ${text}`);
                if (/Websocket Opened/i.test(text)) {
                    websocketOpened = true;
                    extendAttemptTimerAfterOpen("stdout-websocket-open");
                }
                if (typeof onStdout === "function") {
                    onStdout(text);
                }
            });
        }
        if (botProcess.stderr) {
            botProcess.stderr.on("data", data => {
                console.error(`[BOT-ERR] ${data.toString()}`);
            });
        }
        botProcess.on("message", msg => {
            if (!msg || typeof msg !== "object") return;
            if (msg.type === "websocket_open") {
                websocketOpened = true;
                extendAttemptTimerAfterOpen("ipc-websocket-open");
                return;
            }
            if (msg.type === "spawned") {
                extendAttemptTimerAfterOpen("ipc-spawned");
                return;
            }
            if (msg.type === "leaderboard_progress") {
                if (Number.isFinite(msg.playersOnline)) {
                    lastPlayersOnline = Number(msg.playersOnline);
                }
                updateServerStats(msg.serverStats);
                const progressEntries = parseLeaderboardEntries(msg.entries);
                if (isBetterLeaderboard(progressEntries, bestProgressEntries)) {
                    bestProgressEntries = progressEntries;
                    if (typeof onProgress === "function") {
                        onProgress(progressEntries, String(msg.source || "worker-progress"), msg.serverStats || null);
                    }
                } else if (typeof onProgress === "function" && msg.serverStats) {
                    onProgress(bestProgressEntries, String(msg.source || "worker-progress"), msg.serverStats || null);
                }
                return;
            }
            if (msg.type === "leaderboard_detected") {
                finish({
                    ok: true,
                    entries: msg.entries,
                    source: String(msg.source || "worker"),
                    playersOnline: msg.playersOnline,
                    serverStats: msg.serverStats || null
                });
                return;
            }
            if (msg.type === "bot_error") {
                lastWorkerError = String(msg.error || "unknown error");
                finish({
                    ok: false,
                    error: lastWorkerError,
                    entries: bestProgressEntries,
                    source: "bot-error",
                    playersOnline: msg.playersOnline,
                    serverStats: msg.serverStats || null
                });
            }
        });
        botProcess.on("error", err => {
            finish({
                ok: false,
                error: err && err.message ? err.message : "Worker process error",
                entries: bestProgressEntries,
                source: "process-error"
            });
        });
        botProcess.on("exit", (code, signal) => {
            if (!finished) {
                const suffix = [ code, signal ].filter(v => v !== null && v !== undefined).join("/");
                finish({
                    ok: false,
                    entries: bestProgressEntries,
                    error: lastWorkerError || `Worker exited (${suffix || "unknown"})`,
                    source: "worker-exit"
                });
            }
        });
        botProcess.send({
            type: "start",
            config: {
                squadId: normalizeJoinPrefix(serverPrefix) || serverPrefix,
                proxy: proxy || null,
                scanMode: "leaderboard",
                leaderboardTimeoutMs: workerTimeoutMs
            }
        });
        armAttemptTimer(attemptTimeoutMs);
    });
}
async function executeLeaderboardCommand(message, args) {
    const queueKey = getLbQueueKey(message);
    const stopSnapshot = captureStopSnapshot(queueKey);
    const ahead = getLbQueuePosition(queueKey);
    if (ahead > 0) {
        await message.reply(`Leaderboard scan queued for this server. Queue position: \`${ahead + 1}\`.`);
    }
    return enqueueLbTask(queueKey, async () => {
        if (isStopRequested(queueKey, stopSnapshot)) {
            await message.reply("Leaderboard scan cancelled by `?st`.");
            return;
        }
        if (ahead > 0) {
            await message.reply("Your queued leaderboard scan is now starting.");
        }
        const rawInput = args.length > 0 ? args[0] : "";
        if (!rawInput) {
            await message.reply("Usage: `?svstat <serverPrefix>`");
            return;
        }
        let gameHash = String(rawInput || "").trim();
        const extracted = extractTeamCode(gameHash);
        if (extracted && extracted.hash) {
            gameHash = extracted.hash;
        }
        gameHash = gameHash.replace(/^#/, "");
        const serverPrefix = normalizeJoinPrefix(gameHash);
        if (!serverPrefix) {
            await message.reply("Invalid server format. Example: `?svstat ca`");
            return;
        }
        if (serverPrefix.length === 3) {
            await message.reply("3-letter server prefixes are blocked for `?svstat`. No scan started and no bots were spawned.");
            return;
        }
        const headlessPath = path.join(__dirname, "..", "workerfiles", "headless.js");
        const selectedProxy = null;
        const totalAttempts = 1;
        const botMsg = await message.reply({
            embeds: [ createProgressEmbed({
                serverPrefix: serverPrefix,
                workerCount: LB_WORKERS,
                attempt: 0,
                totalAttempts: totalAttempts,
                bestCount: 0,
                statusText: "Starting.."
            }) ]
        });
        let bestEntries = [];
        let bestServerStats = {};
        let lastError = "Leaderboard not found.";
        let lastEditAt = 0;
        let currentStatus = "Preparing worker...";
        let currentAttempt = 0;
        const maybeUpdateProgress = async (force = false) => {
            const now = Date.now();
            if (!force && now - lastEditAt < LB_PROGRESS_EDIT_THROTTLE_MS) return;
            lastEditAt = now;
            await safeEditMessage(botMsg, {
                embeds: [ createProgressEmbed({
                    serverPrefix: serverPrefix,
                    workerCount: LB_WORKERS,
                    attempt: currentAttempt,
                    totalAttempts: totalAttempts,
                    bestCount: bestEntries.length,
                    statusText: currentStatus
                }) ]
            });
        };
        const applyBestCandidate = candidateEntries => {
            const parsed = parseLeaderboardEntries(candidateEntries);
            if (!parsed.length) return false;
            const merged = mergeLeaderboardCandidates(bestEntries, parsed);
            if (!merged.length) return false;
            if (isBetterLeaderboard(merged, bestEntries)) {
                bestEntries = merged;
                return true;
            }
            return false;
        };
        const applyServerStats = stats => {
            const merged = mergeServerStats(bestServerStats, stats);
            const changed = JSON.stringify(merged) !== JSON.stringify(bestServerStats);
            bestServerStats = merged;
            return changed;
        };
        currentAttempt = 1;
        const adaptive = computeAdaptiveTimeouts(selectedProxy ? (proxyHealth.get(selectedProxy.url) || {}).score || 0 : 0, getLbQueuePosition(queueKey));
        currentStatus = `Connecting and scraping leaderboard with ${LB_WORKERS} workers...`;
        await maybeUpdateProgress(true);
        if (isStopRequested(queueKey, stopSnapshot)) {
            await safeEditMessage(botMsg, {
                embeds: [ (new EmbedBuilder).setTitle("Arras Server Stat Fetcher").setDescription(`Server Prefix: \`${serverPrefix}\`\n` + "Status: `Stopped`\n" + "Reason: `Stopped by ?st command.`\n" + "Attempts: `1`").setColor(15158332).setTimestamp() ]
            });
            return;
        }
        let attemptResult = null;
        let runOk = false;
        let telemetryWorkers = LB_WORKERS;
        let telemetryAttemptTimeout = adaptive.attempt;
        let telemetryWorkerTimeout = adaptive.worker;
        const runWorkerWave = async ({waveLabel: waveLabel, workerCount: workerCount, attemptTimeoutMs: attemptTimeoutMs, workerTimeoutMs: workerTimeoutMs}) => {
            const waveStartedAt = Date.now();
            const activeWorkerProcesses = new Set;
            const killWorkerProcess = proc => {
                if (!proc) return;
                try {
                    proc.kill("SIGTERM");
                } catch (e) {}
            };
            const killAllWorkerProcesses = () => {
                for (const proc of activeWorkerProcesses) {
                    killWorkerProcess(proc);
                }
                activeWorkerProcesses.clear();
            };
            let settleTimer = null;
            let combinedSettled = false;
            let combinedReadyResolve = null;
            const clearSettleTimer = () => {
                if (!settleTimer) return;
                clearTimeout(settleTimer);
                settleTimer = null;
            };
            const buildCombinedWaveResult = source => ({
                ok: bestEntries.length >= LB_REQUIRED_ENTRIES,
                entries: bestEntries.slice(0, 10),
                source: source,
                error: bestEntries.length >= LB_REQUIRED_ENTRIES ? "" : `Incomplete leaderboard (${bestEntries.length}/${LB_REQUIRED_ENTRIES})`,
                serverStats: bestServerStats,
                durationMs: Date.now() - waveStartedAt
            });
            const combinedReady = new Promise(resolve => {
                combinedReadyResolve = resolve;
            });
            const scheduleCombinedResolve = source => {
                if (combinedSettled || bestEntries.length < LB_REQUIRED_ENTRIES) return;
                clearSettleTimer();
                const delayMs = bestServerStats.arenaStatus ? 260 : 850;
                settleTimer = setTimeout(() => {
                    settleTimer = null;
                    if (combinedSettled || bestEntries.length < LB_REQUIRED_ENTRIES) return;
                    combinedSettled = true;
                    if (typeof combinedReadyResolve === "function") {
                        combinedReadyResolve({
                            workerIndex: -1,
                            combined: true,
                            result: buildCombinedWaveResult(`${waveLabel}:combined-progress`)
                        });
                    }
                }, delayMs);
            };
            const workerResults = new Array(workerCount).fill(null);
            const workerPromises = Array.from({ length: workerCount }, (_, workerIndex) => runLeaderboardWorkerAttempt({
                headlessPath: headlessPath,
                queueKey: queueKey,
                serverPrefix: serverPrefix,
                proxy: selectedProxy,
                attemptTimeoutMs: Math.max(2800, attemptTimeoutMs - workerIndex * 130),
                workerTimeoutMs: Math.max(2400, workerTimeoutMs - workerIndex * 100),
                onProcess: proc => {
                    activeWorkerProcesses.add(proc);
                },
                onStdout: text => {
                    const lower = String(text || "").toLowerCase();
                    if (lower.includes("socket opened")) {
                        currentStatus = `Socket opened. Reading leaderboard (${waveLabel} w${workerIndex + 1})...`;
                        maybeUpdateProgress();
                    } else if (lower.includes("closed")) {
                        currentStatus = `Socket closed. Finalizing snapshot (${waveLabel} w${workerIndex + 1})...`;
                        maybeUpdateProgress();
                    }
                    const stdoutStats = extractServerStatsFromStdoutChunk(text, bestServerStats);
                    if (applyServerStats(stdoutStats)) {
                        maybeUpdateProgress();
                    }
                },
                onProgress: (progressEntries, source, serverStats) => {
                    const entriesChanged = applyBestCandidate(progressEntries);
                    const statsChanged = applyServerStats(serverStats);
                    if (entriesChanged || statsChanged) {
                        currentStatus = `Detected ${bestEntries.length} entries (${waveLabel} w${workerIndex + 1}:${source}).`;
                        maybeUpdateProgress();
                    }
                    if (entriesChanged || statsChanged) {
                        scheduleCombinedResolve(`w${workerIndex + 1}:${source}`);
                    }
                }
            }).then(result => {
                workerResults[workerIndex] = result;
                return {
                    workerIndex: workerIndex,
                    result: result
                };
            }));
            let waveResult = null;
            let waveRunOk = false;
            const pendingRaces = new Map;
            for (let workerIndex = 0; workerIndex < workerPromises.length; workerIndex++) {
                const tagged = workerPromises[workerIndex].then(payload => ({
                    workerIndex: payload.workerIndex,
                    result: payload.result
                }));
                pendingRaces.set(workerIndex, tagged);
            }
            while (pendingRaces.size) {
                if (isStopRequested(queueKey, stopSnapshot)) {
                    currentStatus = "Stopping workers by ?st command...";
                    await maybeUpdateProgress(true);
                    killAllWorkerProcesses();
                    waveResult = {
                        ok: false,
                        entries: bestEntries,
                        source: "st-command",
                        error: "Stopped by ?st command.",
                        durationMs: Date.now() - waveStartedAt
                    };
                    break;
                }
                const racePool = Array.from(pendingRaces.values());
                if (!combinedSettled) racePool.push(combinedReady);
                const raced = await Promise.race(racePool);
                if (!raced || !Number.isInteger(raced.workerIndex)) break;
                if (raced.combined) {
                    waveResult = raced.result;
                    waveRunOk = true;
                    currentStatus = `Captured all ${LB_REQUIRED_ENTRIES} entries (${waveLabel}).`;
                    await maybeUpdateProgress(true);
                    killAllWorkerProcesses();
                    break;
                }
                pendingRaces.delete(raced.workerIndex);
                if (raced.result && Array.isArray(raced.result.entries)) {
                    if (applyBestCandidate(raced.result.entries)) {
                        scheduleCombinedResolve(`w${raced.workerIndex + 1}:result`);
                    }
                }
                if (raced.result && raced.result.serverStats) {
                    if (applyServerStats(raced.result.serverStats)) {
                        scheduleCombinedResolve(`w${raced.workerIndex + 1}:stats`);
                    }
                }
                if (raced.result && raced.result.ok && Array.isArray(raced.result.entries) && raced.result.entries.length >= LB_REQUIRED_ENTRIES) {
                    waveResult = buildCombinedWaveResult(`${waveLabel}:worker-${raced.workerIndex + 1}`);
                    waveRunOk = true;
                    currentStatus = `Worker ${raced.workerIndex + 1} captured all ${LB_REQUIRED_ENTRIES} entries (${waveLabel}).`;
                    await maybeUpdateProgress(true);
                    killAllWorkerProcesses();
                    break;
                }
            }
            if (!waveResult) {
                const finishedResults = workerResults.filter(Boolean);
                const finishedBest = finishedResults.sort((a, b) => {
                    const aCount = Array.isArray(a.entries) ? a.entries.length : 0;
                    const bCount = Array.isArray(b.entries) ? b.entries.length : 0;
                    if (aCount !== bCount) return bCount - aCount;
                    const aOk = Boolean(a.ok);
                    const bOk = Boolean(b.ok);
                    if (aOk !== bOk) return bOk - aOk;
                    const aDur = Number.isFinite(a.durationMs) ? a.durationMs : Number.MAX_SAFE_INTEGER;
                    const bDur = Number.isFinite(b.durationMs) ? b.durationMs : Number.MAX_SAFE_INTEGER;
                    return aDur - bDur;
                })[0] || {
                    ok: false,
                    entries: [],
                    error: "No worker result.",
                    durationMs: 0
                };
                const combinedResult = buildCombinedWaveResult(`${waveLabel}:combined-final`);
                if (combinedResult.ok && (!finishedBest.ok || isBetterLeaderboard(combinedResult.entries, finishedBest.entries))) {
                    waveResult = combinedResult;
                } else if (!finishedBest.ok && isBetterLeaderboard(combinedResult.entries, finishedBest.entries)) {
                    waveResult = combinedResult;
                } else {
                    waveResult = finishedBest;
                }
            }
            await Promise.allSettled(workerPromises);
            clearSettleTimer();
            killAllWorkerProcesses();
            if (waveResult && Array.isArray(waveResult.entries)) {
                applyBestCandidate(waveResult.entries);
            }
            if (waveResult && waveResult.serverStats) {
                applyServerStats(waveResult.serverStats);
            }
            waveRunOk = waveRunOk || bestEntries.length >= LB_REQUIRED_ENTRIES || Boolean(waveResult.ok) && Array.isArray(waveResult.entries) && waveResult.entries.length >= LB_REQUIRED_ENTRIES;
            return {
                runOk: waveRunOk,
                result: waveResult
            };
        };
        const waveOutcome = await runWorkerWave({
            waveLabel: "attempt-1",
            workerCount: LB_WORKERS,
            attemptTimeoutMs: adaptive.attempt,
            workerTimeoutMs: adaptive.worker
        });
        attemptResult = pickPreferredAttemptResult(attemptResult, waveOutcome.result);
        runOk = runOk || Boolean(waveOutcome.runOk);
        if (!attemptResult) {
            attemptResult = {
                ok: false,
                entries: bestEntries,
                error: "No worker result.",
                durationMs: 0
            };
        }
        bestServerStats = mergeServerStats(bestServerStats, attemptResult.serverStats || null);
        const runtimeStats = await fetchServerRuntimeStats(serverPrefix);
        bestServerStats = mergeServerStats(bestServerStats, runtimeStats);
        if (selectedProxy) recordProxyResult(selectedProxy, runOk);
        logTelemetry({
            type: "lb_run",
            serverPrefix: serverPrefix,
            backend: "workerfiles/headless.js",
            proxy: selectedProxy ? selectedProxy.url : "direct",
            ok: runOk,
            workers: telemetryWorkers,
            entries: bestEntries.length,
            durationMs: attemptResult.durationMs || 0,
            timeoutMs: telemetryAttemptTimeout,
            workerTimeoutMs: telemetryWorkerTimeout,
            source: attemptResult.source || "worker"
        });
        if (attemptResult.error) {
            lastError = attemptResult.error;
        }
        if (!runOk && bestEntries.length > 0 && bestEntries.length < LB_REQUIRED_ENTRIES && !attemptResult.error) {
            lastError = `Incomplete leaderboard (${bestEntries.length}/${LB_REQUIRED_ENTRIES})`;
        }
        const statsPlayersOnline = Number.isFinite(bestServerStats.playersOnline) ? Math.max(0, Math.floor(bestServerStats.playersOnline)) : null;
        const runtimePlayersOnline = Number.isFinite(runtimeStats.playersOnline) ? Math.max(0, Math.floor(runtimeStats.playersOnline)) : null;
        const playersOnline = Number.isFinite(attemptResult.playersOnline) ? Math.max(0, Math.floor(attemptResult.playersOnline)) : statsPlayersOnline !== null ? statsPlayersOnline : runtimePlayersOnline;
        currentStatus = runOk ? `Done in ${Math.max(1, Math.round((attemptResult.durationMs || 0) / 1e3))}s.` : "Attempt failed.";
        await maybeUpdateProgress(true);
        if (runOk) {
            const leaderboardLines = formatLeaderboardLines(bestEntries);
            const playerLine = playersOnline === null ? "Players Online: `N/A`" : `Players Online: \`${playersOnline}\``;
            const extraStatLines = formatServerStatsLines(bestServerStats);
            const doneEmbed = (new EmbedBuilder).setTitle("Arras Server Stats").setDescription([ `Server Prefix: \`${serverPrefix}\``, `Entries Found: \`${bestEntries.length}\``, playerLine, ...extraStatLines ].join("\n")).setColor(3066993).addFields({
                name: "Top Players",
                value: `\`\`\`\n${leaderboardLines}\n\`\`\``,
                inline: false
            }).setTimestamp();
            await safeEditMessage(botMsg, {
                embeds: [ doneEmbed ]
            });
            return;
        }
        const failedError = sanitizeWorkerError(lastError || "Leaderboard not found.");
        const failedPlayerLine = playersOnline === null ? "" : `\nPlayers Online: \`${playersOnline}\``;
        const extraFailedStatLines = formatServerStatsLines(bestServerStats).join("\n");
        const errorEmbed = (new EmbedBuilder).setTitle("Arras Server Stat Fetcher").setDescription(`Server Prefix: \`${serverPrefix}\`\n` + `Status: \`Failed\`\n` + `Reason: \`${failedError || "Unknown error"}\`\n` + `Attempts: \`1\`` + failedPlayerLine + (extraFailedStatLines ? `\n${extraFailedStatLines}` : "")).setColor(15158332).setTimestamp();
        await safeEditMessage(botMsg, {
            embeds: [ errorEmbed ]
        });
    });
}
module.exports = {
    svstat: {
        name: "svstat",
        category: "advanced",
        description: "Fetch Arras leaderboard + arena status + MSPT",
        execute: async (message, args) => executeLeaderboardCommand(message, args)
    },
    lb: {
        name: "lb",
        category: "hidden",
        description: "Legacy alias for ?svstat",
        execute: async (message, args) => executeLeaderboardCommand(message, args)
    },
    leaderboard: {
        name: "leaderboard",
        category: "hidden",
        description: "Legacy alias for ?svstat",
        execute: async (message, args) => executeLeaderboardCommand(message, args)
    }
};
