const {EmbedBuilder: EmbedBuilder} = require("discord.js");

const {fork: fork} = require("child_process");

const path = require("path");

const fs = require("fs");

const fetchModule = require("node-fetch");

const {HttpsProxyAgent: HttpsProxyAgent} = require("https-proxy-agent");

const {SocksProxyAgent: SocksProxyAgent} = require("socks-proxy-agent");

const {getScrapeScopeKey: getScrapeScopeKey, captureStopSnapshot: captureStopSnapshot, isStopRequested: isStopRequested, registerWorker: registerWorker, unregisterWorker: unregisterWorker} = require("./scrape_control");

const realFetch = fetchModule.default || fetchModule;

const tf_prot = "http";

function generateRandomHash() {
    const chars = "abcdefghijklmnopqrstuvwxyz";
    let hash = "";
    for (let i = 0; i < 3; i++) {
        hash += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return hash;
}

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

function parseTeamTargetFromServerCode(codeValue) {
    const code = String(codeValue || "").trim().toLowerCase();
    if (!code) return null;
    const modePart = code.split("-").slice(2).join("-") || code;
    const digitMatch = modePart.match(/(\d)/) || code.match(/(\d)/);
    if (!digitMatch) return null;
    const firstDigit = parseInt(digitMatch[1], 10);
    if (!Number.isInteger(firstDigit)) return null;
    if (firstDigit < 2) return null;
    const targetTeams = firstDigit === 2 ? 2 : 4;
    return {
        firstDigit: firstDigit,
        targetTeams: targetTeams
    };
}

const ARRAS_STATUS_ENDPOINTS = [ "https://arras.io/status", "https://ak7oqfc2u4qqcu6i-c.uvwx.xyz:8443/2222/status", "https://qrp6ujau11f36bnm-c.uvwx.xyz:8443/2222/status", "https://t4mebdah2ksfasgi-c.uvwx.xyz:8443/2222/status", "https://kvn3s3cpcdk4fl6j-c.uvwx.xyz:8443/2222/status" ];

async function fetchServerStatusEntry(serverPrefix) {
    const normalizedPrefix = normalizeJoinPrefix(serverPrefix);
    if (!normalizedPrefix) return null;
    for (const endpoint of ARRAS_STATUS_ENDPOINTS) {
        try {
            const response = await fetchWithTimeout(endpoint, {
                method: "GET",
                headers: {
                    accept: "application/json"
                },
                cache: "no-store"
            }, 5e3);
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
                entry = values.find(item => item && typeof item === "object" && String(item.name || "").toLowerCase() === normalizedPrefix) || values.find(item => item && typeof item === "object" && String(item.name || "").toLowerCase().startsWith(normalizedPrefix)) || null;
            }
            if (!entry || typeof entry !== "object") continue;
            return entry;
        } catch (e) {}
    }
    return null;
}

function getTeamInfo(digit) {
    const teams = {
        1: {
            name: "| Blue",
            emoji: "🟦",
            color: 2003199
        },
        2: {
            name: "| Green",
            emoji: "🟩",
            color: 43520
        },
        3: {
            name: "| Red",
            emoji: "🟥",
            color: 16711680
        },
        4: {
            name: "| Purple",
            emoji: "🟪",
            color: 9699539
        }
    };
    return teams[digit] || null;
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

function isNoValidTeamAfterJoinError(value) {
    const text = String(value || "").toLowerCase();
    if (!text) return false;
    return text.includes("no valid team url after join") || text.includes("joined url has no team digits") || text.includes("cancelled fetch, unable to find all the available team codes.");
}

function simplifyFailureReason(reason) {
    const text = String(reason || "").toLowerCase();
    if (!text) return "Unknown";
    if (text.includes("proxy connection ended before receiving connect response")) return "Proxy tunnel rejected";
    if (text.includes("socks5 authentication failed")) return "SOCKS authentication failed";
    if (text.includes("econnrefused") || text.includes("connection refused")) return "Connection refused";
    if (text.includes("etimedout") || text.includes("timeout")) return "Connection timed out";
    if (text.includes("aborted")) return "Request aborted";
    if (text.includes("agent-create-failed")) return "Proxy agent creation failed";
    return "Other proxy/network error";
}

function getOwnerId() {
    return String(process.env.OWNER_ID || "").trim();
}

async function ensureOwnerAccess(message) {
    const ownerId = getOwnerId();
    if (!ownerId) {
        await message.reply("OWNER_ID is missing in .env");
        return false;
    }
    if (String(message.author.id) !== ownerId) {
        await message.reply("You are not allowed to use this command.");
        return false;
    }
    return true;
}

function createProxyAgent(proxy) {
    if (!proxy || !proxy.url) return null;
    try {
        if (proxy.type === "socks") return new SocksProxyAgent(proxy.url);
        if (proxy.type === "http") return new HttpsProxyAgent(proxy.url);
    } catch (e) {
        return null;
    }
    return null;
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

function buildUniqueProxyPool(proxies) {
    const byEndpoint = new Map;
    for (const proxy of proxies || []) {
        if (!proxy || !proxy.url) continue;
        const endpointKey = String(proxy.url || "").replace(/^https?:\/\//i, "").replace(/^socks5?:\/\//i, "").toLowerCase();
        const existing = byEndpoint.get(endpointKey);
        if (!existing) {
            byEndpoint.set(endpointKey, proxy);
            continue;
        }
        if (existing.type !== "socks" && proxy.type === "socks") {
            byEndpoint.set(endpointKey, proxy);
        }
    }
    return Array.from(byEndpoint.values());
}

function sanitizeProxyDisplay(proxyUrl) {
    const text = String(proxyUrl || "");
    if (!text) return "unknown";
    if (text.includes("@")) {
        return text.split("@")[1];
    }
    return text.replace(/^https?:\/\//i, "").replace(/^socks5h?:\/\//i, "").replace(/^socks:\/\//i, "");
}

async function fetchWithTimeout(target, options, timeoutMs) {
    const controller = new AbortController;
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await realFetch(target, {
            ...options,
            signal: controller.signal
        });
    } finally {
        clearTimeout(timer);
    }
}

async function validateProxy(proxy, timeoutMs = 6e3) {
    const agent = createProxyAgent(proxy);
    if (!agent) return {
        ok: false,
        error: "agent-create-failed",
        latencyMs: 0
    };
    const targets = [ "https://arras.io/", "https://qrp6ujau11f36bnm-c.uvwx.xyz:8443/2222/clientCount" ];
    const start = Date.now();
    for (const target of targets) {
        try {
            const response = await fetchWithTimeout(target, {
                agent: agent,
                followRedirects: true
            }, timeoutMs);
            if (!response) {
                return {
                    ok: false,
                    error: `empty-response:${target}`,
                    latencyMs: Date.now() - start
                };
            }
        } catch (err) {
            const msg = err && err.message ? err.message : String(err);
            return {
                ok: false,
                error: msg,
                latencyMs: Date.now() - start
            };
        }
    }
    return {
        ok: true,
        latencyMs: Date.now() - start
    };
}

async function mapWithConcurrency(items, limit, mapper) {
    const results = new Array(items.length);
    let cursor = 0;
    const workers = new Array(Math.max(1, Math.min(limit, items.length))).fill(0).map(async () => {
        while (true) {
            const index = cursor++;
            if (index >= items.length) return;
            results[index] = await mapper(items[index], index);
        }
    });
    await Promise.all(workers);
    return results;
}

const tfQueueByGuild = new Map;

function getTfQueueKey(message) {
    return getScrapeScopeKey(message);
}

function getTfQueuePosition(key) {
    const state = tfQueueByGuild.get(key);
    if (!state) return 0;
    return state.queue.length + (state.running ? 1 : 0);
}

function enqueueTfTask(key, task) {
    let state = tfQueueByGuild.get(key);
    if (!state) {
        state = {
            running: false,
            queue: []
        };
        tfQueueByGuild.set(key, state);
    }
    return new Promise((resolve, reject) => {
        state.queue.push({
            task: task,
            resolve: resolve,
            reject: reject
        });
        runNextTfTask(key);
    });
}

async function runNextTfTask(key) {
    const state = tfQueueByGuild.get(key);
    if (!state || state.running) return;
    const item = state.queue.shift();
    if (!item) {
        tfQueueByGuild.delete(key);
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
            tfQueueByGuild.delete(key);
        } else {
            setImmediate(() => runNextTfTask(key));
        }
    }
}

module.exports = {
    tf: {
        name: "tf",
        category: "advanced",
        description: "Fetch Team Codes from a gamemode (LABYRINTH NOT SUPPORTED)",
        execute: async (message, args, {commands: commands, prefix: prefix, client: client}) => {
            const queueKey = getTfQueueKey(message);
            const stopSnapshot = captureStopSnapshot(queueKey);
            const ahead = getTfQueuePosition(queueKey);
            if (ahead > 0) {
                await message.reply(`TF scan queued for this server. Queue position: \`${ahead + 1}\`.`);
            }
            return enqueueTfTask(queueKey, async () => {
                if (isStopRequested(queueKey, stopSnapshot)) {
                    await message.reply("TF scan cancelled by `?st`.");
                    return;
                }
                if (ahead > 0) {
                    await message.reply("Your queued TF scan is now starting.");
                }
                const rawHashArg = String(args[0] || "").trim();
                const rawTeamsArg = String(args[1] || "").trim();
                if (!rawHashArg || !rawTeamsArg) {
                    await message.reply("Incorrect format, It must be something like `?tf ca 2`. The '2' determines how many teams there are in game to give you the links.");
                    return;
                }
                let gameHash = rawHashArg;
                const parsedTeams = parseInt(rawTeamsArg, 10);
                if (!Number.isInteger(parsedTeams) || ![ 2, 4 ].includes(parsedTeams)) {
                    await message.reply("Incorrect format, It must be something like `?tf ca 2`. The '2' determines how many teams there are in game to give you the links.`");
                    return;
                }
                const requestedTeams = parsedTeams;
                const extracted = extractTeamCode(gameHash);
                if (extracted && extracted.hash) {
                    gameHash = extracted.hash;
                }
                gameHash = gameHash.replace(/^#/, "");
                const serverPrefix = normalizeJoinPrefix(gameHash);
                if (!serverPrefix) {
                    await message.reply("Invalid squad/hash format. Example: `?tf ca 2`");
                    return;
                }
                if (serverPrefix.length === 3) {
                    await message.reply("Sandboxes are not allowed. Your request to fetch all the teams in the mode has been cancelled.");
                    return;
                }
                const statusEntry = await fetchServerStatusEntry(serverPrefix);
                const statusCode = statusEntry && typeof statusEntry === "object" ? String(statusEntry.code || "").trim() : "";
                const parsedStatusCode = parseTeamTargetFromServerCode(statusCode);
                const targetTeams = parsedStatusCode && Number.isInteger(parsedStatusCode.targetTeams) ? parsedStatusCode.targetTeams : requestedTeams;
                const autoAdjustedTarget = targetTeams !== requestedTeams;
                const desiredWorkersPerCycle = targetTeams === 2 ? 10 : 10;
                const {proxies: allProxyCandidates} = loadProxyCandidatesFromDisk();
                const proxyPool = (allProxyCandidates || []).filter(p => p && p.url);
                if (!proxyPool.length) {
                    await message.reply("No usable proxies found. Add working entries to `proxies.txt`.");
                    return;
                }
                const workersPerCycle = desiredWorkersPerCycle;
                let proxyCursor = 0;
                const processingEmbed = (new EmbedBuilder).setTitle("Spawning Bot...").setDescription(`Joining arras.io with server prefix: \`${serverPrefix}\`\n` + `Requested teams: \`${requestedTeams}\`\n` + `Correct team: \`${targetTeams}\`${autoAdjustedTarget ? " (auto)" : ""}\n` + `Workers per cycle: \`${workersPerCycle}\`\n` + `Mode: \`Continuous reconnect until all teams found\`\n` + `Scanning live team URLs...`).setColor(16753920).setTimestamp();
                const botMsg = await message.reply({
                    embeds: [ processingEmbed ]
                });
                try {
                    const headlessPath = path.join(__dirname, "..", "workerfiles", "headless.js");
                    const scrapedTeams = {};
                    let lastWorkerError = "";
                    let joinCycles = 0;
                    const attemptTimeoutMs = 12e3;
                    const scanStartedAt = Date.now();
                    const maxScanDurationMs = 45e3;
                    const maxJoinCycles = 12;
                    let stagnantCycles = 0;
                    const activeWorkers = new Set;
                    let stopIssued = false;
                    const stopAllWorkers = (reason = "target-reached") => {
                        if (stopIssued) return;
                        stopIssued = true;
                        for (const proc of activeWorkers) {
                            try {
                                proc.kill("SIGTERM");
                            } catch (e) {}
                        }
                        activeWorkers.clear();
                        console.log(`[TF] Stopped all active workers (${reason}).`);
                    };
                    const updateEmbed = (stageText = "Scanning...") => {
                        const resultEmbed = (new EmbedBuilder).setTitle("Arras Team Code Fetcher").setDescription(`Server Prefix: \`${serverPrefix}\`\n` + `Requested teams: \`${requestedTeams}\`\n` + `Correct team: \`${targetTeams}\`${autoAdjustedTarget ? " (auto)" : ""}\n` + `Workers per cycle: \`${workersPerCycle}\`\n` + `Found: \`${Object.keys(scrapedTeams).length}\`\n` + `${stageText}`).setColor(3092790).setTimestamp();
                        for (const [digit, teamData] of Object.entries(scrapedTeams)) {
                            const team = getTeamInfo(parseInt(digit, 10));
                            if (!team) continue;
                            const fullUrl = teamData && teamData.url ? teamData.url : null;
                            const hash = teamData && teamData.hash ? teamData.hash : "n/a";
                            resultEmbed.addFields({
                                name: `${team.emoji} ${team.name}`,
                                value: fullUrl ? `Code: \`${hash}\`\n[Open](${fullUrl})\n\`${fullUrl}\`` : `Code: \`${hash}\``,
                                inline: true
                            });
                        }
                        botMsg.edit({
                            embeds: [ resultEmbed ]
                        }).catch(() => {});
                    };
                    const gamePrefix = serverPrefix;
                    const isValidDetectedHash = hash => {
                        const h = String(hash || "").toLowerCase();
                        if (!isStrictTeamHash(h)) return false;
                        if (!gamePrefix) return true;
                        return h.startsWith(gamePrefix);
                    };
                    const registerDetectedUrl = (rawUrl, source = "unknown") => {
                        const parsed = extractTeamCode(rawUrl);
                        if (!parsed) return {
                            status: "invalid"
                        };
                        if (!isValidDetectedHash(parsed.hash)) {
                            return {
                                status: "invalid"
                            };
                        }
                        const normalizedUrl = parsed.url;
                        const existing = scrapedTeams[parsed.teamDigit];
                        if (existing) {
                            return {
                                status: "duplicate",
                                parsed: parsed,
                                url: normalizedUrl
                            };
                        }
                        scrapedTeams[parsed.teamDigit] = {
                            hash: parsed.hash,
                            url: normalizedUrl
                        };
                        console.log(`[TF] Detected URL (${source}): ${normalizedUrl}`);
                        updateEmbed(`Live URL detected from \`${source}\`.`);
                        if (Object.keys(scrapedTeams).length >= targetTeams) {
                            stopAllWorkers("all-teams-collected");
                        }
                        return {
                            status: "new",
                            parsed: parsed,
                            url: normalizedUrl
                        };
                    };
                    const runWorkerAttempt = (cycleNo, slotNo, assignedProxy) => new Promise(resolve => {
                        const botProcess = fork(headlessPath, [], {
                            silent: false,
                            stdio: "pipe",
                            env: {
                                ...process.env,
                                IS_WORKER: "true",
                                PROXIES_FILE: path.resolve(__dirname, "..", "proxies.txt"),
                                MAX_PROXY_CHECKS: String(process.env.MAX_PROXY_CHECKS || "200")
                            }
                        });
                        activeWorkers.add(botProcess);
                        registerWorker(queueKey, botProcess);
                        let finished = false;
                        let sawJoinLinkThisAttempt = false;
                        let workerError = "";
                        let timer = null;
                        let timerExtendedAfterOpen = false;
                        const startedAt = Date.now();
                        const armAttemptTimer = timeoutMs => {
                            if (timer) clearTimeout(timer);
                            timer = setTimeout(() => finish("attempt-timeout"), timeoutMs);
                        };
                        const extendAttemptTimerAfterOpen = source => {
                            if (finished || timerExtendedAfterOpen) return;
                            timerExtendedAfterOpen = true;
                            const extraMs = Math.max(2500, Math.min(7e3, attemptTimeoutMs));
                            armAttemptTimer(extraMs);
                            console.log(`[TF] Extended worker timer after ${source} by ${extraMs}ms on cycle ${cycleNo} slot ${slotNo}`);
                        };
                        const stdoutHashRe = /#([a-z]{2,3}[1-4][a-z0-9]*)(?![a-z0-9])(?:\?q=[1-4])?/gi;
                        const stdoutUrlRe = /https?:\/\/(?:www\.)?arras\.io\/#([a-z]{2,3}[1-4][a-z0-9]*)(?![a-z0-9])(?:\?q=[1-4])?/gi;
                        const handleStdoutDetections = text => {
                            if (!text) return {
                                any: false,
                                newFound: false,
                                duplicateOnly: false
                            };
                            const found = new Set;
                            let match;
                            stdoutUrlRe.lastIndex = 0;
                            while ((match = stdoutUrlRe.exec(text)) !== null) {
                                if (match[1]) found.add(match[1].toLowerCase());
                            }
                            stdoutHashRe.lastIndex = 0;
                            while ((match = stdoutHashRe.exec(text)) !== null) {
                                if (match[1]) found.add(match[1].toLowerCase());
                            }
                            if (!found.size) return {
                                any: false,
                                newFound: false,
                                duplicateOnly: false
                            };
                            let newCount = 0;
                            let duplicateCount = 0;
                            for (const hash of found) {
                                const result = registerDetectedUrl(`https://arras.io/#${hash}`, "stdout-hash");
                                if (result.status === "new") newCount++;
                                if (result.status === "duplicate") duplicateCount++;
                            }
                            return {
                                any: newCount > 0 || duplicateCount > 0,
                                newFound: newCount > 0,
                                duplicateOnly: newCount === 0 && duplicateCount > 0
                            };
                        };
                        const finish = reason => {
                            if (finished) return;
                            finished = true;
                            activeWorkers.delete(botProcess);
                            unregisterWorker(queueKey, botProcess);
                            if (timer) clearTimeout(timer);
                            try {
                                botProcess.kill("SIGTERM");
                            } catch (e) {}
                            resolve({
                                reason: reason,
                                elapsed: Date.now() - startedAt,
                                workerError: workerError
                            });
                        };
                        if (botProcess.stdout) {
                            botProcess.stdout.on("data", data => {
                                const text = data.toString();
                                console.log(`[BOT] ${text}`);
                                if (/Websocket Opened/i.test(text)) {
                                    extendAttemptTimerAfterOpen("stdout-websocket-open");
                                }
                                const detectedFromStdout = handleStdoutDetections(text);
                                if (detectedFromStdout.any && !sawJoinLinkThisAttempt) {
                                    sawJoinLinkThisAttempt = true;
                                    const reason = detectedFromStdout.newFound ? "new-team-detected" : "duplicate-team-retry";
                                    setTimeout(() => finish(reason), detectedFromStdout.newFound ? 40 : 25);
                                }
                            });
                        }
                        if (botProcess.stderr) {
                            botProcess.stderr.on("data", data => {
                                console.error(`[BOT-ERR] ${data.toString()}`);
                            });
                        }
                        botProcess.on("message", msg => {
                            if (msg.type === "websocket_open") {
                                extendAttemptTimerAfterOpen("ipc-websocket-open");
                            } else if (msg.type === "spawned") {
                                extendAttemptTimerAfterOpen("ipc-spawned");
                            } else if (msg.type === "joined_link" && msg.url) {
                                const detected = registerDetectedUrl(msg.url, "ipc-joined-link");
                                if (detected.status === "new") {
                                    console.log(`[TF] Bot reported joined link: ${detected.url}`);
                                }
                                if (!sawJoinLinkThisAttempt && detected.status !== "invalid") {
                                    sawJoinLinkThisAttempt = true;
                                    const reason = detected.status === "new" ? "new-team-detected" : "duplicate-team-retry";
                                    setTimeout(() => finish(reason), detected.status === "new" ? 40 : 25);
                                }
                            } else if (msg.type === "team_detected" && msg.url) {
                                const detected = registerDetectedUrl(msg.url, "ipc-team-detected");
                                if (detected.status === "new") {
                                    console.log(`[TF] Bot detected team URL: ${detected.url}`);
                                }
                                if (!sawJoinLinkThisAttempt && detected.status !== "invalid") {
                                    sawJoinLinkThisAttempt = true;
                                    const reason = detected.status === "new" ? "new-team-detected" : "duplicate-team-retry";
                                    setTimeout(() => finish(reason), detected.status === "new" ? 40 : 25);
                                }
                            } else if (msg.type === "bot_error") {
                                workerError = String(msg.error || "unknown error");
                                console.log(`[TF] Worker bot_error on cycle ${cycleNo} slot ${slotNo}: ${workerError}`);
                                finish("bot-error");
                            }
                        });
                        botProcess.on("error", err => {
                            console.error(`[TF] Worker process error on cycle ${cycleNo} slot ${slotNo}:`, err);
                            finish("process-error");
                        });
                        botProcess.on("exit", (code, signal) => {
                            if (!finished) {
                                finish(`exit-${code ?? "null"}-${signal ?? "none"}`);
                            }
                        });
                        botProcess.send({
                            type: "start",
                            config: {
                                squadId: normalizeJoinPrefix(serverPrefix) || serverPrefix,
                                proxy: assignedProxy || null
                            }
                        });
                        armAttemptTimer(attemptTimeoutMs);
                    });
                    updateEmbed("Starting continuous scan...");
                    while (Object.keys(scrapedTeams).length < targetTeams) {
                        if (isStopRequested(queueKey, stopSnapshot)) {
                            stopAllWorkers("st-command");
                            lastWorkerError = "Stopped by ?st command.";
                            break;
                        }
                        stopIssued = false;
                        const foundBefore = Object.keys(scrapedTeams).length;
                        joinCycles += 1;
                        const assignedProxies = [];
                        for (let i = 0; i < workersPerCycle; i++) {
                            assignedProxies.push(proxyPool[(proxyCursor + i) % proxyPool.length]);
                        }
                        proxyCursor = (proxyCursor + workersPerCycle) % proxyPool.length;
                        if (joinCycles === 1) {
                            updateEmbed("Initial join batch in progress...");
                        } else {
                            updateEmbed("Rejoining same server prefix with new proxy batch...");
                        }
                        const batchResults = await Promise.all(assignedProxies.map((proxy, idx) => runWorkerAttempt(joinCycles, idx + 1, proxy)));
                        const foundCount = Object.keys(scrapedTeams).length;
                        const errors = batchResults.map(r => sanitizeWorkerError(r.workerError)).filter(Boolean);
                        if (errors.length) {
                            lastWorkerError = errors[errors.length - 1];
                        }
                        const noValidTeamErrors = errors.filter(isNoValidTeamAfterJoinError);
                        const reasonLine = errors.length ? `Batch finished: \`${batchResults.length}\` bots, found \`${foundCount}/${targetTeams}\`, last error \`${lastWorkerError}\`.` : `Batch finished: \`${batchResults.length}\` bots, found \`${foundCount}/${targetTeams}\`.`;
                        updateEmbed(reasonLine);
                        if (foundCount > foundBefore) {
                            stagnantCycles = 0;
                        } else {
                            stagnantCycles += 1;
                        }
                        if (foundCount > foundBefore && foundCount >= targetTeams) {
                            break;
                        }
                        if (foundCount >= targetTeams) {
                            break;
                        }
                        if (foundCount === foundBefore && noValidTeamErrors.length === batchResults.length) {
                            stopAllWorkers("cancelled-no-team-codes");
                            lastWorkerError = "Cancelled fetch, unable to find all the available team codes.";
                            break;
                        }
                        if (foundCount > 0 && stagnantCycles >= 4) {
                            stopAllWorkers("stagnant-results");
                            lastWorkerError = `Stopped after ${stagnantCycles} stagnant batches without new team URLs.`;
                            break;
                        }
                        if (joinCycles >= maxJoinCycles || Date.now() - scanStartedAt >= maxScanDurationMs) {
                            stopAllWorkers("scan-time-limit");
                            lastWorkerError = `Stopped after ${joinCycles} batches (${Math.max(1, Math.round((Date.now() - scanStartedAt) / 1e3))}s) to prevent infinite scanning.`;
                            break;
                        }
                        if (errors.length && errors.every(e => e === "No working proxy found.")) {
                            break;
                        }
                    }
                    const totalFound = Object.keys(scrapedTeams).length;
                    stopAllWorkers("scan-ended");
                    const finalStage = totalFound >= targetTeams ? `Completed. Found requested \`${totalFound}/${targetTeams}\` teams. Stopping worker process.` : `Stopped before completion. Found \`${totalFound}/${targetTeams}\` teams.${lastWorkerError ? ` Last worker error: \`${lastWorkerError}\`.` : ""}`;
                    updateEmbed(finalStage);
                } catch (err) {
                    console.error("TF command error:", err);
                    const errorEmbed = (new EmbedBuilder).setTitle("Error").setDescription(`Failed to spawn bot: ${err.message}`).setColor(16711680).setTimestamp();
                    await botMsg.edit({
                        embeds: [ errorEmbed ]
                    });
                }
            });
        }
    },
    tfcheck: {
        name: "tfcheck",
        category: "advanced",
        description: "Owner only: validate proxies against Arras endpoints",
        execute: async (message, args, {prefix: prefix}) => {
            const allowed = await ensureOwnerAccess(message);
            if (!allowed) return;
            const requestedChecks = parseInt(String(args[0] || "25"), 10);
            const requestedTimeout = parseInt(String(args[1] || "6000"), 10);
            const maxChecks = Number.isInteger(requestedChecks) ? Math.max(1, Math.min(200, requestedChecks)) : 25;
            const timeoutMs = Number.isInteger(requestedTimeout) ? Math.max(2e3, Math.min(15e3, requestedTimeout)) : 6e3;
            const concurrency = 6;
            const {files: files, proxies: proxies} = loadProxyCandidatesFromDisk();
            if (!files.length) {
                await message.reply("No proxy file found. Create `proxies.txt` in the project root.");
                return;
            }
            if (!proxies.length) {
                await message.reply("Proxy file found but no valid proxy entries were parsed.");
                return;
            }
            const toCheck = proxies.slice(0, maxChecks);
            const startEmbed = (new EmbedBuilder).setTitle("TF Proxy Check").setColor(15965202).setDescription(`Starting proxy validation...\n` + `Parsed proxies: \`${proxies.length}\`\n` + `Checking: \`${toCheck.length}\`\n` + `Timeout per target: \`${timeoutMs}ms\`\n` + `Concurrency: \`${concurrency}\``).setTimestamp();
            const statusMsg = await message.reply({
                embeds: [ startEmbed ]
            });
            const results = await mapWithConcurrency(toCheck, concurrency, async proxy => {
                const check = await validateProxy(proxy, timeoutMs);
                return {
                    proxy: proxy,
                    ...check
                };
            });
            const working = results.filter(r => r.ok);
            const failed = results.filter(r => !r.ok);
            const fastest = working.length ? [ ...working ].sort((a, b) => a.latencyMs - b.latencyMs)[0] : null;
            const doneEmbed = (new EmbedBuilder).setTitle("TF Proxy Check Results").setColor(working.length ? 3066993 : 15158332).setDescription(`Checked: \`${toCheck.length}\` / Parsed: \`${proxies.length}\`\n` + `Working: \`${working.length}\`\n` + `Failed: \`${failed.length}\``).setTimestamp();
            if (fastest) {
                doneEmbed.addFields({
                    name: "Fastest Working Proxy",
                    value: `Hidden (${fastest.latencyMs}ms)`,
                    inline: false
                });
            }
            if (working.length) {
                const byType = working.reduce((acc, item) => {
                    const t = item.proxy && item.proxy.type ? item.proxy.type : "unknown";
                    acc[t] = (acc[t] || 0) + 1;
                    return acc;
                }, {});
                const list = Object.entries(byType).map(([t, count]) => `${t.toUpperCase()}: ${count}`).join("\n");
                doneEmbed.addFields({
                    name: "Working Proxy Types",
                    value: list,
                    inline: false
                });
            }
            if (failed.length) {
                const failureReasons = {};
                for (const item of failed) {
                    const key = simplifyFailureReason(item.error || "unknown");
                    failureReasons[key] = (failureReasons[key] || 0) + 1;
                }
                const topReasons = Object.entries(failureReasons).sort((a, b) => b[1] - a[1]).slice(0, 5).map(([reason, count]) => `${count}x ${reason}`).join("\n");
                doneEmbed.addFields({
                    name: "Top Failure Reasons",
                    value: topReasons || "Unknown",
                    inline: false
                });
            }
            doneEmbed.addFields({
                name: "Usage",
                value: `\`${prefix}tfcheck [maxChecks] [timeoutMs]\``,
                inline: false
            });
            await statusMsg.edit({
                embeds: [ doneEmbed ]
            });
        }
    }
};
