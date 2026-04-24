const fs = require("fs");
const ws = require("ws");
const {HttpsProxyAgent: HttpsProxyAgent} = require("https-proxy-agent");
const {SocksProxyAgent: SocksProxyAgent} = require("socks-proxy-agent");
const {pack: pack, unpack: unpack} = require("msgpackr");
const url = require("url");
const path = require("path");
const net = require("net");
const {fork: fork} = require("child_process");
const fetchModule = require("node-fetch");
const realFetch = fetchModule.default || fetchModule;
const readline = require("readline");
const args = process.argv.slice(2);

let autoStartCount = 0;
let autoStartMode = false;

for (let i = 0; i < args.length; i++) {
    if (args[i] === "--count" && args[i + 1]) {
        autoStartCount = parseInt(args[i + 1]);
        autoStartMode = true;
        break;
    }
}

function checkBatchCommands() {
    try {
        if (fs.existsSync(commandFile)) {
            const command = fs.readFileSync(commandFile, "utf8").trim();
            fs.unlinkSync(commandFile);
            console.log(`[BATCH] Received command: ${command}`);
        }
    } catch (e) {}
}

setInterval(checkBatchCommands, 2e3);

process.on("uncaughtException", function(e) {
    if (e && e.type === "system" && (e.code === "ECONNRESET" || e.code === "ECONNREFUSED" || e.code === "ETIMEDOUT")) return;
    if (e && e.message && e.message.includes("FetchError")) return;
    console.log(e);
});

process.on("unhandledRejection", function(e) {
    if (e && e.type === "system") return;
    if (e && e.code && (e.code === "ECONNRESET" || e.code === "ECONNREFUSED" || e.code === "ETIMEDOUT")) return;
    if (e && e.name === "FetchError") return;
});

if (!process.env.IS_WORKER) {
    const rl = readline.createInterface({
        input: process.stdin,
        output: process.stdout
    });
    const configFilePath = "bot_config.json";
    const getPath = function(name, tree) {
        let p = "", o = tree[name];
        while (o) {
            p = o[0] + p;
            let n = o[1];
            if (n === "Basic") {
                break;
            }
            o = tree[n];
        }
        return p;
    };
    const tree = {
        Browser: [ "Y", "Surfer" ],
        Strider: [ "K", "Fighter" ],
        Automingler: [ "J", "Mingler" ],
        Mingler: [ "K", "Hexa Tank" ],
        Necromancer: [ "Y", "Necromancer" ],
        Underseer: [ "I", "Director" ],
        Firework: [ "Y", "Rocketeer" ],
        Leviathan: [ "H", "Rocketeer" ],
        Rocketeer: [ "K", "Launcher" ],
        Annihilator: [ "U", "Destroyer" ],
        Destroyer: [ "Y", "Pounder" ],
        Swarmer: [ "I", "Launcher" ],
        Twister: [ "U", "Launcher" ],
        Launcher: [ "H", "Pounder" ],
        Fighter: [ "Y", "TriAngle" ],
        Surfer: [ "K", "TriAngle" ],
        Sprayer: [ "H", "Machine Gun" ],
        Redistributor: [ "Y", "Sprayer" ],
        Spreadshot: [ "U", "Triple Shot" ],
        Gale: [ "I", "Octo Tank" ],
        Crackshot: [ "J", "Penta Shot" ],
        "Penta Shot": [ "Y", "Triple Shot" ],
        Twin: [ "Y", "Basic" ],
        "Double Twin": [ "Y", "Twin" ],
        "Triple Shot": [ "U", "Twin" ],
        Sniper: [ "U", "Basic" ],
        "Machine Gun": [ "I", "Basic" ],
        Gunner: [ "I", "Machine Gun" ],
        "Machine Gunner": [ "H", "Gunner" ],
        Nailgun: [ "U", "Gunner" ],
        Pincer: [ "K", "Nailgun" ],
        "Flank Guard": [ "H", "Basic" ],
        "Hexa Tank": [ "Y", "Flank Guard" ],
        "Octo Tank": [ "Y", "Hexa Tank" ],
        Cyclone: [ "U", "Hexa Tank" ],
        HexaTrapper: [ "I", "Hexa Tank" ],
        TriAngle: [ "U", "Flank Guard" ],
        Fighter: [ "Y", "TriAngle" ],
        Booster: [ "U", "TriAngle" ],
        Falcon: [ "I", "TriAngle" ],
        Bomber: [ "H", "TriAngle" ],
        AutoTriAngle: [ "J", "TriAngle" ],
        Surfer: [ "K", "TriAngle" ],
        Auto3: [ "I", "Flank Guard" ],
        Auto5: [ "Y", "Auto3" ],
        Mega3: [ "U", "Auto3" ],
        Auto4: [ "I", "Auto3" ],
        Banshee: [ "H", "Auto3" ],
        "Trap Guard": [ "H", "Flank Guard" ],
        Buchwhacker: [ "Y", "Trap Guard" ],
        "Gunner Trapper": [ "U", "Trap Guard" ],
        Conqueror: [ "J", "Trap Guard" ],
        Bulwark: [ "K", "Trap Guard" ],
        TriTrapper: [ "J", "Flank Guard" ],
        Fortress: [ "Y", "TriTrapper" ],
        Septatrapper: [ "I", "TriTrapper" ],
        Whirlwind: [ "H", "Septatrapper" ],
        Nona: [ "Y", "Septatrapper" ],
        SeptaMachine: [ "U", "Septatrapper" ],
        Architect: [ "H", "TriTrapper" ],
        TripleTwin: [ "K", "Flank Guard" ],
        Director: [ "J", "Basic" ],
        Pounder: [ "K", "Basic" ]
    };
    let PRESETS = {
        "Testing & Classic": [ {
            tanks: [ 0, 3, 0 ],
            stats: [ [ 2, 6 ], [ 3, 9 ], [ 4, 9 ], [ 5, 9 ], [ 6, 9 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            autospin: true,
            pathfinding_facing_angle_offset: 0
        }, {
            tanks: [ 0, 3, 1 ],
            stats: [ [ 2, 6 ], [ 3, 9 ], [ 4, 9 ], [ 5, 9 ], [ 6, 9 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            autospin: true,
            pathfinding_facing_angle_offset: 0
        }, {
            tanks: [ 0, 3, 2 ],
            stats: [ [ 2, 6 ], [ 3, 9 ], [ 4, 9 ], [ 5, 9 ], [ 6, 9 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            autospin: true,
            pathfinding_facing_angle_offset: 0
        }, {
            tanks: [ 6, 1, 2 ],
            stats: [ [ 2, 6 ], [ 3, 9 ], [ 4, 9 ], [ 5, 9 ], [ 6, 9 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            autospin: true,
            pathfinding_facing_angle_offset: 0
        }, {
            tanks: [ 0, 1, 0 ],
            stats: [ [ 2, 6 ], [ 3, 9 ], [ 4, 9 ], [ 5, 9 ], [ 6, 9 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            pathfinding_facing_angle_offset: Math.PI
        }, {
            tanks: [ 3, 1, 1 ],
            stats: [ [ 8, 6 ], [ 0, 9 ], [ 1, 9 ], [ 6, 9 ], [ 7, 9 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            pathfinding_facing_angle_offset: 0
        } ],
        "Best AR Tanks": [ {
            tanks: [ 5, 3, 5, 3 ],
            stats: [ [ 2, 6 ], [ 3, 9 ], [ 4, 9 ], [ 5, 9 ], [ 6, 9 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            pathfinding_facing_angle_offset: Math.PI
        }, {
            tanks: [ 0, 1, 5, 1 ],
            stats: [ [ 2, 6 ], [ 3, 9 ], [ 4, 9 ], [ 5, 9 ], [ 6, 9 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            pathfinding_facing_angle_offset: Math.PI
        }, {
            tanks: [ 3, 0, 0, 2 ],
            stats: [ [ 2, 6 ], [ 3, 9 ], [ 4, 9 ], [ 5, 9 ], [ 6, 9 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            autospin: true,
            pathfinding_facing_angle_offset: 0
        }, {
            tanks: [ 3, 2, 2, 0 ],
            stats: [ [ 2, 6 ], [ 3, 9 ], [ 4, 9 ], [ 5, 9 ], [ 6, 9 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            autospin: true,
            pathfinding_facing_angle_offset: 0
        }, {
            tanks: [ 5, 3, 5, 0 ],
            stats: [ [ 2, 6 ], [ 3, 9 ], [ 4, 9 ], [ 5, 9 ], [ 6, 9 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            pathfinding_facing_angle_offset: Math.PI
        }, {
            tanks: [ 0, 2, 1, 5 ],
            stats: [ [ 2, 6 ], [ 3, 9 ], [ 4, 9 ], [ 5, 9 ], [ 6, 9 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            pathfinding_facing_angle_offset: Math.PI
        }, {
            tanks: [ 3, 0, 5, 4 ],
            stats: [ [ 2, 6 ], [ 3, 9 ], [ 4, 9 ], [ 5, 9 ], [ 6, 9 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            autospin: true,
            pathfinding_facing_angle_offset: 0
        } ],
        "Tri-branch Hell": [ {
            tanks: [ 3, 1, 0, 0 ],
            stats: [ [ 0, 2 ], [ 1, 2 ], [ 2, 2 ], [ 3, 8 ], [ 4, 6 ], [ 5, 8 ], [ 6, 9 ], [ 7, 5 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            pathfinding_facing_angle_offset: 0
        }, {
            tanks: [ 3, 1, 3, 8 ],
            stats: [ [ 0, 2 ], [ 1, 2 ], [ 2, 2 ], [ 3, 8 ], [ 4, 6 ], [ 5, 8 ], [ 6, 9 ], [ 7, 5 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            pathfinding_facing_angle_offset: 0
        }, {
            tanks: [ 3, 1, 5, 4 ],
            stats: [ [ 0, 2 ], [ 1, 2 ], [ 2, 2 ], [ 3, 8 ], [ 4, 6 ], [ 5, 8 ], [ 6, 9 ], [ 7, 5 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            pathfinding_facing_angle_offset: 0
        }, {
            tanks: [ 3, 1, 4, 0 ],
            stats: [ [ 0, 2 ], [ 1, 2 ], [ 2, 2 ], [ 3, 8 ], [ 4, 6 ], [ 5, 8 ], [ 6, 9 ], [ 7, 5 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            pathfinding_facing_angle_offset: 0
        } ],
        "ADG Advanced": [ {
            tanks: [ 4, 5 ],
            stats: [ [ 2, 9 ], [ 3, 9 ], [ 4, 9 ], [ 5, 9 ], [ 6, 3 ], [ 7, 3 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            pathfinding_facing_angle_offset: 0
        }, {
            tanks: [ 0, 0, 2 ],
            stats: [ [ 0, 1 ], [ 1, 2 ], [ 2, 3 ], [ 3, 8 ], [ 4, 7 ], [ 5, 9 ], [ 6, 9 ], [ 7, 3 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            pathfinding_facing_angle_offset: 0
        }, {
            tanks: [ 0, 0, 3 ],
            stats: [ [ 0, 1 ], [ 1, 2 ], [ 2, 3 ], [ 3, 8 ], [ 4, 7 ], [ 5, 9 ], [ 6, 9 ], [ 7, 3 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            pathfinding_facing_angle_offset: 0
        }, {
            tanks: [ 1, 2, 1 ],
            stats: [ [ 0, 1 ], [ 1, 2 ], [ 2, 5 ], [ 3, 8 ], [ 4, 7 ], [ 5, 9 ], [ 6, 7 ], [ 7, 3 ] ],
            growth_extended_upgrades_order_to_max: [ 2, 7, 1, 0, 8, 9 ],
            pathfinding_facing_angle_offset: Math.PI
        } ]
    };
    if (fs.existsSync("./just_some_bot_upgrades.js")) {
        try {
            const content = fs.readFileSync("./just_some_bot_upgrades.js", "utf8");
            const parts = content.split("//").filter(p => p.trim().length > 0);
            parts.forEach(part => {
                const lines = part.split("\n");
                const name = lines[0].trim().replace(/^\d+\.\s*/, "");
                const dataPart = lines.slice(1).join("\n").trim();
                if (name && dataPart.startsWith("[")) {
                    try {
                        const data = eval(dataPart);
                        if (Array.isArray(data)) {
                            PRESETS[name] = data;
                        }
                    } catch (e) {}
                }
            });
        } catch (e) {}
    }
    let botConfig = {
        squadId: "epb",
        name: "[SSS] tristam",
        tank: "Booster",
        tankMode: "single",
        activePreset: "Best AR Tanks",
        keys: [],
        autoFire: false,
        autoRespawn: true,
        target: "player",
        aim: "drone",
        chatSpam: "",
        stats: [ 2, 2, 2, 6, 6, 8, 8, 8, 0 ],
        launchDelay: 2e4
    };
    let workers = [];
    let proxies = {};
    let usedProxies = new Set;
    const usageFilePath = "proxy_usage.json";
    let paused = false;
    function loadProxyUsage() {
        try {
            if (fs.existsSync(usageFilePath)) {
                const data = JSON.parse(fs.readFileSync(usageFilePath, "utf8"));
                if (Array.isArray(data)) usedProxies = new Set(data);
            }
        } catch (e) {
            usedProxies = new Set;
        }
    }
    function saveProxyUsage() {
        try {
            fs.writeFileSync(usageFilePath, JSON.stringify(Array.from(usedProxies)), "utf8");
        } catch (e) {}
    }
    function resetProxyUsage() {
        usedProxies = new Set;
        saveProxyUsage();
        loadProxies();
        console.log("\n[PROXIES] Usage history has been reset.");
        setTimeout(displayMenu, 1500);
    }
    function saveConfig() {
        try {
            fs.writeFileSync(configFilePath, JSON.stringify(botConfig, null, 2), "utf8");
        } catch (e) {}
    }
    function loadConfig() {
        try {
            if (fs.existsSync(configFilePath)) {
                const savedConfigData = fs.readFileSync(configFilePath, "utf8");
                const savedConfig = JSON.parse(savedConfigData);
                if (savedConfig && typeof savedConfig === "object" && typeof savedConfig.region === "string" && savedConfig.region.trim()) {
                    const existingSquadId = String(savedConfig.squadId || "").trim();
                    if (!existingSquadId || existingSquadId === "MySquadName" || existingSquadId === "epb") {
                        savedConfig.squadId = savedConfig.region.trim();
                    }
                    delete savedConfig.region;
                }
                botConfig = {
                    ...botConfig,
                    ...savedConfig
                };
            }
        } catch (e) {}
        loadProxyUsage();
    }
    function loadProxies() {
        try {
            const proxyData = fs.readFileSync("proxies.txt", "utf8");
            const lines = proxyData.split(/\r?\n/).filter(line => line.trim() !== "");
            proxies = {};
            for (const line of lines) {
                const parts = line.trim().split(":");
                if (parts.length === 4) {
                    const [ip, port, user, pass] = parts;
                    const proxyUrl = `http://${user}:${pass}@${ip}:${port}`;
                    proxies[proxyUrl] = "http";
                }
            }
            return `Successfully loaded ${Object.keys(proxies).length} HTTP proxies.`;
        } catch (e) {
            if (e.code === "ENOENT") {
                return "Warning: proxies.txt not found. Bots will run without proxies.";
            }
            return "Error reading proxies.txt.";
        }
    }
    function startBots(numBots) {
        try {
            fs.writeFileSync("proxies.txt", "", "utf8");
        } catch (e) {}
        let launchQueue = [];
        const proxyList = Object.keys(proxies);
        const hasProxies = proxyList.length > 0;
        const botIdCounter = Date.now() % 1e4;
        if (hasProxies && proxyList.length < numBots) {
            console.log(`[WARNING] Only ${proxyList.length} fresh proxies available for ${numBots} bots.`);
        }
        const indicesToKeys = input => {
            let indices = input;
            if (typeof input === "string") {
                indices = input.trim().split(/\s+/).filter(x => x.length > 0).map(x => parseInt(x));
            }
            if (!Array.isArray(indices)) return "";
            const keys = [ "Y", "U", "I", "H", "J", "K", "L", ";", "'" ];
            return indices.map(idx => keys[idx] || "").join("");
        };
        const convertStats = statsArr => {
            let flat = new Array(10).fill(0);
            statsArr.forEach(([idx, val]) => {
                if (idx >= 0 && idx < 10) flat[idx] = val;
            });
            return flat;
        };
        if (botConfig.tankMode === "preset" && PRESETS[botConfig.activePreset]) {
            const currentPreset = PRESETS[botConfig.activePreset];
            for (let i = 0; i < numBots; i++) {
                const entry = currentPreset[i % currentPreset.length];
                launchQueue.push({
                    tank: indicesToKeys(entry.tanks),
                    stats: convertStats(entry.stats),
                    keys: [],
                    autospin: entry.autospin || false,
                    growth_order: entry.growth_extended_upgrades_order_to_max || [],
                    angle_offset: entry.pathfinding_facing_angle_offset || 0
                });
            }
        } else if (botConfig.tankMode === "multi" && botConfig.multiTankConfig && Array.isArray(botConfig.multiTankConfig)) {
            botConfig.multiTankConfig.forEach(group => {
                const count = group.count || 1;
                for (let k = 0; k < count; k++) {
                    if (launchQueue.length < numBots) {
                        launchQueue.push({
                            tank: group.tank,
                            keys: group.keys || []
                        });
                    }
                }
            });
            if (launchQueue.length < numBots) {
                let groupSize = 1;
                if (botConfig.multiTankConfig.length > 0) {
                    groupSize = botConfig.multiTankConfig[botConfig.multiTankConfig.length - 1].count || 1;
                }
                const tankNames = Object.keys(tree);
                while (launchQueue.length < numBots) {
                    const randomTank = tankNames[Math.floor(Math.random() * tankNames.length)];
                    for (let k = 0; k < groupSize && launchQueue.length < numBots; k++) {
                        launchQueue.push({
                            tank: randomTank,
                            keys: []
                        });
                    }
                }
            }
        } else {
            for (let i = 0; i < numBots; i++) {
                let tankVal = botConfig.tank;
                if (/^[\d\s]+$/.test(tankVal)) {
                    tankVal = indicesToKeys(tankVal);
                } else {
                    tankVal = getPath(tankVal, tree);
                }
                launchQueue.push({
                    tank: tankVal,
                    stats: [ ...botConfig.stats ],
                    keys: botConfig.keys
                });
            }
        }
        const launchBot = (botSpec, index) => {
            const nextProxy = getFreshProxy();
            const config = {
                id: botIdCounter + index,
                proxy: nextProxy ? {
                    type: nextProxy.type,
                    url: nextProxy.url
                } : false,
                hash: "#" + botConfig.squadId,
                name: botConfig.name,
                stats: botSpec.stats || [ ...botConfig.stats ],
                type: "follow",
                token: "follow-3c8f2e",
                autoFire: botConfig.autoFire,
                autoRespawn: botConfig.autoRespawn,
                target: botConfig.target,
                aim: botConfig.aim,
                keys: [ ...botSpec.keys ],
                tank: botSpec.tank,
                chatSpam: botConfig.chatSpam,
                squadId: botConfig.squadId,
                loadFromCache: true,
                cache: false,
                arrasCache: "./ah.txt",
                autospin: botSpec.autospin,
                growth_order: botSpec.growth_order,
                angle_offset: botSpec.angle_offset
            };
            console.log(`Launching bot #${config.id} (${botSpec.tank}) using ${config.proxy ? "proxy" : "direct connection"}...`);
            const worker = fork(__filename, [], {
                env: {
                    ...process.env,
                    IS_WORKER: "true"
                }
            });
            worker.on("message", msg => {
                if (msg.type === "blacklisted") {
                    console.log(`[BOT ${config.id}] Proxy blacklisted/banned! Reason: "${msg.reason || "Unknown"}" Rotating...`);
                    worker.kill();
                    workers = workers.filter(w => w !== worker);
                    setTimeout(() => launchBot(botSpec, index), 5e3);
                } else if (msg.type === "verified_good") {
                    if (msg.proxyUrl) {
                        fs.appendFileSync("notblacklisted.txt", msg.proxyUrl + "\n", "utf8");
                        console.log(`[BOT ${config.id}] Proxy verified as GOOD and saved to notblacklisted.txt`);
                    }
                }
            });
            worker.send({
                type: "start",
                config: config
            });
            workers.push(worker);
            if (config.proxy && config.proxy.url) {
                try {
                    fs.appendFileSync("active_proxies.txt", config.proxy.url + "\n", "utf8");
                } catch (e) {}
                usedProxies.add(config.proxy.url);
                saveProxyUsage();
            }
        };
        launchQueue.forEach((botSpec, i) => {
            setTimeout(() => launchBot(botSpec, i), botConfig.launchDelay * i);
        });
        function getFreshProxy() {
            const keys = Object.keys(proxies);
            if (keys.length === 0) return null;
            const url = keys[0];
            const type = proxies[url];
            delete proxies[url];
            return {
                url: url,
                type: type
            };
        }
        setTimeout(() => {
            console.log(`\nâœ“ All ${numBots} bots launched!`);
            if (!autoStartMode) {
                setTimeout(displayMenu, 2e3);
            }
        }, botConfig.launchDelay * numBots + 1e3);
    }
    function disconnectBots() {
        console.log(`\nDisconnecting ${workers.length} bot(s)...`);
        workers.forEach(worker => worker.kill());
        workers = [];
        paused = false;
        if (!autoStartMode) {
            setTimeout(displayMenu, 1e3);
        }
    }
    function togglePause() {
        paused = !paused;
        console.log(`\n${paused ? "Pausing" : "Resuming"} all bots...`);
        workers.forEach(worker => worker.send({
            type: "pause",
            paused: paused
        }));
        if (!autoStartMode) {
            setTimeout(displayMenu, 1e3);
        }
    }
    function displayMenu() {
        console.clear();
        console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
        console.log("        ARRAS.IO BOT PANEL");
        console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
        console.log(`Bots Running: ${workers.length}`);
        console.log(`Squad ID: ${botConfig.squadId}`);
        console.log(`Tank: ${botConfig.tank}`);
        console.log(`Bots Paused: ${paused ? "Yes" : "No"}`);
        console.log("");
        console.log("--- ACTIONS ---");
        console.log("[1] Start Bots");
        console.log("[2] Stop All Bots");
        console.log("[3] Pause/Resume Bots");
        console.log("[4] Settings");
        console.log("[5] Exit");
        console.log("[7] Simulate Key");
        console.log("[8] Proxy Stats");
        console.log("[9] Reset Proxy Usage History");
        console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
        rl.question("Select option (1-9): ", handleMenuChoice);
    }
    function handleMenuChoice(choice) {
        choice = choice.trim();
        rl.pause();
        rl.resume();
        switch (choice) {
          case "1":
            askBotCount();
            break;

          case "2":
            disconnectBots();
            break;

          case "3":
            togglePause();
            break;

          case "4":
            showSettings();
            break;

          case "5":
            console.log("\nExiting...");
            disconnectBots();
            rl.close();
            rl.close();
            process.exit();
            break;

          case "7":
            askKeyToSimulate();
            break;

          case "8":
            loadProxies();
            setTimeout(displayMenu, 3e3);
            break;

          case "9":
            rl.question("\nAre you sure you want to reset proxy usage history? (y/n): ", ans => {
                if (ans.toLowerCase() === "y") {
                    resetProxyUsage();
                } else {
                    displayMenu();
                }
            });
            break;

          default:
            console.log("\nInvalid option. Please choose 1-9.");
            setTimeout(displayMenu, 1e3);
            break;
        }
    }
    function askBotCount() {
        console.log("\n");
        rl.question("How many bots to start? ", answer => {
            const num = parseInt(answer.trim());
            if (isNaN(num) || num < 1) {
                console.log("\nInvalid number. Please enter a positive number.");
                setTimeout(askBotCount, 500);
                return;
            }
            console.log(`\nStarting ${num} bots...`);
            startBots(num);
        });
    }
    function showSettings() {
        console.clear();
        console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
        console.log("           SETTINGS");
        console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
        console.log(`[1] Squad ID: ${botConfig.squadId}`);
        console.log(`[2] Bot Name: ${botConfig.name}`);
        console.log(`[3] Tank Selection (Mode: ${botConfig.tankMode.toUpperCase()})`);
        if (botConfig.tankMode === "single") {
            console.log(`    Current Tank: ${botConfig.tank}`);
        } else {
            console.log(`    Active Preset: ${botConfig.activePreset}`);
        }
        console.log(`[4] AutoFire: ${botConfig.autoFire ? "ON" : "OFF"}`);
        console.log(`[5] Launch Delay: ${botConfig.launchDelay}ms`);
        console.log(`[6] Back to Main Menu`);
        console.log("â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•â•");
        rl.question("Select setting to change (1-6): ", handleSettingChoice);
    }
    function handleSettingChoice(choice) {
        choice = choice.trim();
        switch (choice) {
          case "1":
            rl.question(`New Squad ID (current: ${botConfig.squadId}): `, val => {
                botConfig.squadId = val || botConfig.squadId;
                saveConfig();
                console.log("Squad ID updated!");
                setTimeout(showSettings, 1e3);
            });
            break;

          case "2":
            rl.question(`New Bot Name (current: ${botConfig.name}): `, val => {
                botConfig.name = val || botConfig.name;
                saveConfig();
                console.log("Bot name updated!");
                setTimeout(showSettings, 1e3);
            });
            break;

          case "3":
            console.log("\n--- TANK SELECTION ---");
            console.log("[1] Single Tank Mode");
            console.log("[2] Preset Cycling Mode (from bots system)");
            rl.question("Select mode (1-2): ", mode => {
                if (mode === "2") {
                    botConfig.tankMode = "preset";
                    console.log("\n--- AVAILABLE PRESETS ---");
                    Object.keys(PRESETS).forEach((p, idx) => console.log(`[${idx + 1}] ${p}`));
                    rl.question("Select preset: ", pIdx => {
                        const keys = Object.keys(PRESETS);
                        const selected = keys[parseInt(pIdx) - 1];
                        if (selected) {
                            botConfig.activePreset = selected;
                            saveConfig();
                            console.log(`Preset set to: ${selected}`);
                        } else {
                            console.log("Invalid selection.");
                        }
                        setTimeout(showSettings, 1e3);
                    });
                } else {
                    botConfig.tankMode = "single";
                    const tiers = {
                        "Tier 1": [],
                        "Tier 2": [],
                        "Tier 3": [],
                        "Tier 4": [],
                        "Special/Other": []
                    };
                    const getDepth = name => {
                        let depth = 1;
                        let current = name;
                        while (tree[current] && tree[current][1] !== "Basic") {
                            current = tree[current][1];
                            if (!current) break;
                            depth++;
                        }
                        return depth;
                    };
                    Object.keys(tree).forEach(tank => {
                        if (tank === "Basic") return;
                        if (tree[tank] && tree[tank][1] === "Basic") {
                            tiers["Tier 2"].push(tank);
                        } else {
                            const d = getDepth(tank);
                            if (d === 2) tiers["Tier 3"].push(tank); else if (d === 3) tiers["Tier 4"].push(tank); else tiers["Special/Other"].push(tank);
                        }
                    });
                    tiers["Tier 1"].push("Basic");
                    console.log("\n--- AVAILABLE TANKS ---");
                    for (const [tier, tanks] of Object.entries(tiers)) {
                        if (tanks.length > 0) {
                            console.log(`\n[${tier}]:`);
                            console.log(tanks.sort().join(", "));
                        }
                    }
                    console.log("\n-----------------------");
                    rl.question(`New Tank (current: ${botConfig.tank}): `, val => {
                        if (tree[val] || val === "Basic") {
                            botConfig.tank = val;
                            saveConfig();
                            console.log("Tank updated!");
                        } else {
                            console.log("Invalid tank name.");
                        }
                        setTimeout(showSettings, 1e3);
                    });
                }
            });
            break;

          case "4":
            rl.question("AutoFire (on/off): ", val => {
                botConfig.autoFire = val.toLowerCase() === "on";
                saveConfig();
                console.log(`AutoFire ${botConfig.autoFire ? "ENABLED" : "DISABLED"}`);
                setTimeout(showSettings, 1e3);
            });
            break;

          case "5":
            rl.question(`New Launch Delay in ms (current: ${botConfig.launchDelay}): `, val => {
                const delay = parseInt(val);
                if (!isNaN(delay) && delay >= 0) {
                    botConfig.launchDelay = delay;
                    saveConfig();
                    console.log(`Launch delay set to ${delay}ms`);
                } else {
                    console.log("Invalid number.");
                }
                setTimeout(showSettings, 1e3);
            });
            break;

          case "6":
            displayMenu();
            break;

          default:
            console.log("\nInvalid choice.");
            setTimeout(showSettings, 1e3);
            break;
        }
    }
    function askKeyToSimulate() {
        rl.question("\nEnter key to simulate (e.g. e, space, enter): ", input => {
            const code = mapInputToCode(input);
            if (code) {
                console.log(`\nSimulating key '${code}' on ${workers.length} workers...`);
                workers.forEach(w => w.send({
                    type: "key_command",
                    key: code
                }));
            } else {
                console.log(`\nInvalid key input: ${input}`);
            }
            setTimeout(displayMenu, 1500);
        });
    }
    function mapInputToCode(input) {
        if (!input) return null;
        input = input.trim();
        const lower = input.toLowerCase();
        if (lower.length === 1) {
            if (lower >= "a" && lower <= "z") return "Key" + lower.toUpperCase();
            if (lower >= "0" && lower <= "9") return "Digit" + lower;
        }
        const map = {
            space: "Space",
            enter: "Enter",
            shift: "ShiftLeft",
            ctrl: "ControlLeft",
            alt: "AltLeft",
            tab: "Tab",
            esc: "Escape",
            escape: "Escape",
            up: "ArrowUp",
            down: "ArrowDown",
            left: "ArrowLeft",
            right: "ArrowRight",
            backspace: "Backspace"
        };
        return map[lower] || null;
    }
    loadConfig();
    loadProxies();
    if (autoStartMode && autoStartCount > 0) {
        console.log(`\nARRAS.IO BOT PANEL - Auto Start Mode`);
        console.log(`=====================================`);
        console.log(`Starting ${autoStartCount} bots automatically...`);
        startBots(autoStartCount);
    } else {
        setTimeout(displayMenu, 500);
    }
} else {
    process.on("uncaughtException", err => {
        const msg = err && err.message ? err.message : String(err || "");
        const stack = err && err.stack ? String(err.stack) : "";
        if (stack.includes("arras_game_script_") || msg.includes("arras_game_script_")) {
            return;
        }
        console.error(`[WORKER ERROR]`, err);
    });
    process.on("unhandledRejection", err => {
        const msg = err && err.message ? err.message : String(err || "");
        const stack = err && err.stack ? String(err.stack) : "";
        if (stack.includes("arras_game_script_") || msg.includes("arras_game_script_")) {
            return;
        }
        console.error(`[WORKER UNHANDLED REJECTION]`, err);
    });
    let isPaused = false;
    let currentBot = null;
    const createProxyAgent = proxy => {
        if (!proxy || !proxy.url) return null;
        try {
            if (proxy.type === "socks") return new SocksProxyAgent(proxy.url);
            if (proxy.type === "http") return new HttpsProxyAgent(proxy.url);
        } catch (e) {
            return null;
        }
        return null;
    };
    const getWorkerProxyProtocol = () => {
        const raw = String(process.env.WORKER_PROXY_PROTOCOL || "http").trim().toLowerCase();
        if (raw === "http" || raw === "https") return "http";
        if (raw === "socks" || raw === "socks5" || raw === "socks5h") return "socks";
        return "http";
    };
    const expandProxyLine = line => {
        const raw = String(line || "").trim();
        if (!raw || raw.startsWith("#")) return [];
        const protocol = getWorkerProxyProtocol();
        if (/^socks5?:\/\//i.test(raw)) {
            if (protocol !== "socks") return [];
            return [ {
                type: "socks",
                url: raw.replace(/^socks:\/\//i, "socks5://")
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
            if (protocol === "http") return [ {
                type: "http",
                url: `http://${user}:${pass}@${host}:${port}`
            } ];
            return [ {
                type: "socks",
                url: `socks5://${user}:${pass}@${host}:${port}`
            } ];
        }
        if (parts.length === 2) {
            const host = parts[0];
            const port = parts[1];
            if (protocol === "http") return [ {
                type: "http",
                url: `http://${host}:${port}`
            } ];
            return [ {
                type: "socks",
                url: `socks5://${host}:${port}`
            } ];
        }
        return [];
    };
    const getWorkerProxyCandidates = () => {
        const explicitProxyFile = process.env.PROXIES_FILE ? path.resolve(process.env.PROXIES_FILE) : null;
        const candidates = [ explicitProxyFile, path.resolve(__dirname, "..", "proxies.txt"), path.resolve(__dirname, "..", "proxies"), path.join(__dirname, "proxies.txt"), path.join(__dirname, "proxies"), path.join(process.cwd(), "workerfiles", "proxies.txt"), path.join(process.cwd(), "workerfiles", "proxies"), path.join(process.cwd(), "proxies.txt"), path.join(process.cwd(), "proxies") ].filter(Boolean);
        const proxyList = [];
        const seen = new Set;
        for (const candidate of candidates) {
            try {
                if (!fs.existsSync(candidate)) continue;
                const lines = fs.readFileSync(candidate, "utf8").split(/\r?\n/);
                for (const line of lines) {
                    const expanded = expandProxyLine(line);
                    for (const proxy of expanded) {
                        const key = `${proxy.type}|${proxy.url}`;
                        if (seen.has(key)) continue;
                        seen.add(key);
                        proxyList.push(proxy);
                    }
                }
            } catch (e) {}
        }
        return proxyList;
    };
    const testProxyConnection = async (proxy, timeoutMs = 7e3) => {
        if (!proxy || !proxy.url) return false;
        let parsed;
        try {
            parsed = new URL(proxy.url);
        } catch (e) {
            return false;
        }
        const host = parsed.hostname;
        const port = Number(parsed.port || (parsed.protocol.startsWith("https") ? 443 : 80));
        if (!host || !Number.isFinite(port) || port <= 0) return false;
        return await new Promise(resolve => {
            const socket = net.connect({
                host: host,
                port: port
            });
            const done = ok => {
                try {
                    socket.destroy();
                } catch (e) {}
                resolve(ok);
            };
            socket.setTimeout(timeoutMs);
            socket.once("connect", () => done(true));
            socket.once("timeout", () => done(false));
            socket.once("error", () => done(false));
            socket.once("close", () => {});
        });
    };
    const testProxyReachability = async (proxy, timeoutMs = 8e3) => {
        if (!proxy || !proxy.url) return false;
        const agent = createProxyAgent(proxy);
        if (!agent) return false;
        const fetchWithTimeout = async (target, options, ms) => {
            const controller = new AbortController;
            const timer = setTimeout(() => controller.abort(), ms);
            try {
                return await realFetch(target, {
                    ...options,
                    signal: controller.signal
                });
            } finally {
                clearTimeout(timer);
            }
        };
        const targets = [ "https://arras.io/" ];
        for (const target of targets) {
            try {
                const response = await fetchWithTimeout(target, {
                    agent: agent,
                    followRedirects: true
                }, timeoutMs);
                if (!response) return false;
            } catch (e) {
                return false;
            }
        }
        return true;
    };
    const pickWorkingWorkerProxy = async () => {
        const candidates = getWorkerProxyCandidates();
        if (!candidates.length) return null;
        for (let i = candidates.length - 1; i > 0; i--) {
            const j = Math.floor(Math.random() * (i + 1));
            const tmp = candidates[i];
            candidates[i] = candidates[j];
            candidates[j] = tmp;
        }
        const configuredMax = parseInt(String(process.env.MAX_PROXY_CHECKS || ""), 10);
        const maxChecks = Number.isFinite(configuredMax) && configuredMax > 0 ? Math.min(candidates.length, configuredMax) : Math.min(candidates.length, 50);
        let firstPortOpen = null;
        const warnedUnreachable = new Set;
        for (let i = 0; i < maxChecks; i++) {
            const proxy = candidates[i];
            const reachable = await testProxyReachability(proxy, 5500);
            if (reachable) return proxy;
            const portOpen = await testProxyConnection(proxy, 1200);
            if (portOpen) {
                if (!firstPortOpen) firstPortOpen = proxy;
                const displayUrl = proxy.url.includes("@") ? proxy.url.split("@")[1] : proxy.url;
                if (!warnedUnreachable.has(displayUrl)) {
                    warnedUnreachable.add(displayUrl);
                    console.log(`[WORKER] Proxy reachable port but cannot reach Arras: ${displayUrl}`);
                }
            }
        }
        if (firstPortOpen) {
            const fallbackDisplay = firstPortOpen.url.includes("@") ? firstPortOpen.url.split("@")[1] : firstPortOpen.url;
            console.log(`[WORKER] Falling back to proxy despite reachability checks: ${fallbackDisplay}`);
            return firstPortOpen;
        }
        const fallback = candidates[0] || null;
        if (fallback) {
            const fallbackDisplay = fallback.url.includes("@") ? fallback.url.split("@")[1] : fallback.url;
            console.log(`[WORKER] No pre-validated proxy. Attempting with first candidate: ${fallbackDisplay}`);
        }
        return fallback;
    };
    const normalizeSquadPrefix = value => {
        const raw = String(value || "").replace(/^#/, "").trim().toLowerCase();
        if (!raw) return "";
        const match = raw.match(/^([a-z]{2,3})/i);
        if (!match) return "";
        return match[1].toLowerCase();
    };
    const buildRuntimeConfig = (squadId, proxy, overrides = {}) => {
        const cleanSquadId = normalizeSquadPrefix(squadId);
        const defaultName = String(process.env.BOT_NAME || "tf").trim() || "tf";
        const requestedModeRaw = String(overrides.scanMode || "team").trim().toLowerCase();
        const scanMode = requestedModeRaw === "leaderboard" ? "leaderboard" : "team";
        const rawLeaderboardTimeout = parseInt(String(overrides.leaderboardTimeoutMs || ""), 10);
        const leaderboardTimeoutMs = Number.isFinite(rawLeaderboardTimeout) ? Math.max(2500, Math.min(25e3, rawLeaderboardTimeout)) : 8e3;
        return {
            id: `worker_${Date.now()}`,
            squadId: cleanSquadId,
            hash: "#" + cleanSquadId,
            name: defaultName,
            stats: [ 0, 0, 0, 0, 0, 0, 0, 0, 0, 0 ],
            type: "follow",
            token: "",
            autoFire: false,
            autoRespawn: true,
            target: "player",
            aim: "drone",
            keys: [],
            tank: "",
            joinSequence: [],
            autospin: false,
            chatSpam: "",
            reconnectAttempts: 0,
            reconnectDelay: 15e3,
            proxy: proxy || null,
            upgradeConfig: null,
            scanMode: scanMode,
            leaderboardTimeoutMs: leaderboardTimeoutMs
        };
    };
    process.on("message", message => {
        if (message.type === "start") {
            const squadId = message && message.config ? message.config.squadId : null;
            if (!squadId) {
                if (process.send) {
                    process.send({
                        type: "bot_error",
                        error: "Missing squadId"
                    });
                }
                return;
            }
            const normalizedSquad = normalizeSquadPrefix(squadId);
            if (!normalizedSquad) {
                if (process.send) {
                    process.send({
                        type: "bot_error",
                        error: 'Invalid squadId prefix. Use 2-3 letters like "ca".'
                    });
                }
                return;
            }
            (async () => {
                const forcedProxyInput = message && message.config ? message.config.proxy : null;
                const preferDirect = Boolean(message && message.config && message.config.preferDirect);
                let selectedProxy = null;
                if (forcedProxyInput && forcedProxyInput.url) {
                    const forcedType = forcedProxyInput.type === "http" ? "http" : "socks";
                    const candidate = {
                        type: forcedType,
                        url: String(forcedProxyInput.url)
                    };
                    const forcedAgent = createProxyAgent(candidate);
                    if (forcedAgent) {
                        selectedProxy = candidate;
                        const displayForced = selectedProxy.url.includes("@") ? selectedProxy.url.split("@")[1] : selectedProxy.url;
                        console.log(`[WORKER] Using forced proxy ${selectedProxy.type}: ${displayForced}`);
                    } else {
                        console.log("[WORKER] Forced proxy agent creation failed; falling back to auto proxy selection.");
                    }
                }
                if (!selectedProxy && !preferDirect) {
                    selectedProxy = await pickWorkingWorkerProxy();
                }
                if (!selectedProxy && !preferDirect) {
                    if (process.send) {
                        process.send({
                            type: "bot_error",
                            error: "No working proxy found in proxies.txt/proxies"
                        });
                    }
                    return;
                }
                if (selectedProxy) {
                    const displayProxy = selectedProxy.url.includes("@") ? selectedProxy.url.split("@")[1] : selectedProxy.url;
                    console.log(`[WORKER] Selected proxy ${selectedProxy.type}: ${displayProxy}`);
                } else {
                    console.log("[WORKER] No proxy selected; using direct connection.");
                }
                if (selectedProxy && arras && typeof arras.setBootstrapProxy === "function") {
                    arras.setBootstrapProxy(selectedProxy);
                }
                if (arras && typeof arras.startPrerequisites === "function") {
                    arras.startPrerequisites();
                }
                const requestedModeRaw = String(message && message.config ? message.config.scanMode : "team").trim().toLowerCase();
                const scanMode = requestedModeRaw === "leaderboard" ? "leaderboard" : "team";
                const requestedLeaderboardTimeout = parseInt(String(message && message.config ? message.config.leaderboardTimeoutMs : ""), 10);
                const config = buildRuntimeConfig(normalizedSquad, selectedProxy, {
                    scanMode: scanMode,
                    leaderboardTimeoutMs: requestedLeaderboardTimeout
                });
                arras.then(function() {
                    try {
                        currentBot = arras.create(config);
                    } catch (err) {
                        if (process.send) {
                            process.send({
                                type: "bot_error",
                                error: err && err.message ? err.message : "Failed to create bot runtime"
                            });
                        }
                    }
                });
            })().catch(err => {
                if (process.send) {
                    process.send({
                        type: "bot_error",
                        error: err && err.message ? err.message : "Worker failed to start"
                    });
                }
            });
        } else if (message.type === "pause") {
            isPaused = message.paused;
            if (currentBot && currentBot.log) currentBot.log(`Bot state is now: ${isPaused ? "PAUSED" : "RESUMED"}`);
        } else if (message.type === "key_command") {
            const {key: key} = message;
            if (currentBot && currentBot.simulateKey) currentBot.simulateKey(key);
        } else if (message.type === "stop_bot") {
            if (currentBot && currentBot.destroy) currentBot.destroy();
            process.exit();
        }
    });
    const options = {
        start: () => {}
    };
    const tree = {
        Browser: [ "Y", "Surfer" ],
        Strider: [ "K", "Fighter" ],
        Automingler: [ "J", "Mingler" ],
        Mingler: [ "K", "Hexa Tank" ],
        Necromancer: [ "Y", "Necromancer" ],
        Underseer: [ "I", "Director" ],
        Firework: [ "Y", "Rocketeer" ],
        Leviathan: [ "H", "Rocketeer" ],
        Rocketeer: [ "K", "Launcher" ],
        Annihilator: [ "U", "Destroyer" ],
        Destroyer: [ "Y", "Pounder" ],
        Swarmer: [ "I", "Launcher" ],
        Twister: [ "U", "Launcher" ],
        Launcher: [ "H", "Pounder" ],
        Fighter: [ "Y", "TriAngle" ],
        Surfer: [ "K", "TriAngle" ],
        Sprayer: [ "H", "Machine Gun" ],
        Redistributor: [ "Y", "Sprayer" ],
        Spreadshot: [ "U", "Triple Shot" ],
        Gale: [ "I", "Octo Tank" ],
        Crackshot: [ "J", "Penta Shot" ],
        "Penta Shot": [ "Y", "Triple Shot" ],
        Twin: [ "Y", "Basic" ],
        "Double Twin": [ "Y", "Twin" ],
        "Triple Shot": [ "U", "Twin" ],
        Sniper: [ "U", "Basic" ],
        "Machine Gun": [ "I", "Basic" ],
        Gunner: [ "I", "Machine Gun" ],
        "Machine Gunner": [ "H", "Gunner" ],
        Nailgun: [ "U", "Gunner" ],
        Pincer: [ "K", "Nailgun" ],
        "Flank Guard": [ "H", "Basic" ],
        "Hexa Tank": [ "Y", "Flank Guard" ],
        "Octo Tank": [ "Y", "Hexa Tank" ],
        Cyclone: [ "U", "Hexa Tank" ],
        HexaTrapper: [ "I", "Hexa Tank" ],
        TriAngle: [ "U", "Flank Guard" ],
        Fighter: [ "Y", "TriAngle" ],
        Booster: [ "U", "TriAngle" ],
        Falcon: [ "I", "TriAngle" ],
        Bomber: [ "H", "TriAngle" ],
        AutoTriAngle: [ "J", "TriAngle" ],
        Surfer: [ "K", "TriAngle" ],
        Auto3: [ "I", "Flank Guard" ],
        Auto5: [ "Y", "Auto3" ],
        Mega3: [ "U", "Auto3" ],
        Auto4: [ "I", "Auto3" ],
        Banshee: [ "H", "Auto3" ],
        "Trap Guard": [ "H", "Flank Guard" ],
        Buchwhacker: [ "Y", "Trap Guard" ],
        "Gunner Trapper": [ "U", "Trap Guard" ],
        Conqueror: [ "J", "Trap Guard" ],
        Bulwark: [ "K", "Trap Guard" ],
        TriTrapper: [ "J", "Flank Guard" ],
        Fortress: [ "Y", "TriTrapper" ],
        Septatrapper: [ "I", "TriTrapper" ],
        Whirlwind: [ "H", "Septatrapper" ],
        Nona: [ "Y", "Septatrapper" ],
        SeptaMachine: [ "U", "Septatrapper" ],
        Architect: [ "H", "TriTrapper" ],
        TripleTwin: [ "K", "Flank Guard" ],
        Director: [ "J", "Basic" ],
        Pounder: [ "K", "Basic" ],
        Healer: [ "X", "Basic" ],
        Physician: [ "Space", "Healer" ],
        Basic: [],
        Overseer: [ "Y", "Director" ],
        Cruiser: [ "U", "Director" ],
        Underseer: [ "I", "Director" ],
        Spawner: [ "H", "Director" ],
        "Director Drive": [ "J", "Director" ],
        Honcho: [ "K", "Director" ],
        Manager: [ "X", "Director" ],
        Foundry: [ "Space", "Spawner" ],
        "Top Banana": [ "Space", "Foundry" ],
        Shopper: [ "K", "Foundry" ],
        "Mega Spawner": [ "I", "Spawner" ],
        "Ultra Spawner": [ "Y", "Mega Spawner" ]
    }, getPath = function(name) {
        let p = "", o = tree[name];
        while (o) {
            p = o[0] + p;
            let n = o[1];
            if (n === "Basic") {
                break;
            }
            o = tree[n];
        }
        return p;
    };
    WebAssembly.instantiateStreaming = false;
    const arras = function() {
        const log = function() {
            const logger = global.console || console;
            if (logger && logger.log) {
                logger.log(`[headless]`, ...arguments);
            }
        };
        const throttledLogStateGlobal = {};
        const logThrottledGlobal = function(key, message, cooldownMs = 15e3) {
            const now = Date.now();
            const last = throttledLogStateGlobal[key] || 0;
            if (now - last >= cooldownMs) {
                throttledLogStateGlobal[key] = now;
                log(message);
            }
        };
        let lastRecieve = 0, currentBotInterface = {};
        const leaderPort = process.env.PARENT_PORT ? String(process.env.PARENT_PORT).trim() : "";
        const wu = leaderPort ? `ws://localhost:${leaderPort}` : null;
        let connect = function() {
            if (!wu) {
                return;
            }
            log("Connecting to leader/follower server...");
            socket = new ws(wu, {
                headers: {
                    "user-agent": "Mozilla/5.0 (X11; CrOS x86_64 14588.123.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Safari/537.36",
                    "accept-encoding": "gzip, deflate, br",
                    "accept-language": "en-US,en;q=0.9",
                    "cache-control": "no-cache",
                    connection: "Upgrade",
                    origin: "https://arras.io",
                    pragma: "no-cache",
                    upgrade: "websocket"
                },
                followRedirects: true,
                origin: "https://arras.io",
                localAddress: 0
            });
            socket.binaryType = "arraybuffer";
            socket.addEventListener("open", function() {
                log("Connected to leader/follower server. Waiting for server name to subscribe.");
            });
            socket.addEventListener("error", function(err) {
                const message = err && (err.message || err.code) ? err.message || err.code : String(err);
                log(`Leader/follower socket error: ${message}`);
            });
            socket.addEventListener("message", function(e) {
                try {
                    if (!currentBotInterface.target) return;
                    let data = unpack(new Uint8Array(e.data));
                    if (!data || !Array.isArray(data)) {
                        return;
                    }
                    const type = data.splice(0, 1)[0];
                    switch (type) {
                      case 101:
                        {
                            if (data.length >= 5) {
                                currentBotInterface.target[0] = data[0] / 10;
                                currentBotInterface.target[1] = data[1] / 10;
                                currentBotInterface.target[2] = data[2] / 10;
                                currentBotInterface.target[3] = data[3] / 10;
                                currentBotInterface.target[4] = data[4];
                                currentBotInterface.setActive(5);
                                lastRecieve = performance.now();
                            }
                            break;
                        }

                      case 102:
                        {
                            log(`Leader ${data[0]} is now inactive.`);
                            currentBotInterface.setActive(0);
                            currentBotInterface.setSubscribed(false);
                            break;
                        }

                      case 103:
                        {
                            log(`Error from server: ${data[0]}`);
                            currentBotInterface.setActive(0);
                            currentBotInterface.setSubscribed(false);
                            currentBotInterface.setSubscribed(false);
                            break;
                        }

                      case 105:
                        {
                            if (data.length >= 1) {
                                const key = data[0];
                                log(`Received Global Key Command: ${key}`);
                                if (currentBotInterface && trigger.keydown && trigger.keyup) {
                                    trigger.keydown(key);
                                    setTimeout(() => {
                                        trigger.keyup(key);
                                    }, 50);
                                }
                            }
                            break;
                        }
                    }
                } catch (e) {
                    log("Error processing message from server:", e);
                }
            });
            socket.addEventListener("close", function() {
                log("Disconnected from leader/follower server.");
                socket = false;
                subscribedToLeader = false;
                if (wu) {
                    setTimeout(connect, 3e3);
                }
            });
        }, socket = false, send = function(p) {
            if (socket && socket.readyState === 1) {
                socket.send(pack(p));
            }
        }, subscribedToLeader = false;
        if (wu) {
            connect();
        } else {
            log("Leader/follower socket disabled (PARENT_PORT not set).");
        }
        let app = false;
        const wasm = function() {
            return {
                ok: true,
                status: 200,
                arrayBuffer: async function() {
                    return app;
                },
                json: async () => ({}),
                text: async () => "",
                clone: function() {
                    return this;
                }
            };
        };
        let lastStatus = 0, statusData = "";
        const getStatus = function(f, s, agentOverride) {
            let now = Date.now();
            if (statusData && now - lastStatus < 15e3) {
                let cached = null;
                try {
                    cached = JSON.parse(statusData);
                } catch (e) {
                    cached = null;
                }
                if (!cached) {
                    statusData = "";
                } else {
                    s(cached);
                    return {
                        then: function() {
                            return {
                                then: function(f) {
                                    if (typeof f === "function") f(cached);
                                }
                            };
                        }
                    };
                }
            }
            let then = function() {};
            const statusFetchOptions = {
                followRedirects: true
            };
            if (agentOverride) {
                statusFetchOptions.agent = agentOverride;
            }
            realFetch(f, statusFetchOptions).then(x => x.text()).then(x => {
                let parsed = null;
                try {
                    parsed = JSON.parse(x);
                } catch (e) {
                    parsed = {
                        ok: false,
                        status: {}
                    };
                    logThrottledGlobal("status_non_json", `[status] Non-JSON status response. Continuing in degraded mode.`, 2e4);
                }
                statusData = JSON.stringify(parsed);
                lastStatus = Date.now();
                s(parsed);
                then(parsed);
            }).catch(err => {
                const msg = err && err.message ? err.message : String(err);
                logThrottledGlobal("status_fetch_failed", `[status] Fetch failed: ${msg}`, 2e4);
                const fallback = {
                    ok: false,
                    status: {}
                };
                statusData = JSON.stringify(fallback);
                lastStatus = Date.now();
                s(fallback);
                then(fallback);
            });
            return {
                then: function() {
                    return {
                        then: function(f) {
                            then = typeof f === "function" ? f : then;
                        }
                    };
                }
            };
        };
        const makeStubResponse = function(bodyText = "") {
            return {
                ok: true,
                status: 200,
                text: async function() {
                    return String(bodyText);
                },
                json: async function() {
                    return {};
                },
                arrayBuffer: async function() {
                    return new ArrayBuffer(0);
                },
                clone: function() {
                    return this;
                }
            };
        };
        let bootstrapProxy = null;
        let bootstrapAgent = null;
        let prerequisitesStarted = false;
        const setBootstrapProxy = function(proxy) {
            bootstrapProxy = proxy || null;
            bootstrapAgent = createProxyAgent(bootstrapProxy);
            if (bootstrapProxy && bootstrapAgent) {
                const displayUrl = bootstrapProxy.url.includes("@") ? bootstrapProxy.url.split("@")[1] : bootstrapProxy.url;
                const label = bootstrapProxy.type === "socks" ? "SOCKS5" : "HTTP";
                log(`[BOOT] Startup fetch proxy set: ${label} ${displayUrl}`);
            } else if (bootstrapProxy && !bootstrapAgent) {
                log("[BOOT] Startup proxy configured but agent creation failed.");
            }
        };
        const fetchBootstrapWithTimeout = function(target, options = {}, timeoutMs = 4500) {
            const controller = new AbortController;
            const timer = setTimeout(() => controller.abort(), timeoutMs);
            return realFetch(target, {
                followRedirects: true,
                ...options,
                signal: controller.signal
            }).finally(() => {
                clearTimeout(timer);
            });
        };
        const fetchBootstrap = function(target, options = {}) {
            const directOptions = {
                followRedirects: true,
                ...options
            };
            delete directOptions.agent;
            return fetchBootstrapWithTimeout(target, directOptions, 4500).catch(directErr => {
                if (!bootstrapAgent) {
                    throw directErr;
                }
                const msg = directErr && directErr.message ? directErr.message : String(directErr);
                log(`[BOOT] Direct fetch failed for ${target}: ${msg}. Retrying via proxy...`);
                return fetchBootstrapWithTimeout(target, {
                    ...options,
                    agent: bootstrapAgent
                }, 5500).catch(proxyErr => {
                    const proxyMsg = proxyErr && proxyErr.message ? proxyErr.message : String(proxyErr);
                    log(`[BOOT] Proxy fetch failed for ${target}: ${proxyMsg}.`);
                    throw proxyErr;
                });
            });
        };
        let ready = false, script = false, o = [], then = function(f) {
            if (ready) {
                f();
            } else {
                o.push(f);
            }
        };
        const initializeAndRunQueue = function() {
            ready = true;
            log("Headless arras ready.");
            for (let i = 0, l = o.length; i < l; i++) {
                o[i]();
            }
            o = [];
            then = function(f) {
                f();
            };
        };
        let prerequisites = 0;
        const onPrerequisiteLoaded = function() {
            prerequisites++;
            if (prerequisites === 2) {
                initializeAndRunQueue();
            }
        };
        const loadLocalWasm = function() {
            const candidates = [ path.resolve(__dirname, "..", "app.wasm"), path.resolve(process.cwd(), "app.wasm"), path.resolve(__dirname, "app.wasm") ];
            for (const candidate of candidates) {
                try {
                    if (!fs.existsSync(candidate)) continue;
                    const buf = fs.readFileSync(candidate);
                    if (!buf || !buf.length) continue;
                    app = buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength);
                    log(`Prerequisite 1/2: app.wasm loaded from local cache (${candidate}).`);
                    onPrerequisiteLoaded();
                    return true;
                } catch (e) {}
            }
            return false;
        };
        const loadWasm = function() {
            const networkUrl = "https://arras.io/app.wasm";
            const useLocalWasm = String(process.env.USE_LOCAL_WASM || "").toLowerCase() === "true";
            const loadFromNetwork = () => {
                fetchBootstrap(networkUrl).then(x => {
                    x.arrayBuffer().then(x => {
                        app = x;
                        log("Prerequisite 1/2: app.wasm loaded from network.");
                        onPrerequisiteLoaded();
                    });
                }).catch(err => {
                    if (!useLocalWasm && loadLocalWasm()) {
                        log("Prerequisite 1/2: app.wasm network fetch failed, using local fallback.");
                        return;
                    }
                    log(`FATAL: Could not load app.wasm: ${err && err.message ? err.message : String(err)}`);
                });
            };
            if (useLocalWasm && loadLocalWasm()) {
                return;
            }
            loadFromNetwork();
        };
        const loadScript = function() {
            const localScriptPaths = [ path.resolve(__dirname, "client.js"), path.resolve(__dirname, "..", "client.js"), path.resolve(process.cwd(), "workerfiles", "client.js"), path.resolve(process.cwd(), "client.js") ];
            const scriptCachePaths = [ path.resolve(__dirname, "arras_game_script_cache.js"), path.resolve(process.cwd(), "workerfiles", "arras_game_script_cache.js"), path.resolve(process.cwd(), "arras_game_script_cache.js") ];
            const readLocalScript = function() {
                for (const file of localScriptPaths) {
                    try {
                        if (!fs.existsSync(file)) continue;
                        const content = fs.readFileSync(file, "utf8");
                        if (typeof content === "string" && content.length > 1e3) {
                            return {
                                file: file,
                                content: content
                            };
                        }
                    } catch (e) {}
                }
                return null;
            };
            const readCachedScript = function() {
                for (const file of scriptCachePaths) {
                    try {
                        if (!fs.existsSync(file)) continue;
                        const stat = fs.statSync(file);
                        if (!stat || !stat.mtimeMs || Date.now() - stat.mtimeMs > 1e3 * 60 * 60 * 18) continue;
                        const content = fs.readFileSync(file, "utf8");
                        if (typeof content === "string" && content.length > 1e3) {
                            return {
                                file: file,
                                content: content
                            };
                        }
                    } catch (e) {}
                }
                return null;
            };
            const writeScriptCache = function(content) {
                if (typeof content !== "string" || content.length < 1e3) return;
                const target = scriptCachePaths[0];
                try {
                    fs.writeFileSync(target, content, "utf8");
                } catch (e) {}
            };
            const patchUnsafeStringEncoder = scriptContent => {
                if (typeof scriptContent !== "string" || !scriptContent.length) {
                    return scriptContent;
                }
                const unsafeEncoderPattern = /c=\(e,t\)=>\{if\(i\.test\(t\)\)\{let a=h\.c\(t\.length,1\),o=r\(\);for\(let e=0;e<t\.length;e\+\+\)o\[a\+e\]=t\.charCodeAt\(e\);n\(\)\.set\(\[a,t\.length\],e>>2\)\}else u\(e,s\.encode\(t\)\)\},u=\(e,t\)=>\{let a=h\.c\(t\.length,1\);r\(\)\.set\(t,a\),n\(\)\.set\(\[a,t\.length\],e>>2\)\},/;
                const safeEncoderBlock = 'c=(e,t)=>{if(null==t){n().set([0,0],e>>2);return}"string"!=typeof t&&(t=String(t));if(i.test(t)){let a=h.c(t.length,1),o=r();for(let e=0;e<t.length;e++)o[a+e]=t.charCodeAt(e);n().set([a,t.length],e>>2)}else u(e,s.encode(t))},u=(e,t)=>{if(null==t){n().set([0,0],e>>2);return}let a=h.c(t.length,1);r().set(t,a),n().set([a,t.length],e>>2)},';
                const unsafeStrokeCallPattern = /e\[t\]\.stroke\(\)/g;
                const safeStrokeCall = "(e[t]&&e[t].stroke?e[t].stroke():void 0)";
                const unsafeContextLostPattern = /e\[t\]\.isContextLost\(\)/g;
                const safeContextLostCall = "(e[t]&&e[t].isContextLost?e[t].isContextLost():false)";
                const unsafeCallbackPattern1 = /\(a,o,n,l,s\)=>t\(a,e\[o\]\(e\[n\],d\.decode\(r\(\)\.subarray\(l,l\+s\)\)\)\)/g;
                const safeCallbackPattern1 = '(a,o,n,l,s)=>t(a,("function"==typeof e[o]?e[o]:(()=>void 0))(e[n],d.decode(r().subarray(l,l+s))))';
                const unsafeCallbackPattern2 = /\(a,r,o\)=>t\(a,e\[r\]\(e\[o\]\)\)/g;
                const safeCallbackPattern2 = '(a,r,o)=>t(a,("function"==typeof e[r]?e[r]:(()=>void 0))(e[o]))';
                const unsafeGetContextPattern = /\(a,r,o\)=>t\(a,e\[r\]\.getContext\("2d",\{alpha:o>0\}\)\)/g;
                const safeGetContextPattern = '(a,r,o)=>t(a,e[r]&&e[r].getContext?e[r].getContext("2d",{alpha:o>0}):null)';
                const unsafeClientsPattern = /\(t,a\)=>e\[t\]\[a\]\.clients/g;
                const safeClientsPattern = "(t,a)=>e[t]&&e[t][a]&&void 0!==e[t][a].clients?e[t][a].clients:0";
                const unsafeTimestampPattern = /t=>e\[t\]\[0\]\.timestamp/g;
                const safeTimestampPattern = "t=>e[t]&&e[t][0]&&void 0!==e[t][0].timestamp?e[t][0].timestamp:Date.now()";
                const unsafeMsptPattern = /\(t,a\)=>e\[t\]\[a\]\.mspt/g;
                const safeMsptPattern = "(t,a)=>e[t]&&e[t][a]&&void 0!==e[t][a].mspt?e[t][a].mspt:0";
                const unsafeFnCall6Pattern = /\(t,a,r,o,n,l,s\)=>e\[t\]\(e\[a\],r,o,n,l,s\)/g;
                const safeFnCall6Pattern = '(t,a,r,o,n,l,s)=>("function"==typeof e[t]?e[t]:(()=>void 0))(e[a],r,o,n,l,s)';
                const unsafeFnCall1Pattern = /\(t,a\)=>e\[t\]\(e\[a\]\)/g;
                const safeFnCall1Pattern = '(t,a)=>("function"==typeof e[t]?e[t]:(()=>void 0))(e[a])';
                const unsafeNoArgMethodPattern = /e\[([a-zA-Z_$][\w$]*)\]\.([A-Za-z_$][\w$]*)\(\)/g;
                const unsafeAnyMethodCallPattern = /e\[([a-zA-Z_$][\w$]*)\]\.([A-Za-z_$][\w$]*)\(/g;
                const unsafeDirectCallPattern = /e\[([a-zA-Z_$][\w$]*)\]\(/g;
                const unsafeObjectAccessPattern = /e\[([a-zA-Z_$][\w$]*)\]\./g;
                const unsafeStyleAssignPattern = /e\[([a-zA-Z_$][\w$]*)\]\.style\.([A-Za-z_$][\w$]*)=/g;
                const unsafeSelfAssignPattern = /([a-zA-Z_$][\w$]*)=e\[\1\],/g;
                const unsafeAnyAssignPattern = /([a-zA-Z_$][\w$]*)=e\[([^\]]+)\],/g;
                const unsafeReadyStateSendPattern = /\(t,a,o\)=>\{t=e\[t\],a=r\(\)\.subarray\(a,a\+o\),1===t\.readyState&&t\.send\(a\)\}/g;
                const safeReadyStateSendPattern = "(t,a,o)=>{t=e[t],a=r().subarray(a,a+o),t&&1===t.readyState&&t.send&&t.send(a)}";
                const unsafeThenPattern = /\(t,a\)=>\{t=e\[t\],a=e\[a\],t\.then\(e=>a\(e\)\)\}/g;
                const safeThenPattern = '(t,a)=>{t=e[t],a=e[a],t&&"function"==typeof t.then&&t.then(e=>{"function"==typeof a&&a(e)})}';
                let working = scriptContent;
                if (!unsafeEncoderPattern.test(scriptContent)) {
                    log("[SCRIPT] Warning: unsafe encoder pattern not found; script left unchanged.");
                } else {
                    working = working.replace(unsafeEncoderPattern, safeEncoderBlock);
                    if (working !== scriptContent) {
                        log("[SCRIPT] Applied null-safe encoder patch to game script.");
                    }
                }
                const strokePatched = working.replace(unsafeStrokeCallPattern, safeStrokeCall);
                if (strokePatched !== working) {
                    working = strokePatched;
                    log("[SCRIPT] Applied safe-stroke patch to game script.");
                }
                const contextPatched = working.replace(unsafeContextLostPattern, safeContextLostCall);
                if (contextPatched !== working) {
                    working = contextPatched;
                    log("[SCRIPT] Applied safe-isContextLost patch to game script.");
                }
                const cbPatched1 = working.replace(unsafeCallbackPattern1, safeCallbackPattern1);
                if (cbPatched1 !== working) {
                    working = cbPatched1;
                    log("[SCRIPT] Applied safe callback patch #1 to game script.");
                }
                const cbPatched2 = working.replace(unsafeCallbackPattern2, safeCallbackPattern2);
                if (cbPatched2 !== working) {
                    working = cbPatched2;
                    log("[SCRIPT] Applied safe callback patch #2 to game script.");
                }
                const ctxPatched = working.replace(unsafeGetContextPattern, safeGetContextPattern);
                if (ctxPatched !== working) {
                    working = ctxPatched;
                    log("[SCRIPT] Applied safe getContext patch to game script.");
                }
                const clientsPatched = working.replace(unsafeClientsPattern, safeClientsPattern);
                if (clientsPatched !== working) {
                    working = clientsPatched;
                    log("[SCRIPT] Applied safe clients patch to game script.");
                }
                const tsPatched = working.replace(unsafeTimestampPattern, safeTimestampPattern);
                if (tsPatched !== working) {
                    working = tsPatched;
                    log("[SCRIPT] Applied safe timestamp patch to game script.");
                }
                const msptPatched = working.replace(unsafeMsptPattern, safeMsptPattern);
                if (msptPatched !== working) {
                    working = msptPatched;
                    log("[SCRIPT] Applied safe mspt patch to game script.");
                }
                const fn6Patched = working.replace(unsafeFnCall6Pattern, safeFnCall6Pattern);
                if (fn6Patched !== working) {
                    working = fn6Patched;
                    log("[SCRIPT] Applied safe function-call(6) patch to game script.");
                }
                const fn1Patched = working.replace(unsafeFnCall1Pattern, safeFnCall1Pattern);
                if (fn1Patched !== working) {
                    working = fn1Patched;
                    log("[SCRIPT] Applied safe function-call(1) patch to game script.");
                }
                const noArgPatched = working.replace(unsafeNoArgMethodPattern, (full, ref, method) => {
                    if (method === "isContextLost") {
                        return `(e[${ref}]&&e[${ref}].isContextLost?e[${ref}].isContextLost():false)`;
                    }
                    return `(e[${ref}]&&e[${ref}].${method}?e[${ref}].${method}():void 0)`;
                });
                if (noArgPatched !== working) {
                    working = noArgPatched;
                    log("[SCRIPT] Applied guarded no-arg method patch to game script.");
                }
                const anyMethodPatched = working.replace(unsafeAnyMethodCallPattern, "((e[$1]&&e[$1].$2)?e[$1].$2.bind(e[$1]):(()=>void 0))(");
                if (anyMethodPatched !== working) {
                    working = anyMethodPatched;
                    log("[SCRIPT] Applied guarded method-call patch to game script.");
                }
                const directCallPatched = working.replace(unsafeDirectCallPattern, '("function"==typeof e[$1]?e[$1]:(()=>void 0))(');
                if (directCallPatched !== working) {
                    working = directCallPatched;
                    log("[SCRIPT] Applied guarded direct-call patch to game script.");
                }
                const styleAssignPatched = working.replace(unsafeStyleAssignPattern, "((e[$1]&&((e[$1].style=e[$1].style||{}),e[$1].style))||{}).$2=");
                if (styleAssignPatched !== working) {
                    working = styleAssignPatched;
                    log("[SCRIPT] Applied guarded style-assign patch to game script.");
                }
                const objAccessPatched = working.replace(unsafeObjectAccessPattern, "((e[$1])||{}).");
                if (objAccessPatched !== working) {
                    working = objAccessPatched;
                    log("[SCRIPT] Applied guarded object-access patch to game script.");
                }
                const selfAssignPatched = working.replace(unsafeSelfAssignPattern, "$1=e[$1]||{},");
                if (selfAssignPatched !== working) {
                    working = selfAssignPatched;
                    log("[SCRIPT] Applied guarded self-assign patch to game script.");
                }
                const anyAssignPatched = working.replace(unsafeAnyAssignPattern, "$1=e[$2]||{},");
                if (anyAssignPatched !== working) {
                    working = anyAssignPatched;
                    log("[SCRIPT] Applied guarded generic-assign patch to game script.");
                }
                const readyPatched = working.replace(unsafeReadyStateSendPattern, safeReadyStateSendPattern);
                if (readyPatched !== working) {
                    working = readyPatched;
                    log("[SCRIPT] Applied safe readyState-send patch to game script.");
                }
                const thenPatched = working.replace(unsafeThenPattern, safeThenPattern);
                if (thenPatched !== working) {
                    working = thenPatched;
                    log("[SCRIPT] Applied safe promise-then patch to game script.");
                }
                return working;
            };
            let scriptLoaded = false;
            const activateBot = (scriptContent, sourceLabel = "network") => {
                if (scriptLoaded) return;
                scriptLoaded = true;
                const shouldPatch = String(process.env.PATCH_REMOTE_CLIENT || "").toLowerCase() === "true" && !String(sourceLabel || "").toLowerCase().includes("local");
                if (shouldPatch) {
                    script = patchUnsafeStringEncoder(scriptContent);
                    log("[SCRIPT] Applied patch transforms to remote client.js.");
                } else {
                    script = scriptContent;
                    if (String(sourceLabel || "").toLowerCase().includes("local")) {
                        log("[SCRIPT] Using local client.js without patch transforms.");
                    } else {
                        log(`[SCRIPT] Using ${sourceLabel} client.js without patch transforms.`);
                    }
                }
                log(`Prerequisite 2/2: Game script loaded (${sourceLabel}).`);
                onPrerequisiteLoaded();
            };
            const extractScriptFromHtml = html => {
                const scriptTagStart = html.indexOf("<script>");
                if (scriptTagStart === -1) {
                    log("Error: Could not find <script> tag in content.");
                    return null;
                }
                let scriptContent = html.slice(scriptTagStart + 8);
                const scriptTagEnd = scriptContent.indexOf("</script");
                if (scriptTagEnd === -1) {
                    log("Error: Could not find closing <\/script> tag.");
                    return null;
                }
                scriptContent = scriptContent.slice(0, scriptTagEnd);
                return scriptContent;
            };
            const fetchScriptFromNetwork = function(allowActivate, onFail = null) {
                const scriptEntryUrl = "https://arras.io";
                log(`Fetching from ${scriptEntryUrl} to ensure correct script execution order...`);
                fetchBootstrap(scriptEntryUrl).then(x => x.text()).then(html => {
                    const extractedScript = extractScriptFromHtml(html);
                    if (!extractedScript) {
                        if (allowActivate && typeof onFail === "function" && onFail(new Error("Could not parse arras.io script."))) {
                            return;
                        }
                        if (allowActivate) {
                            log("FATAL: Could not parse arras.io script and no fallback is available.");
                        }
                        return;
                    }
                    writeScriptCache(extractedScript);
                    if (allowActivate) {
                        activateBot(extractedScript, "network");
                    }
                }).catch(err => {
                    if (allowActivate && typeof onFail === "function" && onFail(err)) {
                        return;
                    }
                    if (allowActivate) {
                        log("FATAL: Could not fetch from arras.io. Please check network or use a valid cache file.", err);
                    } else {
                        log(`Script refresh failed: ${err && err.message ? err.message : String(err)}`);
                    }
                });
            };
            const useLocalClient = String(process.env.USE_LOCAL_CLIENT || "").toLowerCase() === "true";
            const localScript = readLocalScript();
            const cached = readCachedScript();
            const activateNetworkFallback = function() {
                if (cached) {
                    log(`Network script fetch failed, using cache: ${cached.file}`);
                    activateBot(cached.content, "cache");
                    return true;
                }
                if (localScript) {
                    log(`Network script fetch failed, using local file: ${localScript.file}`);
                    activateBot(localScript.content, "local-file");
                    return true;
                }
                return false;
            };
            if (useLocalClient) {
                if (localScript) {
                    log(`Loading game script from local file: ${localScript.file}`);
                    activateBot(localScript.content, "local-file");
                    return;
                }
                log("[SCRIPT] Local client.js not found, falling back to cache/network.");
            }
            const useScriptCache = String(process.env.USE_SCRIPT_CACHE || "").toLowerCase() === "true";
            if (useScriptCache) {
                if (cached) {
                    log(`Loading game script from cache: ${cached.file}`);
                    activateBot(cached.content, "cache");
                    fetchScriptFromNetwork(false);
                    return;
                }
            }
            fetchScriptFromNetwork(true, () => activateNetworkFallback());
        };
        const startPrerequisites = function() {
            if (prerequisitesStarted) return;
            prerequisitesStarted = true;
            loadWasm();
            loadScript();
        };
        const run = function(x, config, oa) {
            const originalConsole = global.console;
            const customConsole = {
                log: new Proxy(originalConsole.log, {
                    apply: function(a, b, c) {
                        if (c[0] === "%cStop!" || c[0] && c[0].startsWith && c[0].startsWith("%cHackers have been known")) {
                            return;
                        }
                        return Reflect.apply(a, b, c);
                    }
                }),
                error: originalConsole.error.bind(originalConsole),
                warn: originalConsole.warn.bind(originalConsole),
                info: originalConsole.info.bind(originalConsole),
                debug: originalConsole.log.bind(originalConsole)
            };
            const log = function() {
                if (originalConsole && originalConsole.log) {
                    originalConsole.log(`[headless ${config.id}]`, ...arguments);
                } else {
                    process.stdout.write(`[headless ${config.id}] ` + Array.from(arguments).join(" ") + "\n");
                }
            };
            const throttledLogState = {};
            const logThrottled = function(key, message, cooldownMs = 15e3) {
                const now = Date.now();
                const last = throttledLogState[key] || 0;
                if (now - last >= cooldownMs) {
                    throttledLogState[key] = now;
                    log(message);
                }
            };
            const console = customConsole;
            const setGlobal = (key, value) => {
                try {
                    Object.defineProperty(global, key, {
                        value: value,
                        configurable: true,
                        writable: true,
                        enumerable: true
                    });
                } catch (e) {
                    try {
                        global[key] = value;
                    } catch (e2) {}
                }
            };
            let firstJoin = false, hasJoined = false, died = false, disconnected = false, connected = false, inGame = false, upgrade = false, a = false;
            let statusRecieved = false, status = [], timeouts = {};
            let position = [ 0, 0, 5 ], ignore = false, st = 2, lx = 0, gd = 1, canvasRef = {}, sr = 1, s = 1;
            const runMode = String(config && config.scanMode ? config.scanMode : "team").toLowerCase() === "leaderboard" ? "leaderboard" : "team";
            const isLeaderboardMode = runMode === "leaderboard";
            let delayedSpawnFetchTimer = null;
            let noUrlAfterJoinTimer = null;
            let wsPostOpenNoDigitsTimer = null;
            let wsConstructed = false;
            let wsOpened = false;
            let wsJoinWatchdogTimer = null;
            let leaderboardEmitTimer = null;
            let leaderboardTimeoutTimer = null;
            const eventLog = null;
            let target = [ 0, 0, 0, 0, false ], active = 0, subscribedToLeader = false;
            const internalBotInterface = {
                target: target,
                setActive: val => {
                    active = val;
                },
                setSubscribed: val => {
                    subscribedToLeader = val;
                },
                setActive: val => {
                    active = val;
                },
                setSubscribed: val => {
                    subscribedToLeader = val;
                },
                log: log,
                simulateKey: code => {
                    if (trigger.keydown && trigger.keyup) {
                        trigger.keydown(code);
                        setTimeout(() => trigger.keyup(code), 50);
                    }
                }
            };
            let destroy = function() {
                if (destroyed) {
                    return;
                }
                log("Destroying instance...");
                if (delayedSpawnFetchTimer) {
                    clearTimeout(delayedSpawnFetchTimer);
                    delayedSpawnFetchTimer = null;
                }
                if (postSpawnNoDigitsTimer) {
                    clearTimeout(postSpawnNoDigitsTimer);
                    postSpawnNoDigitsTimer = null;
                }
                if (noUrlAfterJoinTimer) {
                    clearTimeout(noUrlAfterJoinTimer);
                    noUrlAfterJoinTimer = null;
                }
                if (wsPostOpenNoDigitsTimer) {
                    clearTimeout(wsPostOpenNoDigitsTimer);
                    wsPostOpenNoDigitsTimer = null;
                }
                if (wsJoinWatchdogTimer) {
                    clearTimeout(wsJoinWatchdogTimer);
                    wsJoinWatchdogTimer = null;
                }
                if (leaderboardEmitTimer) {
                    clearTimeout(leaderboardEmitTimer);
                    leaderboardEmitTimer = null;
                }
                if (leaderboardTimeoutTimer) {
                    clearTimeout(leaderboardTimeoutTimer);
                    leaderboardTimeoutTimer = null;
                }
                if (gameSocket && gameSocket.readyState < 3) {
                    gameSocket.close();
                    gameSocket = false;
                }
                clearInterval(mainInterval);
                destroyed = true;
            }, destroyed = false;
            const setInterval = new Proxy(global.setInterval, {
                apply: function(a, b, c) {
                    if (destroyed) {
                        return;
                    }
                    return Reflect.apply(a, b, c);
                }
            }), setTimeout = new Proxy(global.setTimeout, {
                apply: function(a, b, c) {
                    if (destroyed) {
                        return;
                    }
                    return Reflect.apply(a, b, c);
                }
            });
            const h = function(o) {
                return new Proxy(o, {
                    get: function(a, b, c) {
                        let d = Reflect.get(a, b, c);
                        return d;
                    },
                    set: function(a, b, c) {
                        return Reflect.set(a, b, c);
                    }
                });
            };
            const handleListener = function(type, f, target) {
                listeners[type] = f;
            };
            const listeners = {};
            const keyFromCode = function(code) {
                const text = String(code || "");
                if (text === "Enter" || text === "NumpadEnter") return "Enter";
                if (text.startsWith("Key") && text.length === 4) return text.slice(3);
                if (text.startsWith("Digit") && text.length === 6) return text.slice(5);
                return text;
            };
            const keyCodeFromCode = function(code) {
                const text = String(code || "");
                if (text === "Enter" || text === "NumpadEnter") return 13;
                if (text.startsWith("Digit") && text.length === 6) {
                    const d = text.slice(5);
                    const n = parseInt(d, 10);
                    if (Number.isFinite(n)) return 48 + n;
                }
                if (text.startsWith("Key") && text.length === 4) {
                    const ch = text.charCodeAt(3);
                    if (ch >= 65 && ch <= 90) return ch;
                }
                return 0;
            };
            const trigger = {
                mousemove: function(clientX, clientY) {
                    if (listeners.mousemove) {
                        listeners.mousemove({
                            isTrusted: true,
                            clientX: clientX,
                            clientY: clientY
                        });
                    }
                },
                mousedown: function(clientX, clientY, button) {
                    if (listeners.mousedown) {
                        listeners.mousedown({
                            isTrusted: true,
                            clientX: clientX,
                            clientY: clientY,
                            button: button
                        });
                    }
                },
                mouseup: function(clientX, clientY, button) {
                    if (listeners.mouseup) {
                        listeners.mouseup({
                            isTrusted: true,
                            clientX: clientX,
                            clientY: clientY,
                            button: button
                        });
                    }
                },
                keydown: function(code, repeat) {
                    if (listeners.keydown) {
                        listeners.keydown({
                            isTrusted: true,
                            code: code,
                            key: "",
                            repeat: repeat || false,
                            preventDefault: function() {}
                        });
                    }
                },
                keyup: function(code, repeat) {
                    if (listeners.keyup) {
                        listeners.keyup({
                            isTrusted: true,
                            code: code,
                            key: "",
                            repeat: repeat || false,
                            preventDefault: function() {}
                        });
                    }
                }
            };
            let window = {
                WebAssembly: WebAssembly,
                googletag: {
                    cmd: {
                        push: function(f) {
                            try {
                                f();
                            } catch (e) {}
                        }
                    },
                    defineSlot: function() {
                        return this;
                    },
                    addService: function() {
                        return this;
                    },
                    display: function() {
                        return this;
                    },
                    pubads: function() {
                        return this;
                    },
                    enableSingleRequest: function() {
                        return this;
                    },
                    collapseEmptyDivs: function() {
                        return this;
                    },
                    enableServices: function() {
                        return this;
                    }
                },
                arrasAdDone: true
            };
            setGlobal("window", window);
            setGlobal("parent", window);
            setGlobal("top", window);
            setGlobal("self", window);
            window.crypto = {
                getRandomValues: function(a) {
                    return a;
                }
            };
            setGlobal("crypto", window.crypto);
            window.addEventListener = function(type, f) {
                handleListener(type, f, window);
            };
            setGlobal("addEventListener", window.addEventListener);
            window.removeEventListener = function(type, f) {};
            setGlobal("removeEventListener", window.removeEventListener);
            window.Image = function() {
                return {};
            };
            setGlobal("Image", window.Image);
            window.navigator = {
                userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
                vendor: "Google Inc.",
                platform: "Win32",
                onLine: true,
                languages: [ "en-US", "en" ],
                getBattery: () => Promise.resolve({
                    charging: true,
                    level: 1
                })
            };
            setGlobal("navigator", window.navigator);
            window.screen = {
                width: 1920,
                height: 1080,
                availWidth: 1920,
                availHeight: 1040,
                colorDepth: 24,
                pixelDepth: 24
            };
            setGlobal("screen", window.screen);
            window.localStorage = {
                getItem: () => null,
                setItem: () => {},
                removeItem: () => {},
                clear: () => {},
                length: 0
            };
            setGlobal("localStorage", window.localStorage);
            window.sessionStorage = {
                getItem: () => null,
                setItem: () => {},
                removeItem: () => {},
                clear: () => {},
                length: 0
            };
            setGlobal("sessionStorage", window.sessionStorage);
            window.history = {
                pushState: () => {},
                replaceState: () => {},
                go: () => {},
                back: () => {},
                forward: () => {},
                length: 1
            };
            setGlobal("history", window.history);
            const crypto = window.crypto;
            const addEventListener = window.addEventListener;
            const removeEventListener = window.removeEventListener;
            const Image = window.Image;
            let inputs = [], setValue = function(str) {
                for (let i = 0, l = inputs.length; i < l; i++) {
                    inputs[i].value = str;
                }
            };
            let innerWidth = window.innerWidth = 500;
            let innerHeight = window.innerHeight = 500;
            const g = function() {
                let w = innerWidth;
                let h = innerHeight;
                if (!canvasRef || typeof canvasRef !== "object") {
                    canvasRef = {};
                }
                if (!canvasRef.width) canvasRef.width = w;
                if (w * .5625 > h) {
                    s = 888.888888888 / w;
                } else {
                    s = 500 / h;
                }
                sr = (canvasRef.width || w) / w;
            };
            g();
            const document = function() {
                const emptyFunc = () => {};
                const emptyStyle = {
                    setProperty: emptyFunc
                };
                const makeSafeProxy = (target, scalarDefaults = {}) => new Proxy(target, {
                    get: function(obj, prop, receiver) {
                        if (Reflect.has(obj, prop)) {
                            return Reflect.get(obj, prop, receiver);
                        }
                        if (typeof prop === "string") {
                            if (Object.prototype.hasOwnProperty.call(scalarDefaults, prop)) {
                                return scalarDefaults[prop];
                            }
                            if (prop === "style") return emptyStyle;
                            if (prop === "dataset") {
                                obj.dataset = obj.dataset || {};
                                return obj.dataset;
                            }
                            if (prop === "classList") {
                                if (!obj.classList) {
                                    obj.classList = {
                                        add: emptyFunc,
                                        remove: emptyFunc,
                                        toggle: emptyFunc,
                                        contains: () => false
                                    };
                                }
                                return obj.classList;
                            }
                            return emptyFunc;
                        }
                        return undefined;
                    },
                    set: function(obj, prop, value) {
                        obj[prop] = value;
                        return true;
                    }
                });
                const simulatedContext2DBase = {
                    isContextLost: () => false,
                    fillText: function() {
                        if (ignore) {
                            return;
                        }
                        let a = Array.from(arguments);
                        const textValue = typeof a[0] === "string" ? a[0] : "";
                        if (textValue) {
                            captureServerStatusText("canvas-filltext", textValue, a[1], a[2]);
                            captureLeaderboardText("canvas-filltext", textValue, a[1], a[2]);
                        }
                        if (textValue) {
                            const fullUrlMatch = textValue.match(/(?:https?:\/\/)?(?:www\.)?arras\.io\/#([a-z]{2,3}[1-4][a-z0-9]*)(?![a-z0-9])(?:\?q=[1-4])?/i);
                            if (fullUrlMatch) {
                                emitJoinedLink("canvas-text", `https://arras.io/#${fullUrlMatch[1]}`);
                            } else {
                                const hashOnlyMatch = textValue.match(/#([a-z]{2,3}[1-4][a-z0-9]*)(?![a-z0-9])(?:\?q=[1-4])?/i);
                                if (hashOnlyMatch) {
                                    emitJoinedLink("canvas-text", `#${hashOnlyMatch[1]}`);
                                } else {
                                    sniffAndEmitJoinedLink("canvas-text-token", textValue);
                                }
                            }
                        }
                        if (this.font === "bold 7px Ubuntu" && this.fillStyle === "rgb(255,255,255)") {
                            if (a[0] === `You have spawned! Welcome to the game.`) {
                                spawnConfirmed = true;
                                hasJoined = firstJoin = true;
                                scheduleDelayedSpawnFetch("spawn-banner");
                                armPostSpawnNoDigitsTimer("spawn-banner");
                                armLeaderboardTimeout("spawn-banner");
                                setTimeout(() => {
                                    if (!destroyed && !disconnected && config.proxy) {
                                        process.send({
                                            type: "verified_good",
                                            proxyUrl: config.proxy.url
                                        });
                                    }
                                }, 3e4);
                            } else if (a[0] === "You have traveled through a portal!") {
                                hasJoined = true;
                            }
                            if (a[0].startsWith("The server was ") && a[0].endsWith("% active") || a[0].startsWith("Survived for ") || a[0].startsWith("Succumbed to ") || a[0] === "You have self-destructed." || a[0] === `Vanished into thin air` || a[0].startsWith("You have been killed by ")) {
                                died = true;
                            }
                            if (!a[0].startsWith(`You're using an ad blocker.`) && a[0] !== "Respawn" && a[0] !== "Back" && a[0] !== "Reconnect" && a[0].length > 2) {
                                log("[arras]", a[0]);
                            }
                        }
                        if (this.font === "bold 7.5px Ubuntu" && this.fillStyle === "rgb(231,137,109)") {
                            const msg = a[0];
                            const lowered = msg.toLowerCase();
                            if (lowered.includes("temporarily banned") || lowered.includes("blacklisted")) {
                                disconnected = true;
                                if (config.proxy) {
                                    process.send({
                                        type: "blacklisted",
                                        proxyUrl: config.proxy.url,
                                        reason: msg
                                    });
                                }
                                destroy();
                                log("[arras-blacklisted]", msg);
                            } else if (msg.startsWith("The connection closed due to ")) {
                                disconnected = true;
                                destroy();
                                log("[arras-disconnect]", msg);
                            }
                        }
                        if (this.font === "bold 5.1px Ubuntu" && this.fillStyle === "rgb(255,255,255)") {
                            if (a[0].startsWith("Coordinates: (")) {
                                let b = a[0].slice(14), l = b.length;
                                if (b[l - 1] === ")") {
                                    b = b.slice(0, l - 1).split(", ");
                                    if (b.length === 2) {
                                        let x = parseFloat(b[0]);
                                        let y = parseFloat(b[1]);
                                        position[0] = x;
                                        position[1] = y;
                                        position[2] = 5;
                                    }
                                }
                            }
                        }
                    },
                    strokeText: function() {
                        if (ignore) {
                            return;
                        }
                        let a = Array.from(arguments);
                        const textValue = typeof a[0] === "string" ? a[0] : "";
                        if (!textValue) return;
                        captureServerStatusText("canvas-stroketext", textValue, a[1], a[2]);
                        captureLeaderboardText("canvas-stroketext", textValue, a[1], a[2]);
                        const fullUrlMatch = textValue.match(/(?:https?:\/\/)?(?:www\.)?arras\.io\/#([a-z]{2,3}[1-4][a-z0-9]*)(?![a-z0-9])(?:\?q=[1-4])?/i);
                        if (fullUrlMatch) {
                            emitJoinedLink("canvas-stroke-text", `https://arras.io/#${fullUrlMatch[1]}`);
                            return;
                        }
                        const hashOnlyMatch = textValue.match(/#([a-z]{2,3}[1-4][a-z0-9]*)(?![a-z0-9])(?:\?q=[1-4])?/i);
                        if (hashOnlyMatch) {
                            emitJoinedLink("canvas-stroke-text", `#${hashOnlyMatch[1]}`);
                            return;
                        }
                        sniffAndEmitJoinedLink("canvas-stroke-token", textValue);
                    },
                    measureText: text => ({
                        width: text.length
                    }),
                    clearRect: emptyFunc,
                    strokeRect: emptyFunc,
                    fillRect: emptyFunc,
                    save: emptyFunc,
                    translate: emptyFunc,
                    clip: emptyFunc,
                    restore: emptyFunc,
                    beginPath: emptyFunc,
                    moveTo: function() {
                        canvasRef = this.canvas;
                        if (st > 0) {
                            st--;
                            let val = arguments[0];
                            let diff = Math.abs(val - lx);
                            if (lx !== 0 && diff !== 0 && sr !== 0) {
                                const new_gd = sr / diff;
                                if (isFinite(new_gd) && new_gd > .1 && new_gd < 2.5) {
                                    gd = new_gd;
                                }
                            }
                            lx = val;
                        }
                    },
                    lineTo: emptyFunc,
                    rect: emptyFunc,
                    arc: emptyFunc,
                    ellipse: emptyFunc,
                    roundRect: emptyFunc,
                    closePath: emptyFunc,
                    fill: emptyFunc,
                    stroke: emptyFunc,
                    drawImage: emptyFunc
                };
                const simulatedContext2D = Object.assign({}, simulatedContext2DBase, {
                    lineWidth: 1,
                    globalAlpha: 1,
                    shadowBlur: 0,
                    shadowOffsetX: 0,
                    shadowOffsetY: 0
                });
                const createElement = function(tag, options) {
                    const attributes = {};
                    const element = {
                        tag: tag ? tag.toLowerCase() : "",
                        appended: false,
                        value: "",
                        style: emptyStyle,
                        addEventListener: (type, f) => handleListener(type, f, element),
                        setAttribute: (k, v) => {
                            attributes[String(k)] = String(v);
                        },
                        getAttribute: k => Object.prototype.hasOwnProperty.call(attributes, String(k)) ? attributes[String(k)] : null,
                        hasAttribute: k => Object.prototype.hasOwnProperty.call(attributes, String(k)),
                        removeAttribute: k => {
                            delete attributes[String(k)];
                        },
                        appendChild: e => {
                            e.appended = true;
                        },
                        focus: emptyFunc,
                        blur: emptyFunc,
                        remove: emptyFunc,
                        getBoundingClientRect: () => ({
                            width: innerWidth,
                            height: innerHeight,
                            top: 0,
                            left: 0,
                            bottom: innerHeight,
                            right: innerWidth
                        })
                    };
                    if (element.tag === "canvas") {
                        element.toDataURL = () => "data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAADElEQVQImWNgoBMAAABpAAFEI8ARAAAAAElFTkSuQmCC";
                        element.getContext = type => {
                            if (type === "2d") {
                                simulatedContext2DBase.canvas = element;
                                return simulatedContext2D;
                            }
                            return null;
                        };
                    }
                    if (element.tag === "input") {
                        inputs.push(element);
                    }
                    if (options) {
                        Object.assign(element, options);
                    }
                    element.length = 0;
                    element.clientWidth = innerWidth;
                    element.clientHeight = innerHeight;
                    element.offsetWidth = innerWidth;
                    element.offsetHeight = innerHeight;
                    return element;
                };
                const doc = createElement("document", {
                    createElement: createElement,
                    body: null,
                    fonts: {
                        load: () => true
                    },
                    referrer: "",
                    readyState: "complete",
                    documentElement: {
                        style: emptyStyle
                    },
                    activeElement: null,
                    hasFocus: () => true
                });
                doc.body = createElement("body");
                doc.activeElement = createElement("input");
                return doc;
            }();
            window.document = document;
            setGlobal("document", document);
            const locationState = {
                href: "https://arras.io/",
                origin: "https://arras.io",
                protocol: "https:",
                host: "arras.io",
                hostname: "arras.io",
                port: "",
                pathname: "/",
                search: "",
                hash: ""
            };
            const normalizeLocationInput = function(raw) {
                if (raw === undefined || raw === null) return null;
                let input = raw;
                if (typeof input === "object" && input && typeof input.href === "string") {
                    input = input.href;
                }
                input = String(input).trim();
                if (!input) return null;
                if (/^arras\.io\//i.test(input) || /^www\.arras\.io\//i.test(input)) {
                    input = `https://${input}`;
                }
                if (input.startsWith("#") || input.startsWith("?")) {
                    input = `https://arras.io/${input}`;
                }
                return input;
            };
            const updateLocationFromValue = function(raw) {
                const normalized = normalizeLocationInput(raw);
                if (!normalized) return false;
                try {
                    const parsed = new url.URL(normalized, locationState.href || "https://arras.io/");
                    locationState.href = parsed.href;
                    locationState.origin = parsed.origin || "https://arras.io";
                    locationState.protocol = parsed.protocol || "https:";
                    locationState.host = parsed.host || "arras.io";
                    locationState.hostname = parsed.hostname || "arras.io";
                    locationState.port = parsed.port || "";
                    locationState.pathname = parsed.pathname || "/";
                    locationState.search = parsed.search || "";
                    locationState.hash = parsed.hash || "";
                    return true;
                } catch (e) {
                    return false;
                }
            };
            updateLocationFromValue(`https://arras.io/${String(config.hash || "").replace(/^\//, "")}`);
            const locationApi = {
                get href() {
                    return locationState.href;
                },
                set href(v) {
                    updateLocationFromValue(v);
                },
                get origin() {
                    return locationState.origin;
                },
                get protocol() {
                    return locationState.protocol;
                },
                get host() {
                    return locationState.host;
                },
                get hostname() {
                    return locationState.hostname;
                },
                get port() {
                    return locationState.port;
                },
                get pathname() {
                    return locationState.pathname;
                },
                set pathname(v) {
                    const nextPath = String(v || "/");
                    updateLocationFromValue(`${locationState.origin}${nextPath.startsWith("/") ? nextPath : `/${nextPath}`}${locationState.search}${locationState.hash}`);
                },
                get search() {
                    return locationState.search;
                },
                set search(v) {
                    const nextSearch = String(v || "");
                    const s = nextSearch ? nextSearch.startsWith("?") ? nextSearch : `?${nextSearch}` : "";
                    updateLocationFromValue(`${locationState.origin}${locationState.pathname}${s}${locationState.hash}`);
                },
                get hash() {
                    return locationState.hash;
                },
                set hash(v) {
                    const nextHashRaw = String(v || "").trim();
                    const nextHash = nextHashRaw ? nextHashRaw.startsWith("#") ? nextHashRaw : `#${nextHashRaw}` : "";
                    updateLocationFromValue(`${locationState.origin}${locationState.pathname}${locationState.search}${nextHash}`);
                },
                get query() {
                    return locationState.search ? locationState.search.replace(/^\?/, "") : "";
                },
                set query(v) {
                    const next = String(v || "");
                    this.search = next ? next.startsWith("?") ? next : `?${next}` : "";
                },
                assign(v) {
                    updateLocationFromValue(v);
                },
                replace(v) {
                    updateLocationFromValue(v);
                },
                reload: () => {},
                toString() {
                    return locationState.href;
                }
            };
            try {
                Object.defineProperty(window, "location", {
                    configurable: true,
                    enumerable: true,
                    get: function() {
                        return locationApi;
                    },
                    set: function(v) {
                        updateLocationFromValue(v);
                    }
                });
            } catch (e) {
                window.location = locationApi;
            }
            try {
                Object.defineProperty(global, "location", {
                    configurable: true,
                    enumerable: true,
                    get: function() {
                        return locationApi;
                    },
                    set: function(v) {
                        updateLocationFromValue(v);
                    }
                });
            } catch (e) {
                setGlobal("location", locationApi);
            }
            window.history.pushState = function(state, title, nextUrl) {
                if (nextUrl !== undefined && nextUrl !== null) {
                    updateLocationFromValue(nextUrl);
                }
            };
            window.history.replaceState = function(state, title, nextUrl) {
                if (nextUrl !== undefined && nextUrl !== null) {
                    updateLocationFromValue(nextUrl);
                }
            };
            let lastHash = window.location.hash;
            let detectedTeamCode = "";
            let hasJoinedGame = false;
            let spawnConfirmed = false;
            let lastEmittedTeamCode = "";
            let lastJoinedLinkUrl = "";
            let loggedClientCountStub = false;
            let noTeamExitIssued = false;
            let leaderboardEmitted = false;
            let leaderboardHeaderSeen = false;
            let leaderboardHeaderAfterConnectSeen = false;
            let leaderboardHeaderX = NaN;
            let leaderboardHeaderY = NaN;
            let leaderboardFirstSeenAt = 0;
            let leaderboardLastSeenAt = 0;
            let leaderboardOrderCounter = 0;
            const leaderboardEntries = new Map;
            const leaderboardPendingNames = new Map;
            const leaderboardPendingScores = new Map;
            let leaderboardBestEntries = [];
            let leaderboardLastImproveAt = 0;
            let leaderboardLastProgressEmitAt = 0;
            let serverStatusArenaLine = "";
            let serverStatusArenaNote = "";
            let serverStatusMsptLine = "";
            let serverStatusMsptRatio = "";
            let serverStatusPlayersLine = "";
            let serverStatusLastChatAt = 0;
            let serverStatusChatAttempts = 0;
            let leaderboardFinalStatusDeadline = 0;
            const CANCELLED_FETCH_MESSAGE = "Cancelled fetch, unable to find all the available team codes.";
            const LEADERBOARD_SCORE_PATTERN = "[0-9][0-9,]*(?:\\.[0-9]+)?(?:[kmb])?";
            const LB_MIN_SCORE_VALUE = 1e3;
            const LB_DEBUG = String(process.env.LB_DEBUG || "").trim() === "1";
            const LB_SCORE_ONLY_RE = new RegExp(`^${LEADERBOARD_SCORE_PATTERN}$`, "i");
            const LB_SCORE_TRAILING_RE = new RegExp(`${LEADERBOARD_SCORE_PATTERN}$`, "i");
            let postSpawnNoDigitsTimer = null;
            const clearLeaderboardEmitTimer = function() {
                if (!leaderboardEmitTimer) return;
                clearTimeout(leaderboardEmitTimer);
                leaderboardEmitTimer = null;
            };
            const clearLeaderboardTimeoutTimer = function() {
                if (!leaderboardTimeoutTimer) return;
                clearTimeout(leaderboardTimeoutTimer);
                leaderboardTimeoutTimer = null;
            };
            const normalizeLeaderboardLine = function(value) {
                return String(value || "").replace(/\s+/g, " ").trim();
            };
            const stripLeaderboardRankPrefix = function(value) {
                return String(value || "").replace(/^\s*\d+\s*[.)-]?\s*/, "").trim();
            };
            const isBlockedLeaderboardName = function(value) {
                const name = normalizeLeaderboardLine(value);
                if (!name) return true;
                const lower = name.toLowerCase();
                if (name.length > 72) return true;
                if (lower === "score" || lower === "leaderboard") return true;
                if (lower === "lev" || lower === "leve" || lower === "level" || lower === "lvl") return true;
                if (lower.includes("want to connect with other members")) return true;
                if (lower.includes("join our public discord server")) return true;
                if (lower.includes("public discord server")) return true;
                if (lower.includes("discord.gg")) return true;
                if (lower.includes("announcement")) return true;
                if (lower.includes("community") && lower.includes("discord")) return true;
                if (lower.includes("join our") && lower.includes("discord")) return true;
                if (lower.includes("discord") && lower.includes("server") && lower.includes("join")) return true;
                if (lower.includes(" ms ") && (lower.includes("ovh") || lower.includes("am4"))) return true;
                if (/^(press|click|loading|connecting|reconnecting)\b/i.test(lower)) return true;
                if (lower.startsWith("coordinates:")) return true;
                if (lower.startsWith("you have ")) return true;
                if (lower.startsWith("the server was ")) return true;
                if (lower.startsWith("survived for ")) return true;
                if (/^(level|lvl)(?:\s|:|$)/i.test(lower)) return true;
                // Block obvious HUD/debug overlays without overblocking normal player names.
                if (/\b(memory|mib|fps|ping|latency|rendering|performance|graphics)\b/i.test(lower)) return true;
                if (/\bo=\S+\b/i.test(lower) || /\bc=\S+\b/i.test(lower) || /\bt=\S+\b/i.test(lower)) return true;
                return false;
            };
            const parseLeaderboardScoreValue = function(rawScore) {
                const text = String(rawScore || "").trim().toLowerCase().replace(/,/g, "");
                const match = text.match(/^([0-9]+(?:\.[0-9]+)?)([kmb])?$/i);
                if (!match) return Number.NEGATIVE_INFINITY;
                const base = parseFloat(match[1]);
                if (!Number.isFinite(base)) return Number.NEGATIVE_INFINITY;
                const suffix = String(match[2] || "").toLowerCase();
                const multiplier = suffix === "k" ? 1e3 : suffix === "m" ? 1e6 : suffix === "b" ? 1e9 : 1;
                return base * multiplier;
            };
            const parseLeaderboardEntryLine = function(value) {
                const text = normalizeLeaderboardLine(value);
                if (!text || text.length < 3) return null;
                const lower = text.toLowerCase();
                if (lower === "leaderboard") return null;
                if (lower === "score" || lower.startsWith("score:")) return null;
                if (lower.startsWith("coordinates:")) return null;
                if (lower.startsWith("you have ")) return null;
                if (lower.startsWith("the server was ")) return null;
                if (lower.startsWith("survived for ")) return null;
                const cleaned = stripLeaderboardRankPrefix(text);
                const entryMatch = cleaned.match(new RegExp(`^(.+?)(?:\\s*[:\\-\\u2013\\u2014]\\s*|\\s+)(${LEADERBOARD_SCORE_PATTERN})$`, "i"));
                if (!entryMatch) return null;
                let name = normalizeLeaderboardLine(entryMatch[1]).replace(/\s*[•·:\\-\u2013\u2014]\s*$/, "").trim();
                if (isBlockedLeaderboardName(name)) return null;
                const score = String(entryMatch[2] || "").trim();
                const scoreValue = parseLeaderboardScoreValue(score);
                const lowerName = name.toLowerCase();
                if (lowerName === "score" || lowerName === "leaderboard") return null;
                if (scoreValue < LB_MIN_SCORE_VALUE) return null;
                if (!Number.isFinite(scoreValue)) return null;
                if (!name || !score) return null;
                return {
                    name: name,
                    score: score,
                    scoreValue: scoreValue,
                    line: `${name}: ${score}`
                };
            };
            const parseLeaderboardNameOnlyLine = function(value) {
                let text = normalizeLeaderboardLine(value);
                if (!text) return null;
                text = stripLeaderboardRankPrefix(text);
                if (!text) return null;
                if (parseLeaderboardScoreOnlyLine(text)) return null;
                if (LB_SCORE_TRAILING_RE.test(text)) return null;
                const name = normalizeLeaderboardLine(text.replace(/\s*[•·:\\-\u2013\u2014]\s*$/, ""));
                if (!name) return null;
                if (isBlockedLeaderboardName(name)) return null;
                const lowerName = name.toLowerCase();
                if (lowerName === "score" || lowerName === "leaderboard") return null;
                if (lowerName.startsWith("coordinates:")) return null;
                if (lowerName.startsWith("you have ")) return null;
                if (lowerName.startsWith("the server was ")) return null;
                if (lowerName.startsWith("survived for ")) return null;
                if (!/[a-z]/i.test(name) && !/[^\x00-\x7F]/.test(name)) return null;
                if (name.length < 2) return null;
                return name;
            };
            const parseLeaderboardScoreOnlyLine = function(value) {
                const text = normalizeLeaderboardLine(value);
                if (!text) return null;
                if (!LB_SCORE_ONLY_RE.test(text)) return null;
                const scoreValue = parseLeaderboardScoreValue(text);
                if (scoreValue < LB_MIN_SCORE_VALUE) return null;
                if (!Number.isFinite(scoreValue)) return null;
                return {
                    score: text,
                    scoreValue: scoreValue
                };
            };
            const getCurrentServerPlayerCount = function() {
                const prefix = String(config && config.squadId ? config.squadId : "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 3);
                if (!prefix || !Array.isArray(status) || !status.length) return null;
                const exact = status.find(item => item && typeof item === "object" && String(item.name || "").toLowerCase() === prefix);
                const entry = exact || status.find(item => item && typeof item === "object" && String(item.name || "").toLowerCase().startsWith(prefix)) || null;
                if (!entry || typeof entry !== "object") return null;
                if (entry.online === false) return 0;
                const clients = Number(entry.clients);
                if (!Number.isFinite(clients) || clients < 0) return 0;
                return Math.floor(clients);
            };
            const getServerStatusSnapshot = function() {
                let arenaStatus = serverStatusArenaLine;
                if (serverStatusArenaNote) {
                    arenaStatus = arenaStatus ? `${arenaStatus} ${serverStatusArenaNote}` : serverStatusArenaNote;
                }
                return {
                    arenaStatus: arenaStatus || "",
                    mspt: serverStatusMsptLine || "",
                    playersHud: serverStatusPlayersLine || ""
                };
            };
            const captureServerStatusText = function(source, text, x, y) {
                if (!isLeaderboardMode || destroyed) return;
                const normalized = normalizeLeaderboardLine(text);
                if (!normalized) return;
                const lower = normalized.toLowerCase();
                let changed = false;
                if (lower.includes("arena has been open for") && lower.includes("can remain open for")) {
                    if (serverStatusArenaLine !== normalized) {
                        serverStatusArenaLine = normalized;
                        changed = true;
                    }
                } else if (lower.includes("arena may close sooner")) {
                    if (serverStatusArenaNote !== normalized) {
                        serverStatusArenaNote = normalized;
                        changed = true;
                    }
                }
                const numericMsptMatch = normalized.match(/\b(\d+(?:\.\d+)?)\s*mspt\b/i);
                if (numericMsptMatch) {
                    const msptValue = String(numericMsptMatch[1] || "").replace(/\s+/g, " ").trim();
                    const msptText = `${msptValue} mspt`;
                    if (msptText && serverStatusMsptLine !== msptText) {
                        serverStatusMsptLine = msptText;
                        changed = true;
                    }
                } else {
                    const msptMatch = normalized.match(/\b(\d+\s*\/\s*\d+)(?:\s*(mspt))?\b/i);
                    if (msptMatch) {
                        const ratioText = String(msptMatch[1] || "").replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").trim();
                        const msptText = `${ratioText} mspt`.trim();
                        if (msptText && serverStatusMsptLine !== msptText) {
                            serverStatusMsptLine = msptText;
                            serverStatusMsptRatio = ratioText;
                            changed = true;
                        }
                    } else if (/^mspt$/i.test(normalized) && serverStatusMsptRatio) {
                        const msptText = `${serverStatusMsptRatio} mspt`;
                        if (serverStatusMsptLine !== msptText) {
                            serverStatusMsptLine = msptText;
                            changed = true;
                        }
                    } else {
                        const ratioOnlyMatch = normalized.match(/\b(\d+\s*\/\s*\d+)\b/);
                        if (ratioOnlyMatch) {
                            const ratioText = String(ratioOnlyMatch[1] || "").replace(/\s+/g, " ").replace(/\s*\/\s*/g, "/").trim();
                            if (ratioText && serverStatusMsptRatio !== ratioText) {
                                serverStatusMsptRatio = ratioText;
                            }
                        }
                    }
                }
                const playersMatch = normalized.match(/\b(\d+\s+players)\b/i);
                if (playersMatch) {
                    const playersText = String(playersMatch[1] || "").toLowerCase().replace(/\s+/g, " ").trim();
                    if (playersText && serverStatusPlayersLine !== playersText) {
                        serverStatusPlayersLine = playersText;
                        changed = true;
                    }
                }
                if (!changed) return;
                if (serverStatusArenaLine && leaderboardFinalStatusDeadline > 0) {
                    leaderboardFinalStatusDeadline = 0;
                    scheduleLeaderboardEmit("server-status-ready", 120);
                }
                lbDebugLog(`status source=${source} x=${x} y=${y} text="${normalized}"`);
                if (!process.send) return;
                try {
                    process.send({
                        type: "leaderboard_progress",
                        source: "server-status",
                        entries: leaderboardBestEntries.slice(0, 10),
                        count: leaderboardBestEntries.length,
                        ageMs: leaderboardFirstSeenAt ? Date.now() - leaderboardFirstSeenAt : 0,
                        playersOnline: getCurrentServerPlayerCount(),
                        serverStats: getServerStatusSnapshot()
                    });
                } catch (e) {}
            };
            const takePendingNameFromBucket = function(bucket) {
                const q = leaderboardPendingNames.get(bucket);
                if (!q || !q.length) return null;
                const name = q.shift();
                if (!q.length) leaderboardPendingNames.delete(bucket);
                return name || null;
            };
            const pushPendingScoreToBucket = function(bucket, scoreOnly) {
                if (!Number.isFinite(bucket) || !scoreOnly) return;
                const q = leaderboardPendingScores.get(bucket) || [];
                q.push(scoreOnly);
                if (q.length > 20) q.shift();
                leaderboardPendingScores.set(bucket, q);
            };
            const lbDebugLog = function() {
                if (!LB_DEBUG) return;
                try {
                    log("[lb-debug]", ...arguments);
                } catch (e) {}
            };
            const takePendingScoreFromBucket = function(bucket) {
                const q = leaderboardPendingScores.get(bucket);
                if (!q || !q.length) return null;
                const scoreOnly = q.shift();
                if (!q.length) leaderboardPendingScores.delete(bucket);
                return scoreOnly || null;
            };
            const getSortedLeaderboardEntries = function() {
                const now = Date.now();
                const freshWindowMs = 12e3;
                const recentEntries = Array.from(leaderboardEntries.values()).filter(entry => !entry || !Number.isFinite(entry.seenAt) || now - entry.seenAt <= freshWindowMs);
                const byName = new Map;
                for (const entry of recentEntries) {
                    const key = String(entry.name || "").toLowerCase();
                    const existing = byName.get(key);
                    if (!existing || entry.scoreValue > existing.scoreValue || entry.scoreValue === existing.scoreValue && Number(entry.seenAt || 0) > Number(existing.seenAt || 0)) {
                        byName.set(key, entry);
                    }
                }
                const deduped = Array.from(byName.values()).sort((a, b) => {
                    const as = Number.isFinite(a.scoreValue) ? a.scoreValue : Number.NEGATIVE_INFINITY;
                    const bs = Number.isFinite(b.scoreValue) ? b.scoreValue : Number.NEGATIVE_INFINITY;
                    if (as !== bs) return bs - as;
                    const ay = Number.isFinite(a.y) ? a.y : Number.POSITIVE_INFINITY;
                    const by = Number.isFinite(b.y) ? b.y : Number.POSITIVE_INFINITY;
                    const ax = Number.isFinite(a.x) ? a.x : Number.POSITIVE_INFINITY;
                    const bx = Number.isFinite(b.x) ? b.x : Number.POSITIVE_INFINITY;
                    if (ay !== by) return ay - by;
                    if (ax !== bx) return ax - bx;
                    return Number(b.seenAt || 0) - Number(a.seenAt || 0);
                }).slice(0, 10);
                return deduped.map((entry, index) => ({
                    rank: index + 1,
                    name: entry.name,
                    score: entry.score,
                    line: `${index + 1}. ${entry.name}: ${entry.score}`
                }));
            };
            const getLeaderboardSnapshotQuality = function(entries) {
                const rows = Array.isArray(entries) ? entries : [];
                let totalScore = 0;
                for (const row of rows) {
                    const value = parseLeaderboardScoreValue(row && row.score);
                    if (Number.isFinite(value) && value > 0) totalScore += value;
                }
                return {
                    count: rows.length,
                    totalScore: totalScore
                };
            };
            const isBetterLeaderboardSnapshot = function(nextEntries, currentEntries) {
                const next = getLeaderboardSnapshotQuality(nextEntries);
                const current = getLeaderboardSnapshotQuality(currentEntries);
                if (next.count !== current.count) return next.count > current.count;
                if (next.totalScore !== current.totalScore) return next.totalScore > current.totalScore;
                const nextKey = (Array.isArray(nextEntries) ? nextEntries : []).map(entry => `${entry && entry.name || ""}:${entry && entry.score || ""}`).join("|");
                const currentKey = (Array.isArray(currentEntries) ? currentEntries : []).map(entry => `${entry && entry.name || ""}:${entry && entry.score || ""}`).join("|");
                return nextKey !== currentKey;
            };
            const emitLeaderboardProgress = function(source, entries) {
                if (!isLeaderboardMode || destroyed || leaderboardEmitted) return;
                if (!process.send) return;
                const now = Date.now();
                const age = leaderboardFirstSeenAt ? now - leaderboardFirstSeenAt : 0;
                const throttle = entries.length >= 8 ? 180 : 320;
                if (now - leaderboardLastProgressEmitAt < throttle) return;
                leaderboardLastProgressEmitAt = now;
                try {
                    process.send({
                        type: "leaderboard_progress",
                        source: source,
                        entries: entries.slice(0, 10),
                        count: entries.length,
                        ageMs: age,
                        playersOnline: getCurrentServerPlayerCount(),
                        serverStats: getServerStatusSnapshot()
                    });
                } catch (e) {}
            };
            const maybeUpdateBestLeaderboard = function() {
                const current = getSortedLeaderboardEntries();
                if (isBetterLeaderboardSnapshot(current, leaderboardBestEntries)) {
                    leaderboardBestEntries = current.slice(0, 10);
                    leaderboardLastImproveAt = Date.now();
                    emitLeaderboardProgress("leaderboard-best-improved", leaderboardBestEntries);
                    return leaderboardBestEntries.slice(0, 10);
                }
                if (current.length > 0) {
                    emitLeaderboardProgress("leaderboard-current", current);
                }
                return current;
            };
            const getBestLeaderboardCandidate = function() {
                const current = maybeUpdateBestLeaderboard();
                if (isBetterLeaderboardSnapshot(leaderboardBestEntries, current)) return leaderboardBestEntries.slice(0, 10);
                return current;
            };
            const emitLeaderboardSnapshot = function(source, force = false) {
                if (!isLeaderboardMode || destroyed || leaderboardEmitted) return false;
                const entries = getBestLeaderboardCandidate();
                if (entries.length < 10) return false;
                const hasStatusText = Boolean(serverStatusArenaLine);
                if (!hasStatusText) {
                    const now = Date.now();
                    if (!leaderboardFinalStatusDeadline) {
                        leaderboardFinalStatusDeadline = now + 2800;
                        requestServerStatusChat("finalize-missing-status", true);
                        scheduleLeaderboardEmit(`${source}-await-status`, 650);
                        return false;
                    }
                    if (now < leaderboardFinalStatusDeadline) {
                        requestServerStatusChat("finalize-await-status");
                        scheduleLeaderboardEmit(`${source}-await-status`, Math.max(180, Math.min(650, leaderboardFinalStatusDeadline - now)));
                        return false;
                    }
                }
                leaderboardEmitted = true;
                leaderboardFinalStatusDeadline = 0;
                clearLeaderboardEmitTimer();
                clearLeaderboardTimeoutTimer();
                if (process.send) {
                    process.send({
                        type: "leaderboard_detected",
                        source: source,
                        entries: entries,
                        count: entries.length,
                        playersOnline: getCurrentServerPlayerCount(),
                        serverStats: getServerStatusSnapshot()
                    });
                }
                log(`[leaderboard] Captured ${entries.length} entries (${source}).`);
                try {
                    destroy();
                } catch (e) {}
                global.setTimeout(() => process.exit(0), 25);
                return true;
            };
            const scheduleLeaderboardEmit = function(source, delayMs = 450) {
                if (!isLeaderboardMode || destroyed || leaderboardEmitted) return;
                clearLeaderboardEmitTimer();
                leaderboardEmitTimer = setTimeout(() => {
                    leaderboardEmitTimer = null;
                    const quietForMs = Date.now() - leaderboardLastSeenAt;
                    const force = quietForMs >= 1700;
                    emitLeaderboardSnapshot(source, force);
                }, Math.max(200, delayMs));
            };
            const armLeaderboardTimeout = function(source) {
                if (!isLeaderboardMode || destroyed || leaderboardEmitted) return;
                clearLeaderboardTimeoutTimer();
                const timeoutMs = Number.isFinite(config && config.leaderboardTimeoutMs) ? Math.max(2500, Math.min(25e3, config.leaderboardTimeoutMs)) : 8e3;
                leaderboardTimeoutTimer = setTimeout(() => {
                    leaderboardTimeoutTimer = null;
                    const emitted = emitLeaderboardSnapshot(`${source}-timeout`, true);
                    if (emitted) return;
                    const partialCount = getBestLeaderboardCandidate().length;
                    if (process.send) {
                        process.send({
                            type: "bot_error",
                            error: partialCount > 0 ? `Incomplete leaderboard capture (${partialCount}/10).` : "Leaderboard not detected after join.",
                            playersOnline: getCurrentServerPlayerCount(),
                            serverStats: getServerStatusSnapshot()
                        });
                    }
                    try {
                        destroy();
                    } catch (e) {}
                    global.setTimeout(() => process.exit(0), 25);
                }, timeoutMs);
            };
            const captureLeaderboardText = function(source, text, x, y) {
                if (!isLeaderboardMode || destroyed || leaderboardEmitted) return;
                const normalized = normalizeLeaderboardLine(text);
                if (!normalized) return;
                if (/^leaderboard\b/i.test(normalized)) {
                    const hadRowsBeforeClear = leaderboardEntries.size > 0;
                    maybeUpdateBestLeaderboard();
                    leaderboardHeaderSeen = true;
                    if (connected) leaderboardHeaderAfterConnectSeen = true;
                    leaderboardHeaderX = Number.isFinite(x) ? x : leaderboardHeaderX;
                    leaderboardHeaderY = Number.isFinite(y) ? y : leaderboardHeaderY;
                    lbDebugLog(`header seen connected=${connected} x=${x} y=${y}`);
                    if (!leaderboardFirstSeenAt) leaderboardFirstSeenAt = Date.now();
                    leaderboardLastSeenAt = Date.now();
                    if (!hadRowsBeforeClear) {
                        scheduleLeaderboardEmit(`${source}-header`, 320);
                    }
                    return;
                }
                if (!connected) return;
                if (!leaderboardHeaderSeen) return;
                if (Number.isFinite(y)) {
                    const minY = leaderboardHeaderAfterConnectSeen && Number.isFinite(leaderboardHeaderY) ? leaderboardHeaderY + 8 : 8;
                    const maxY = leaderboardHeaderAfterConnectSeen && Number.isFinite(leaderboardHeaderY) ? leaderboardHeaderY + 560 : 700;
                    if (y < minY || y > maxY) return;
                }
                if (leaderboardHeaderAfterConnectSeen && Number.isFinite(x) && Number.isFinite(leaderboardHeaderX)) {
                    const minX = leaderboardHeaderX - 320;
                    const maxX = leaderboardHeaderX + 900;
                    if (x < minX || x > maxX) return;
                }
                const hasY = Number.isFinite(y);
                const yBucket = hasY ? Math.round(y / 2) : null;
                let parsed = parseLeaderboardEntryLine(normalized);
                if (!parsed) return;
                leaderboardHeaderSeen = true;
                if (!leaderboardFirstSeenAt) leaderboardFirstSeenAt = Date.now();
                leaderboardLastSeenAt = Date.now();
                lbDebugLog(`accept source=${source} x=${x} y=${y} text="${normalized}" parsed="${parsed.name}: ${parsed.score}"`);
                const signatureKey = `${String(parsed.name || "").toLowerCase()}|${String(parsed.score || "").toLowerCase()}`;
                const key = `sig:${signatureKey}`;
                const numericY = hasY ? y : 9999;
                const numericX = Number.isFinite(x) ? x : 9999;
                const existing = leaderboardEntries.get(key);
                if (!existing || parsed.scoreValue > existing.scoreValue) {
                    leaderboardEntries.set(key, {
                        name: parsed.name,
                        score: parsed.score,
                        scoreValue: parsed.scoreValue,
                        x: numericX,
                        y: numericY,
                        seenAt: Date.now(),
                        order: leaderboardOrderCounter++
                    });
                } else {
                    existing.seenAt = Date.now();
                    if (Number.isFinite(numericX)) existing.x = numericX;
                    if (Number.isFinite(numericY)) existing.y = numericY;
                }
                const entriesNow = maybeUpdateBestLeaderboard();
                const enoughEntries = entriesNow.length >= 10;
                if (enoughEntries) {
                    emitLeaderboardSnapshot(`${source}-line-full`, false);
                    return;
                }
                scheduleLeaderboardEmit(`${source}-line`, 260);
            };
            const failNoValidTeamUrl = function(reason) {
                if (isLeaderboardMode) return;
                if (noTeamExitIssued || destroyed) return;
                noTeamExitIssued = true;
                clearNoUrlAfterJoinTimer();
                if (postSpawnNoDigitsTimer) {
                    clearTimeout(postSpawnNoDigitsTimer);
                    postSpawnNoDigitsTimer = null;
                }
                if (wsPostOpenNoDigitsTimer) {
                    clearTimeout(wsPostOpenNoDigitsTimer);
                    wsPostOpenNoDigitsTimer = null;
                }
                const detail = String(reason || "No valid team URL after join");
                log(`[team-scraper] ${detail}. ${CANCELLED_FETCH_MESSAGE}`);
                if (process.send) {
                    process.send({
                        type: "bot_error",
                        error: CANCELLED_FETCH_MESSAGE,
                        code: "NO_VALID_TEAM_URL_AFTER_JOIN"
                    });
                }
                try {
                    destroy();
                } catch (e) {}
                global.setTimeout(() => process.exit(0), 25);
            };
            const clearNoUrlAfterJoinTimer = function() {
                if (!noUrlAfterJoinTimer) return;
                clearTimeout(noUrlAfterJoinTimer);
                noUrlAfterJoinTimer = null;
            };
            const armNoUrlAfterJoinTimer = function(source) {
                if (isLeaderboardMode) return;
                if (destroyed || lastJoinedLinkUrl) return;
                clearNoUrlAfterJoinTimer();
                noUrlAfterJoinTimer = setTimeout(() => {
                    noUrlAfterJoinTimer = null;
                    if (destroyed || lastJoinedLinkUrl) return;
                    if (!hasJoinedGame && !inGame) return;
                    const reason = `No valid team URL after join (${source})`;
                    failNoValidTeamUrl(reason);
                }, 4200);
            };
            const clearPostSpawnNoDigitsTimer = function() {
                if (!postSpawnNoDigitsTimer) return;
                clearTimeout(postSpawnNoDigitsTimer);
                postSpawnNoDigitsTimer = null;
            };
            const clearWsPostOpenNoDigitsTimer = function() {
                if (!wsPostOpenNoDigitsTimer) return;
                clearTimeout(wsPostOpenNoDigitsTimer);
                wsPostOpenNoDigitsTimer = null;
            };
            const armPostSpawnNoDigitsTimer = function(source) {
                if (isLeaderboardMode) return;
                if (destroyed || lastJoinedLinkUrl) return;
                clearPostSpawnNoDigitsTimer();
                postSpawnNoDigitsTimer = setTimeout(() => {
                    postSpawnNoDigitsTimer = null;
                    if (destroyed || lastJoinedLinkUrl) return;
                    checkSpawnedHashOrCancel(source);
                }, 900);
            };
            const armWsPostOpenNoDigitsTimer = function(source) {
                if (isLeaderboardMode) return;
                if (destroyed || lastJoinedLinkUrl) return;
                clearWsPostOpenNoDigitsTimer();
                wsPostOpenNoDigitsTimer = setTimeout(() => {
                    wsPostOpenNoDigitsTimer = null;
                    if (destroyed || lastJoinedLinkUrl) return;
                    checkSpawnedHashOrCancel(source);
                }, 5e3);
            };
            const squadPrefix = String(config.squadId || "").toLowerCase().replace(/[^a-z]/g, "").slice(0, 3);
            const getCurrentHashToken = function() {
                const rawHash = location && typeof location.hash === "string" && location.hash ? String(location.hash) : lastHash || String(config.hash || "");
                const hashToken = String(rawHash || "").trim().replace(/^#/, "").split("?")[0].toLowerCase().replace(/[^a-z0-9]/g, "");
                return {
                    rawHash: rawHash,
                    hashToken: hashToken
                };
            };
            const isStrictTeamHashToken = function(value) {
                const token = String(value || "").toLowerCase();
                if (!/^[a-z]{2,3}[1-4][a-z0-9]*$/.test(token)) return false;
                if (squadPrefix && !token.startsWith(squadPrefix)) return false;
                return true;
            };
            const checkSpawnedHashOrCancel = function(source) {
                if (isLeaderboardMode) return false;
                if (destroyed || noTeamExitIssued || lastJoinedLinkUrl) return false;
                if (!spawnConfirmed) return false;
                const {rawHash: rawHash, hashToken: hashToken} = getCurrentHashToken();
                if (!isStrictTeamHashToken(hashToken)) {
                    failNoValidTeamUrl(`Spawned in-game hash is not a valid team code (${rawHash || "empty-hash"}) [${source}]`);
                    return true;
                }
                return false;
            };
            const enforceJoinPrefixHash = function(source) {
                if (!squadPrefix || destroyed || hasJoinedGame || inGame || connected) return;
                const desiredHash = `#${squadPrefix}`;
                const currentHash = String(location && location.hash || "").toLowerCase();
                if (currentHash === desiredHash) return;
                try {
                    if (location && typeof location.hash !== "undefined") {
                        location.hash = desiredHash;
                        lastHash = desiredHash;
                        log(`[join] enforcing hash ${desiredHash} (${source})`);
                    }
                } catch (e) {}
            };
            const parseTeamCodeFromText = function(value) {
                let input = String(value || "").trim();
                if (!input) return null;
                if (/^arras\.io\//i.test(input) || /^www\.arras\.io\//i.test(input)) {
                    input = `https://${input}`;
                }
                let haystack = input;
                if (input.startsWith("http://") || input.startsWith("https://")) {
                    try {
                        const parsed = new url.URL(input);
                        haystack = `${parsed.hash || ""} ${parsed.search || ""} ${parsed.pathname || ""} ${input}`;
                    } catch (e) {
                        haystack = input;
                    }
                }
                const hashMatch = haystack.match(/#([a-z]{2,3}[1-4][a-z0-9]*)(?![a-z0-9])(?:\?q=[1-4])?/i);
                let token = hashMatch ? hashMatch[1].toLowerCase() : null;
                if (!token && squadPrefix.length >= 2) {
                    const byPrefix = haystack.match(new RegExp(`(?:^|[^a-z0-9])(${squadPrefix}[1-4][a-z0-9]*)(?![a-z0-9])`, "i"));
                    if (byPrefix) token = byPrefix[1].toLowerCase();
                }
                if (!token) {
                    const generic = haystack.match(/(?:^|[^a-z0-9])([a-z]{2,3}[1-4][a-z0-9]*)(?![a-z0-9])/i);
                    if (generic) token = generic[1].toLowerCase();
                }
                if (!token) return null;
                const match = token.match(/^([a-z]{2,3})([1-4])([a-z0-9]*)$/i);
                if (!match) return null;
                const hash = `${match[1].toLowerCase()}${match[2]}${match[3] || ""}`;
                if (!isStrictTeamHashToken(hash)) return null;
                const digit = parseInt(match[2], 10);
                if (!(digit >= 1 && digit <= 4)) return null;
                return {
                    hash: hash,
                    digit: digit,
                    url: `https://arras.io/#${hash}`
                };
            };
            const normalizeJoinedLink = function(value) {
                return parseTeamCodeFromText(value);
            };
            const parsePrefixOnlyHashFromText = function(value) {
                let input = String(value || "").trim();
                if (!input) return null;
                if (/^arras\.io\//i.test(input) || /^www\.arras\.io\//i.test(input)) {
                    input = `https://${input}`;
                }
                let haystack = input;
                if (input.startsWith("http://") || input.startsWith("https://")) {
                    try {
                        const parsed = new url.URL(input);
                        haystack = `${parsed.hash || ""} ${parsed.search || ""} ${parsed.pathname || ""} ${input}`;
                    } catch (e) {
                        haystack = input;
                    }
                }
                const match = haystack.match(/#([a-z]{2,3})(?!\d)(?:\b|[/?& ])/i);
                if (!match) return null;
                return String(match[1] || "").toLowerCase();
            };
            const emitDetectedTeam = function(parsed, source) {
                if (isLeaderboardMode) return false;
                if (!process.send || !parsed) return false;
                if (!isStrictTeamHashToken(parsed.hash)) return false;
                if (lastEmittedTeamCode === parsed.hash) return false;
                process.send({
                    type: "team_detected",
                    hash: parsed.hash,
                    digit: parsed.digit,
                    url: parsed.url,
                    source: source
                });
                lastEmittedTeamCode = parsed.hash;
                return true;
            };
            const emitJoinedLink = function(source, value) {
                if (isLeaderboardMode) return;
                if (!process.send) return;
                const parsed = normalizeJoinedLink(value);
                if (!parsed) return;
                if (!isStrictTeamHashToken(parsed.hash)) return;
                if (lastJoinedLinkUrl === parsed.url) return;
                lastJoinedLinkUrl = parsed.url;
                clearNoUrlAfterJoinTimer();
                clearPostSpawnNoDigitsTimer();
                clearWsPostOpenNoDigitsTimer();
                detectedTeamCode = parsed.hash;
                hasJoinedGame = true;
                process.send({
                    type: "joined_link",
                    hash: parsed.hash,
                    digit: parsed.digit,
                    url: parsed.url,
                    source: source
                });
                emitDetectedTeam(parsed, `${source}-joined-link`);
                log(`[team-scraper] Joined link detected (${source}): ${parsed.url}`);
            };
            const sniffAndEmitJoinedLink = function(source, value) {
                const parsed = parseTeamCodeFromText(value);
                if (!parsed) return false;
                emitJoinedLink(source, `#${parsed.hash}`);
                return true;
            };
            const scheduleDelayedSpawnFetch = function(source) {
                if (isLeaderboardMode) return;
                if (destroyed) return;
                if (delayedSpawnFetchTimer) return;
                delayedSpawnFetchTimer = setTimeout(() => {
                    delayedSpawnFetchTimer = null;
                    if (destroyed) return;
                    const candidateUrl = location.href || location.hash || lastHash || String(config.hash || "");
                    emitJoinedLink(`${source}-after-2s`, candidateUrl);
                    sniffAndEmitJoinedLink(`${source}-after-2s-token`, candidateUrl);
                    if (!lastJoinedLinkUrl) {
                        const prefixOnly = parsePrefixOnlyHashFromText(candidateUrl);
                        if (prefixOnly && (!squadPrefix || prefixOnly === squadPrefix)) {
                            failNoValidTeamUrl(`Joined URL has no team digits (#${prefixOnly})`);
                        }
                    }
                }, 2e3);
            };
            window.prompt = function() {
                console.log("prompt", ...arguments);
            };
            setGlobal("prompt", window.prompt);
            window.alert = function() {
                log("[alert]", ...arguments);
            };
            setGlobal("alert", window.alert);
            window.confirm = function() {
                return true;
            };
            setGlobal("confirm", window.confirm);
            let devicePixelRatio = window.devicePixelRatio = 1;
            setGlobal("devicePixelRatio", 1);
            window.requestAnimationFrame = function(f) {
                st = 2;
                g();
                a = f;
            };
            setGlobal("requestAnimationFrame", window.requestAnimationFrame);
            const fetch = function(url) {
                if (typeof url !== "string") return realFetch(url);
                let f = url;
                if (f.startsWith("./")) {
                    f = "https://arras.io" + f.slice(1);
                } else if (f.startsWith("/")) {
                    f = "https://arras.io" + f;
                }
                sniffAndEmitJoinedLink("fetch-url-token", f);
                if (f === "https://arras.io/app.wasm" || f === "app.wasm" || f.endsWith("app.wasm")) {
                    return Promise.resolve(wasm());
                }
                let options = {
                    followRedirects: true
                };
                if (proxyAgent) {
                    options.agent = proxyAgent;
                }
                if (f.includes("status")) {
                    const statusPromise = realFetch(f, options);
                    statusPromise.then(response => response.clone().text()).then(bodyText => {
                        let parsed = null;
                        try {
                            parsed = JSON.parse(bodyText);
                        } catch (e) {
                            parsed = null;
                        }
                        if (parsed && parsed.ok && parsed.status) {
                            statusRecieved = true;
                            status = Object.values(parsed.status);
                            log("Status received and processed.");
                        } else if (parsed) {
                            statusRecieved = true;
                            if (parsed.status && typeof parsed.status === "object") {
                                status = Object.values(parsed.status);
                            }
                            const preview = String(bodyText || "").slice(0, 160).replace(/\s+/g, " ");
                            logThrottled("status_unavailable", `Status unavailable from ${f}. Preview: ${preview || "[empty]"}`, 2e4);
                        }
                    }).catch(err => {
                        const msg = err && err.message ? err.message : String(err);
                        logThrottled("status_fetch_failed", `[status] Fetch failed: ${msg}`, 2e4);
                    });
                    return statusPromise;
                }
                if (/\/clientCount\b/i.test(f)) {
                    return realFetch(f, options).catch(proxyErr => {
                        const directOptions = {
                            ...options
                        };
                        delete directOptions.agent;
                        return realFetch(f, directOptions).then(res => {
                            logThrottled("clientcount_proxy_fallback", "[FETCH] clientCount proxy failed; direct fallback succeeded.", 15e3);
                            return res;
                        }).catch(directErr => {
                            if (!loggedClientCountStub) {
                                loggedClientCountStub = true;
                                const pMsg = proxyErr && proxyErr.message ? proxyErr.message : String(proxyErr);
                                const dMsg = directErr && directErr.message ? directErr.message : String(directErr);
                                log(`[FETCH] clientCount failed via proxy and direct; using stub response. proxy=${pMsg} direct=${dMsg}`);
                            }
                            return makeStubResponse("0");
                        });
                    });
                }
                if (f.includes(".uvwx.xyz:8443/")) {
                    return realFetch(f, options).catch(err => {
                        const msg = err && err.message ? err.message : String(err);
                        logThrottled("uvwx_proxy_fail", `[FETCH] uvwx fetch via proxy failed: ${msg}`, 15e3);
                        return makeStubResponse("");
                    });
                }
                return realFetch(f, options);
            };
            window.fetch = fetch;
            setGlobal("fetch", fetch);
            window.performance = {
                time: 0,
                now: function() {
                    return this.time;
                }
            };
            setGlobal("performance", window.performance);
            Object.assign(window, {
                setInterval: global.setInterval.bind(global),
                setTimeout: global.setTimeout.bind(global),
                clearInterval: global.clearInterval.bind(global),
                clearTimeout: global.clearTimeout.bind(global),
                eval: global.eval.bind(global)
            });
            setGlobal("console", customConsole);
            let proxyAgent = createProxyAgent(config.proxy);
            if (config.proxy && proxyAgent) {
                const displayUrl = config.proxy.url.includes("@") ? config.proxy.url.split("@")[1] : config.proxy.url;
                const label = config.proxy.type === "socks" ? "SOCKS5" : "HTTP";
                log(`Using ${label} proxy: ${displayUrl} (credentials hidden)`);
            } else if (config.proxy && !proxyAgent) {
                log(`Proxy configured but agent creation failed.`);
            }
            wsJoinWatchdogTimer = global.setTimeout(() => {
                if (destroyed || wsOpened) return;
                const state = wsConstructed ? "constructed-but-not-opened" : "not-constructed";
                log(`[WS] Join watchdog timeout: ${state} after 15s.`);
                if (process.send) {
                    process.send({
                        type: "bot_error",
                        error: `WebSocket not opened (${state})`
                    });
                }
            }, 15e3);
            let i = 0, controller = {
                x: 250,
                y: 250,
                mouseDown: function() {
                    trigger.mousedown(controller.x, controller.y);
                },
                mouseUp: function() {
                    trigger.mouseup(controller.x, controller.y);
                },
                click: function(x, y) {
                    trigger.mousedown(x, y, 0);
                    trigger.mouseup(x, y, 0);
                },
                press: function(code) {
                    trigger.keydown(code);
                    trigger.keyup(code);
                },
                chat: function(str) {
                    log("Sent chat:", str);
                    controller.press("Enter");
                    performance.time += 90;
                    if (typeof a === "function") a();
                    setValue(str);
                    performance.time += 90;
                    if (typeof a === "function") a();
                    controller.press("Enter");
                },
                moveDirection: function(x, y) {
                    trigger[x < 0 ? "keydown" : "keyup"]("KeyA");
                    trigger[y < 0 ? "keydown" : "keyup"]("KeyW");
                    trigger[x > 0 ? "keydown" : "keyup"]("KeyD");
                    trigger[y > 0 ? "keydown" : "keyup"]("KeyS");
                },
                iv: 4 / Math.PI,
                dv: Math.PI / 4,
                ix: [ 1, 1, 0, -1, -1, -1, 0, 1 ],
                iy: [ 0, 1, 1, 1, 0, -1, -1, -1 ],
                moveVector: function(x, y, i) {
                    let d = Math.atan2(y, x);
                    let h = (Math.round(d * controller.iv) % 8 + 8) % 8;
                    let x2 = controller.ix[h];
                    let y2 = controller.iy[h];
                    controller.moveDirection(x2, y2);
                    return h * controller.dv;
                },
                stats: function(arr) {
                    for (let i = 0; i < 10; i++) {
                        let code = `Digit${(i + 1) % 10}`;
                        for (let u = 0; u < arr[i]; u++) {
                            controller.press(code);
                        }
                    }
                }
            }, timeout = function(f, t) {
                if (!(t >= 1)) {
                    t = 1;
                }
                let n = i + t;
                let a = timeouts[n];
                if (!a) {
                    a = timeouts[n] = [];
                }
                a.push(f);
            }, block = false, idleKeys = false, idleIndex = -1;
            let idleAngle = 0, cIdleAngle = 0;
            let lastJoinAttemptAt = 0;
            let joinAttemptCount = 0;
            let spawnAssistCount = 0;
            const tryEnterGame = function(reason = "loop", options = {}) {
                if (destroyed || hasJoined || hasJoinedGame || inGame || disconnected || typeof a !== "function") return;
                enforceJoinPrefixHash(`try-enter:${reason}`);
                const now = Date.now();
                const minDelay = options.postOpen ? 180 : 260;
                if (now - lastJoinAttemptAt < minDelay) return;
                lastJoinAttemptAt = now;
                const postOpen = options.postOpen === true;
                if (postOpen) {
                    spawnAssistCount++;
                } else {
                    joinAttemptCount++;
                }
                const shouldRefreshName = !postOpen || spawnAssistCount <= 2 || spawnAssistCount % 4 === 0;
                const shouldClickPlay = !postOpen || options.forceClick === true || spawnAssistCount <= 2 || spawnAssistCount % 5 === 0;
                if (shouldRefreshName) {
                    setValue(config.name || "tf");
                }
                if (shouldClickPlay) {
                    trigger.mousemove(250, 190);
                    controller.click(250, 190);
                }
                controller.press("Enter");
                controller.press("NumpadEnter");
                const currentAttempt = postOpen ? spawnAssistCount : joinAttemptCount;
                if (currentAttempt <= 8 || currentAttempt % 10 === 0) {
                    log(postOpen ? `[join] Spawn assist ${currentAttempt} (${reason}) - Enter` : `[join] Attempt ${currentAttempt} (${reason}) - click(250,190)+Enter`);
                }
            };
            const normalizeKeyCode = function(rawKey) {
                if (rawKey === null || rawKey === undefined) return "";
                const keyText = String(rawKey).trim();
                if (!keyText) return "";
                if (keyText.length === 1) {
                    if (keyText >= "0" && keyText <= "9") return "Digit" + keyText;
                    return "Key" + keyText.toUpperCase();
                }
                return keyText;
            };
            const requestServerStatusChat = function(reason, force = false) {
                if (!isLeaderboardMode || destroyed || !inGame) return false;
                if (!force && serverStatusChatAttempts >= 5) return false;
                const now = Date.now();
                if (!force && now - serverStatusLastChatAt < 1500) return false;
                serverStatusLastChatAt = now;
                serverStatusChatAttempts++;
                try {
                    const chatText = "$s";
                    const waitBeforeOpenMs = force ? 450 : 320;
                    global.setTimeout(() => {
                        if (destroyed || !inGame) return;
                        controller.press("Enter");
                    }, waitBeforeOpenMs);
                    global.setTimeout(() => {
                        if (destroyed || !inGame) return;
                        setValue(chatText);
                        performance.time += 90;
                        if (typeof a === "function") a();
                    }, waitBeforeOpenMs + 140);
                    global.setTimeout(() => {
                        if (destroyed || !inGame) return;
                        controller.press("Enter");
                    }, waitBeforeOpenMs + 300);
                    log(`[svstat] Requested status via $s (${reason})`);
                    return true;
                } catch (e) {
                    return false;
                }
            };
            const mainInterval = setInterval(function() {
                if (block || isPaused) {
                    return;
                }
                if (a) {
                    switch (i) {
                      case 1:
                        {
                            tryEnterGame("initial");
                            break;
                        }
                    }
                    if (!connected && !wsConstructed && !inGame && !hasJoinedGame && i >= 10 && i % 10 === 0) {
                        tryEnterGame("retry");
                    } else if (connected && !inGame && !hasJoinedGame && !hasJoined && i % 8 === 0) {
                        tryEnterGame("post-open", {
                            postOpen: true
                        });
                    }
                    if (lastHash !== location.hash) {
                        log("hash =", location.hash);
                        lastHash = location.hash;
                        if (hasJoined || hasJoinedGame || inGame) {
                            checkSpawnedHashOrCancel("location-hash-change");
                            scheduleDelayedSpawnFetch("location-hash");
                        }
                    }
                    let at = timeouts[i];
                    if (at) {
                        delete timeouts[i];
                        for (let i = 0, l = at.length; i < l; i++) {
                            at[i]();
                        }
                    }
                    position[2]--;
                    if (position[2] < 0) {
                        controller.press("KeyL");
                    }
                    if (hasJoined) {
                        if (ca.onJoin) {
                            ca.onJoin();
                        }
                        if (process.send) process.send({
                            type: "spawned",
                            id: config.id,
                            name: config.name
                        });
                        spawnAssistCount = 0;
                        spawnConfirmed = true;
                        hasJoinedGame = true;
                        scheduleDelayedSpawnFetch("spawn-text");
                        armNoUrlAfterJoinTimer("spawn-text");
                        armPostSpawnNoDigitsTimer("spawn-text");
                        armLeaderboardTimeout("spawn-text");
                        checkSpawnedHashOrCancel("spawn-join-branch");
                        hasJoined = false;
                        inGame = true;
                        upgrade = true;
                        let keys = [];
                        if (firstJoin) {
                            firstJoin = false;
                            const tankKeys = typeof config.tank === "string" ? config.tank : "";
                            for (let i = 0, l = tankKeys.length; i < l; i++) {
                                if (tankKeys[i]) keys.push(tankKeys[i]);
                            }
                            if (config.joinSequence && Array.isArray(config.joinSequence)) {
                                config.joinSequence.forEach(k => {
                                    if (k !== null && k !== undefined && String(k).trim()) keys.push(k);
                                });
                            }
                        }
                        controller.stats(config.stats);
                        if (config.autospin) {
                            controller.press("KeyC");
                        }
                        idleIndex = 0;
                        idleKeys = keys;
                        if (isLeaderboardMode) {
                            requestServerStatusChat("post-join", true);
                            global.setTimeout(() => requestServerStatusChat("spawn", true), 320);
                            global.setTimeout(() => requestServerStatusChat("spawn-retry"), 1300);
                        }
                    }
                    if (idleKeys) {
                        if (idleIndex >= 0) {
                            const k = idleKeys[idleIndex];
                            const code = normalizeKeyCode(k);
                            if (code) controller.press(code);
                            idleIndex++;
                            if (idleIndex >= idleKeys.length) {
                                idleIndex = -1;
                                idleKeys = false;
                            }
                        }
                    } else if (idleIndex >= -10) {
                        idleIndex--;
                    } else {
                        idleIndex = -11;
                    }
                    if ((hasJoinedGame || inGame) && !lastJoinedLinkUrl && i % 4 === 0) {
                        checkSpawnedHashOrCancel("main-loop");
                    }
                    if (isLeaderboardMode && inGame && i % 95 === 0 && (!serverStatusArenaLine || !serverStatusMsptLine)) {
                        requestServerStatusChat("periodic");
                    }
                    if (inGame && config.type === "follow" && idleIndex < -10) {
                        if (upgrade) {
                            const upgradeKeys = Array.isArray(config.keys) ? config.keys : [];
                            for (let i = 0, l = upgradeKeys.length; i < l; i++) {
                                const k = upgradeKeys[i];
                                const code = normalizeKeyCode(k);
                                if (code) controller.press(code);
                            }
                            upgrade = false;
                        }
                        if (socket && socket.readyState === 1 && statusRecieved && !subscribedToLeader && config.squadId) {
                            log(`Subscribing to leader using Squad ID: ${config.squadId}`);
                            send([ 10, config.squadId ]);
                            subscribedToLeader = true;
                        }
                        active--;
                        if (i % 175 === 174 && config.chatSpam) {
                            controller.chat(config.chatSpam);
                        }
                        let dx = target[0] - position[0], dy = target[1] - position[1];
                        if (active > 0) {
                            let ram = config.target === "mouse";
                            let move_dx, move_dy;
                            if (ram) {
                                move_dx = target[2] - position[0];
                                move_dy = target[3] - position[1];
                            } else {
                                move_dx = dx;
                                move_dy = dy;
                            }
                            let d2 = move_dx * move_dx + move_dy * move_dy;
                            let move_angle;
                            if (d2 < 4 && !ram) {
                                if (d2 < 1) {
                                    move_angle = controller.moveVector(-move_dx, -move_dy, i) + Math.PI;
                                } else {
                                    controller.moveDirection(0, 0);
                                }
                            } else {
                                move_angle = controller.moveVector(move_dx, move_dy, i);
                            }
                            let aimFollowsMovement = config.aim === "drone" && !target[4];
                            if (aimFollowsMovement) {
                                let p2 = Math.PI * 2;
                                let h = ((Math.round(move_angle * controller.iv) - .5) % 8 + 8) % 8 + .5;
                                h = controller.dv * h;
                                if (Math.abs(((h - idleAngle) % p2 + Math.PI) % p2 - Math.PI) > .75) {
                                    idleAngle = h + .75 * (2 * Math.random() - 1);
                                }
                                cIdleAngle = averageAngle(cIdleAngle, idleAngle, 5) % p2;
                                let dist = 20;
                                trigger.mousemove(controller.x = 250 + dist * Math.cos(cIdleAngle), controller.y = 250 + dist * Math.sin(cIdleAngle));
                            } else {
                                let aim_dx_game = target[2] - position[0];
                                let aim_dy_game = target[3] - position[1];
                                if (aim_dx_game !== 0 || aim_dy_game !== 0) {
                                    const angle = Math.atan2(aim_dy_game, aim_dx_game);
                                    const dist = 100;
                                    trigger.mousemove(controller.x = 250 + dist * Math.cos(angle), controller.y = 250 + dist * Math.sin(angle));
                                }
                            }
                            if (config.autoFire) {
                                controller.mouseDown();
                            } else {
                                if (target[4]) {
                                    controller.mouseDown();
                                } else {
                                    controller.mouseUp();
                                }
                            }
                        } else {
                            controller.moveDirection(0, 0);
                            if (Math.random() < .01) {
                                let dist = 20;
                                let randomAngle = 2 * Math.PI * Math.random();
                                trigger.mousemove(controller.x = 250 + dist * Math.cos(randomAngle), controller.y = 250 + dist * Math.sin(randomAngle));
                            }
                            controller.mouseUp();
                        }
                    }
                    if (died) {
                        inGame = false;
                        log("Death detected. Clearing render cache...");
                        block = true;
                        ignore = true;
                        let index = 0;
                        let interval = setInterval(function() {
                            if (destroyed) {
                                clearInterval(interval);
                                return;
                            }
                            for (let i = 0; i < 5; i++) {
                                let r = 100 + 900 * Math.random(), q = 100 + 900 * Math.random(), p = .5 + Math.random();
                                innerWidth = window.innerWidth = r;
                                innerHeight = window.innerHeight = q;
                                devicePixelRatio = window.devicePixelRatio = p;
                                if (a) {
                                    performance.time += 9e3;
                                    a();
                                }
                            }
                            index++;
                            if (index >= 5) {
                                clearInterval(interval);
                                end();
                            }
                        }, 100), end = function() {
                            innerWidth = window.innerWidth = 500;
                            innerHeight = window.innerHeight = 500;
                            devicePixelRatio = window.devicePixelRatio = 1;
                            if (config.autoRespawn) {
                                controller.press("Enter");
                            } else {
                                log("Render cache cleared.");
                            }
                            block = false;
                            ignore = false;
                            if (a) {
                                performance.time += 9e3;
                                a();
                            }
                            if (statusRecieved || i < 120) {
                                i++;
                            }
                        };
                        died = false;
                        return;
                    }
                    if (a) {
                        performance.time += 9e3;
                        a();
                    }
                    if (statusRecieved || i < 120) {
                        i++;
                    }
                }
            }, 20);
            const averageAngle = function(a, b, c) {
                let d = 2 * Math.PI;
                a = (a % d + d) % d;
                let e = (d + b - a) % d;
                if (e > Math.PI) {
                    return ((a + (e - d) / (c + 1)) % d + d) % d;
                } else {
                    return ((a + e / (c + 1)) % d + d) % d;
                }
            };
            let gameSocket = false, host = false;
            const WebSocket = new Proxy(ws, {
                construct: function(a, b, c) {
                    const fullUrl = b[0];
                    wsConstructed = true;
                    sniffAndEmitJoinedLink("websocket-url-token", fullUrl);
                    host = new url.URL(fullUrl).host;
                    let h = {
                        headers: {
                            "user-agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/121.0.0.0 Safari/537.36",
                            "accept-encoding": "gzip, deflate, br",
                            "accept-language": "en-US,en;q=0.9",
                            "cache-control": "no-cache",
                            connection: "Upgrade",
                            origin: "https://arras.io",
                            pragma: "no-cache",
                            upgrade: "websocket",
                            "Sec-WebSocket-Protocol": b[1] ? b[1].join(", ") : "",
                            host: host
                        },
                        followRedirects: true,
                        origin: "https://arras.io"
                    };
                    if (proxyAgent) {
                        h.agent = proxyAgent;
                        log(`[WS] Constructing game socket via proxy: ${fullUrl}`);
                    } else {
                        log(`[WS] Constructing game socket direct: ${fullUrl}`);
                    }
                    const newArgs = [ fullUrl, b[1], h ];
                    const d = Reflect.construct(a, newArgs, c);
                    d.addEventListener("open", function() {
                        wsOpened = true;
                        if (wsJoinWatchdogTimer) {
                            clearTimeout(wsJoinWatchdogTimer);
                            wsJoinWatchdogTimer = null;
                        }
                        armWsPostOpenNoDigitsTimer("websocket-open");
                        armLeaderboardTimeout("websocket-open");
                        log("WebSocket open.");
                        log("Websocket Opened");
                        if (process.send) {
                            process.send({
                                type: "websocket_open",
                                url: fullUrl
                            });
                        }
                        connected = true;
                        joinAttemptCount = 0;
                        spawnAssistCount = 0;
                        lastJoinAttemptAt = 0;
                        tryEnterGame("websocket-open", {
                            postOpen: true,
                            forceClick: false
                        });
                        global.setTimeout(() => tryEnterGame("websocket-open-fast", {
                            postOpen: true,
                            forceClick: false
                        }), 140);
                        global.setTimeout(() => tryEnterGame("websocket-open-click", {
                            postOpen: true,
                            forceClick: true
                        }), 320);
                    });
                    d.addEventListener("error", function(e) {
                        const msg = e && (e.message || e.code) ? e.message || e.code : String(e);
                        log(`[WS] error: ${msg}`);
                    });
                    d.addEventListener("close", function(e) {
                        if (gameSocket === d) {
                            gameSocket = false;
                        }
                        wsConstructed = false;
                        wsOpened = false;
                        connected = false;
                        spawnAssistCount = 0;
                        lastJoinAttemptAt = 0;
                        log("WebSocket closed. wasClean =", e.wasClean, "code =", e.code, "reason =", e.reason);
                        if (process.send) {
                            process.send({
                                type: "websocket_close",
                                code: e && e.code,
                                reason: e && e.reason ? String(e.reason) : ""
                            });
                        }
                    });
                    let closed = false;
                    d.addEventListener("message", function(e) {});
                    d.send = new Proxy(d.send, {
                        apply: function(f, g, h) {
                            return Reflect.apply(f, g, h);
                        }
                    });
                    d.close = new Proxy(d.close, {
                        apply: function(f, g, h) {
                            if (closed) {
                                return;
                            }
                            log("WebSocket closed by client.");
                            closed = true;
                            Reflect.apply(f, g, h);
                        }
                    });
                    d.addEventListener = new Proxy(d.addEventListener, {
                        apply: function(a, b, c) {
                            return Reflect.apply(a, b, c);
                        }
                    });
                    gameSocket = d;
                    return d;
                }
            });
            window.WebSocket = WebSocket;
            setGlobal("WebSocket", WebSocket);
            try {
                eval(x + "\n//# sourceURL=arras_game_script_" + config.id + ".js");
            } catch (err) {
                log(`[ERROR] Game script failed for bot #${config.id}:`, err.message);
                if (typeof console.error === "function") console.error(err);
            }
            let ca = oa || {};
            ca.window = window;
            ca.destroy = destroy;
            ca.controller = controller;
            ca.trigger = trigger;
            return Object.assign(ca, internalBotInterface);
        };
        let id = 0;
        let arras = {
            then: cb => {
                then(() => cb(arras));
            },
            setBootstrapProxy: setBootstrapProxy,
            startPrerequisites: startPrerequisites,
            create: function(o) {
                if (!ready) {
                    log("Warning: 'create' called before arras was ready. It will be queued.");
                }
                o.id = o.id !== undefined ? o.id : id++;
                currentBotInterface = run(script, o);
                return currentBotInterface;
            }
        };
        if (options.start) {
            options.start(arras);
        }
        return arras;
    }();
}
