const fs = require('fs');
const ws = require('ws');
const { HttpsProxyAgent } = require('https-proxy-agent');
const { SocksProxyAgent } = require('socks-proxy-agent');
const { pack, unpack } = require("msgpackr");
const url = require('url');
const { fork } = require('child_process');
const fetchModule = require('node-fetch');
const realFetch = fetchModule.default || fetchModule;
const readline = require('readline');

process.on('uncaughtException', function (e) { console.log(e) });

if (!process.env.IS_WORKER) {
  // --- MASTER PROCESS (TUI Controller) ---

  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });
  const configFilePath = 'bot_config.json';

  const getPath = function(name, tree) {
    let p = '', o = tree[name];
    while(o) { p = o[0] + p; let n = o[1]; if(n === 'Basic') { break } o = tree[n] }
    return p;
  };

  const tree = {
    'Twin': ['Y', 'Basic'], 'Double Twin': ['Y', 'Twin'], 'Triple Shot': ['U', 'Twin'], 'Sniper': ['U', 'Basic'], 'Machine Gun': ['I', 'Basic'], 'Flank Guard': ['H', 'Basic'], 'Hexa Tank': ['Y', 'Flank Guard'], 'Octo Tank': ['Y', 'Hexa Tank'], 'Cyclone': ['U', 'Hexa Tank'], 'Hexa-Trapper': ['I', 'Hexa Tank'], 'Tri-Angle': ['U', 'Flank Guard'], 'Fighter': ['Y', 'Tri-Angle'], 'Booster': ['U', 'Tri-Angle'], 'Falcon': ['I', 'Tri-Angle'], 'Bomber': ['H', 'Tri-Angle'], 'Auto-Tri-Angle': ['J', 'Tri-Angle'], 'Surfer': ['K', 'Tri-Angle'], 'Auto-3': ['I', 'Tri-Angle'], 'Auto-5': ['Y', 'Auto-3'], 'Mega-3': ['U', 'Auto-3'], 'Auto-4': ['I', 'Auto-3'], 'Banshee': ['H', 'Auto-3'], 'Trap Guard': ['H', 'Flank Guard'], 'Buchwhacker': ['Y', 'Trap Guard'], 'Gunner Trapper': ['U', 'Trap Guard'], 'Conqueror': ['J', 'Trap Guard'], 'Bulwark': ['K', 'Trap Guard'], 'Tri-Trapper': ['J', 'Flank Guard'], 'Fortress': ['Y', 'Tri-Trapper'], 'Septa-Trapper': ['I', 'Tri-Trapper'], 'Architect': ['H', 'Tri-Trapper'], 'Triple-Twin': ['K', 'Flank Guard'], 'Director': ['J', 'Basic'], 'Pounder': ['K', 'Basic'],
  };

  // --- MODIFIED: botConfig now includes modes for names and tanks ---
  let botConfig = {
    squadId: 'MySquadName',
    region: 'wa',
    name: '[SSS] tristam',
    nameMode: 'fixed', // 'fixed' or 'random'
    nameFile: 'names.txt',
    tank: 'Booster',
    keys: [],
    tankMode: 'single', // 'single' or 'multi'
    multiTankConfig: [], // Stores configs for multi-mode, e.g., [{ count: 2, tank: 'Twin', keys: ['U','K'] }]
    autoFire: false,
    autoRespawn: true,
    target: 'player',
    aim: 'drone',
    chatSpam: '',
    stats: [2, 2, 2, 6, 6, 8, 8, 8, 0],
    launchDelay: 20000,
    reconnectAttempts: 3,
    reconnectDelay: 15000
  };

  let workers = [];
  let proxies = {};
  let randomNames = []; // --- NEW: To store names from the name file ---
  let paused = false;

  function saveConfig() {
      try {
          fs.writeFileSync(configFilePath, JSON.stringify(botConfig, null, 2), 'utf8');
          return 'Configuration saved.';
      } catch (e) {
          return 'Error saving configuration file.';
      }
  }

  function loadConfig() {
      try {
          if (fs.existsSync(configFilePath)) {
              const savedConfigData = fs.readFileSync(configFilePath, 'utf8');
              const savedConfig = JSON.parse(savedConfigData);
              botConfig = { ...botConfig, ...savedConfig };
              return 'Configuration loaded from bot_config.json.';
          }
          return 'No config file found, using defaults.';
      } catch (e) {
          return 'Error loading config file. Using defaults.';
      }
  }

  function loadProxies() {
      try {
          const proxyData = fs.readFileSync('proxies.txt', 'utf8');
          const lines = proxyData.split(/\r?\n/).filter(line => line.trim() !== '');
          proxies = {}; // Clear existing proxies
          for (const line of lines) {
              const parts = line.trim().split(':');
              if (parts.length === 2) {
                  const [ip, port] = parts;
                  const proxyUrl = `http://${ip}:${port}`;
                  proxies[proxyUrl] = 'http';
              }
          }
          return `Successfully loaded ${Object.keys(proxies).length} HTTP proxies.`;
      } catch (e) {
          if (e.code === 'ENOENT') {
              return 'Warning: proxies.txt not found. Bots will run without proxies.';
          }
          return 'Error reading proxies.txt.';
      }
  }
  
  // --- NEW: Function to load random names from a file ---
  function loadNames() {
      if (botConfig.nameMode !== 'random') {
          return 'Name mode is not set to random.';
      }
      try {
          const nameData = fs.readFileSync(botConfig.nameFile, 'utf8');
          randomNames = nameData.split(/\r?\n/).filter(line => line.trim() !== '');
          if (randomNames.length === 0) {
              return `Warning: ${botConfig.nameFile} is empty. Using fixed name.`;
          }
          return `Successfully loaded ${randomNames.length} names from ${botConfig.nameFile}.`;
      } catch (e) {
          if (e.code === 'ENOENT') {
              return `Warning: ${botConfig.nameFile} not found. Using fixed name.`;
          }
          return `Error reading ${botConfig.nameFile}.`;
      }
  }


  function displayMenu() {
    console.clear();
    console.log('=========================================');
    console.log('        ARRAS.IO BOT PANEL');
    console.log('=========================================');
    console.log('\n--- CURRENT BOT CONFIGURATION ---');
    console.log(`Region: ${botConfig.squadId}`);
    // --- MODIFIED: Display for new name and tank modes ---
    console.log(`Name Mode: ${botConfig.nameMode}` + (botConfig.nameMode === 'random' ? ` (${botConfig.nameFile})` : ` (${botConfig.name})`));
    console.log(`Tank Mode: ${botConfig.tankMode}`);
    if (botConfig.tankMode === 'single') {
        console.log(`   - Tank: ${botConfig.tank}`);
        console.log(`   - Keys: ${botConfig.keys.join(', ') || 'None'}`);
    } else {
        console.log(`   - Configs: ${botConfig.multiTankConfig.length}`);
        botConfig.multiTankConfig.forEach(c => {
            console.log(`     - ${c.count}x ${c.tank} (${c.keys.join(',') || 'None'})`);
        });
    }
    console.log(`AutoFire: ${botConfig.autoFire ? 'On' : 'Off'}`);
    console.log(`Target Mode: ${botConfig.target}`);
    console.log(`Aim Mode: ${botConfig.aim}`);
    console.log(`Chat Spam: "${botConfig.chatSpam}"`);
    console.log(`Launch Delay: ${botConfig.launchDelay}ms`);
    console.log(`Reconnect Attempts: ${botConfig.reconnectAttempts}`);
    console.log(`Reconnect Delay: ${botConfig.reconnectDelay}ms`);
    console.log(`Bots Running: ${workers.length}`);
    console.log(`Squad ID: ${botConfig.squadId}`); 
    console.log(`Bots Paused: ${paused}`);

    console.log('\n--- ACTIONS ---');
    console.log('[1] Start Bots');
    console.log('[2] Disconnect Bots');
    console.log(`[3] ${paused ? 'Resume' : 'Pause'} all`);
    console.log('[4] Exit');
    console.log('[5] Reload Proxies & Names');
    console.log('[6] Change Bot Configuration');
    console.log('=========================================');
    rl.question('Select an option: ', handleMenuChoice);
  }

  function handleMenuChoice(choice) {
    switch (choice.trim()) {
      case '1':
        startBots();
        break;
      case '2':
        disconnectBots();
        break;
      case '3':
        togglePause();
        break;
      case '4':
        console.log('Exiting...');
        disconnectBots();
        rl.close();
        process.exit();
        break;
      case '5':
        console.log(`\n${loadProxies()}`);
        console.log(`${loadNames()}`);
        setTimeout(displayMenu, 2000);
        break;
      case '6':
        showConfigMenu();
        break;
      default:
        console.log('\nInvalid option.');
        setTimeout(displayMenu, 1000);
        break;
    }
  }

  // --- MODIFIED: startBots now handles both single and multi tank modes ---
  function startBots() {
    const launchQueue = [];
    const proxyList = Object.keys(proxies);
    const hasProxies = proxyList.length > 0;
    let botIdCounter = workers.length;

    // --- Build the queue of bots to launch based on config ---
    if (botConfig.tankMode === 'multi') {
        if (botConfig.multiTankConfig.length === 0) {
            console.log('\nMulti-tank mode is enabled, but no configurations are set.');
            setTimeout(displayMenu, 2000);
            return;
        }
        botConfig.multiTankConfig.forEach(tankConf => {
            for (let i = 0; i < tankConf.count; i++) {
                launchQueue.push({
                    tank: tankConf.tank,
                    keys: tankConf.keys
                });
            }
        });
    } else {
        rl.question('Enter amount of bots to start: ', (amount) => {
            const numBots = parseInt(amount, 10);
            if (isNaN(numBots) || numBots <= 0) {
                console.log('\nInvalid amount.');
                setTimeout(displayMenu, 1000);
                return;
            }
            for (let i = 0; i < numBots; i++) {
                launchQueue.push({
                    tank: botConfig.tank,
                    keys: botConfig.keys
                });
            }
            launchAll(launchQueue);
        });
        return; // Wait for user input
    }
    
    launchAll(launchQueue);

    function launchAll(queue) {
        console.log(`\nStarting ${queue.length} bot(s) with a ${botConfig.launchDelay}ms delay between each...`);
        queue.forEach((botSpec, i) => {
            // Determine name for this bot
            let botName = botConfig.name;
            if (botConfig.nameMode === 'random' && randomNames.length > 0) {
                botName = randomNames[Math.floor(Math.random() * randomNames.length)];
            }

            const config = {
                id: botIdCounter + i,
                proxy: hasProxies ? { type: proxies[proxyList[i % proxyList.length]], url: proxyList[i % proxyList.length] } : false,
                hash: '#' + botConfig.squadId,
                name: botName,
                stats: [...botConfig.stats],
                type: 'follow',
                token: 'follow-8fe6ca',
                autoFire: botConfig.autoFire,
                autoRespawn: botConfig.autoRespawn,
                target: botConfig.target,
                aim: botConfig.aim,
                keys: [...botSpec.keys],
                tank: getPath(botSpec.tank, tree),
                chatSpam: botConfig.chatSpam,
                squadId: botConfig.squadId,
                reconnectAttempts: botConfig.reconnectAttempts,
                reconnectDelay: botConfig.reconnectDelay,
                loadFromCache: true,
                cache: false,
                arrasCache: './ah.txt',
            };

            setTimeout(() => {
                console.log(`Launching bot #${config.id} (Tank: ${botSpec.tank}, Name: ${config.name})...`);
                const worker = fork(__filename, [], { env: { ...process.env, IS_WORKER: 'true' } });
                worker.send({type: 'start', config: config});
                workers.push(worker);
            }, botConfig.launchDelay * i); 
        });
        setTimeout(displayMenu, botConfig.launchDelay * queue.length + 1000);
    }
  }

  function disconnectBots() {
    console.log(`\nDisconnecting ${workers.length} bot(s)...`);
    workers.forEach(worker => worker.kill());
    workers = [];
    paused = false;
    setTimeout(displayMenu, 1000);
  }

  function togglePause() {
      paused = !paused;
      console.log(`\nSending ${paused ? 'pause' : 'resume'} command to ${workers.length} bot(s)...`);
      workers.forEach(worker => worker.send({ type: 'pause', paused: paused }));
      setTimeout(displayMenu, 1000);
  }

  // --- MODIFIED: Config menu now includes sub-menus for new features ---
  function showConfigMenu() {
      console.clear();
      console.log('--- CHANGE BOT CONFIGURATION ---\n');
      console.log('[1] Squad ID (Region without numbers)');
      console.log('[2] Tank Configuration (Single/Multi)');
      console.log('[3] Bot Name Configuration (Fixed/Random)');
      console.log('[4] AutoFire');
      console.log('[5] Target Mode');
      console.log('[6] Aim Mode');
      console.log('[7] Chat Spam Message');
      console.log('[8] Stat Build (for all bots)');
      console.log('[9] Launch Delay');
      console.log('[10] Reconnect Attempts');
      console.log('[11] Reconnect Delay');
      console.log('[12] Back to Main Menu');
      console.log('--------------------------------\n');
      rl.question('Select setting to change: ', (choice) => {
          handleConfigChange(choice.trim());
      });
  }

  // --- NEW: Function to parse multi-tank config string ---
  function parseMultiTankConfig(input) {
      const configs = [];
      const parts = input.toLowerCase().split('and');
      let success = true;

      for (const part of parts) {
          const trimmed = part.trim();
          if (!trimmed) continue;

          const elements = trimmed.split(/\s+/);
          const count = parseInt(elements[0], 10);
          
          if (isNaN(count) || elements.length < 2) {
              console.log(`Invalid format in segment: "${part}"`);
              success = false;
              continue;
          }

          let keys = [];
          let tankName = '';
          const lastElement = elements[elements.length - 1];
          
          // Check if the last element is a key string (e.g., u,k,u)
          if (/^[a-z](,[a-z])*$/.test(lastElement)) {
              keys = lastElement.toUpperCase().split(',');
              tankName = elements.slice(1, -1).join(' ');
          } else {
              tankName = elements.slice(1).join(' ');
          }
          
          // Capitalize the first letter of each word in the tank name for matching
          const formattedTankName = tankName.split(' ').map(w => w.charAt(0).toUpperCase() + w.slice(1)).join(' ');
          
          if (tree[formattedTankName]) {
              configs.push({ count, tank: formattedTankName, keys });
          } else {
              console.log(`Invalid tank name: "${formattedTankName}"`);
              success = false;
          }
      }
      
      if (success && configs.length > 0) {
          botConfig.multiTankConfig = configs;
          return true;
      }
      return false;
  }
  
  // --- MODIFIED: handleConfigChange now manages the new configuration options ---
  function handleConfigChange(choice) {
      const back = (msg) => {
          if (msg) console.log(msg);
          setTimeout(showConfigMenu, 1500);
      };
      const saveAndBack = () => {
          const msg = saveConfig();
          console.log('Configuration updated. ' + msg);
          setTimeout(showConfigMenu, 1500);
      };

      switch(choice) {
          case '1':
            rl.question(`Enter new Squad ID (current: ${botConfig.squadId}): `, (val) => { botConfig.squadId = val || botConfig.squadId; saveAndBack(); });
            break;
          case '2': // Tank Configuration
              rl.question('Select Tank Mode (single/multi): ', (mode) => {
                  if (mode === 'single') {
                      botConfig.tankMode = 'single';
                      console.log('Available tanks:', Object.keys(tree).join(', '));
                      rl.question(`Enter tank name (current: ${botConfig.tank}): `, (tank) => {
                          if (tree[tank]) botConfig.tank = tank;
                          rl.question(`Enter extra keys, comma-separated (current: ${botConfig.keys.join(',')}): `, (keys) => {
                              botConfig.keys = keys.split(',').map(k => k.trim().toUpperCase()).filter(Boolean);
                              saveAndBack();
                          });
                      });
                  } else if (mode === 'multi') {
                      botConfig.tankMode = 'multi';
                      console.log('Enter multi-tank configuration.');
                      console.log('Example: 2 Twin U,K,U and 1 Director U,U,U and 1 Twin U (The "and" keyword is important to separate the type of tanks)');
                      rl.question('Config string: ', (str) => {
                          if (parseMultiTankConfig(str)) {
                              saveAndBack();
                          } else {
                              back('Failed to parse multi-tank config. No changes made.');
                          }
                      });
                  } else {
                      back('Invalid mode.');
                  }
              });
              break;
          case '3': // Name Configuration
              rl.question('Select Name Mode (fixed/random): ', (mode) => {
                  if (mode === 'fixed') {
                      botConfig.nameMode = 'fixed';
                      rl.question(`Enter bot name (current: ${botConfig.name}): `, (val) => { botConfig.name = val || botConfig.name; saveAndBack(); });
                  } else if (mode === 'random') {
                      botConfig.nameMode = 'random';
                      rl.question(`Enter name file (current: ${botConfig.nameFile}): `, (val) => {
                          botConfig.nameFile = val || botConfig.nameFile;
                          console.log(loadNames());
                          saveAndBack();
                      });
                  } else {
                      back('Invalid mode.');
                  }
              });
              break;
          case '4':
              rl.question('Set AutoFire? (on/off): ', (val) => { botConfig.autoFire = val.toLowerCase() === 'on'; saveAndBack(); });
              break;
          case '5':
              rl.question('Set Target Mode (player/mouse): ', (val) => { if (['player', 'mouse'].includes(val)) { botConfig.target = val; saveAndBack(); } else { back('Invalid mode.'); } });
              break;
          case '6':
              rl.question('Set Aim Mode (drone/movement): ', (val) => { if (['drone', 'movement'].includes(val)) { botConfig.aim = val; saveAndBack(); } else { back('Invalid mode.'); } });
              break;
          case '7':
              rl.question('Enter new chat spam message: ', (val) => { botConfig.chatSpam = val; saveAndBack(); });
              break;
          case '8': // Changed from Extra Keys to Stats
              console.log('Enter 10 stat points, comma-separated (e.g., 2,2,2,6,6,8,8,8,0,0)');
              rl.question(`Set new stat build (current: ${botConfig.stats.join(',')}): `, (val) => {
                  const stats = val.split(',').map(s => parseInt(s.trim(), 10));
                  if (stats.length === 10 && stats.every(s => !isNaN(s) && s >= 0)) {
                      botConfig.stats = stats;
                      saveAndBack();
                  } else {
                      back('Invalid stat build. Must be 10 numbers.');
                  }
              });
              break;
          case '9':
              rl.question(`Enter new launch delay (current: ${botConfig.launchDelay}ms): `, (val) => {
                  const delay = parseInt(val, 10);
                  if (!isNaN(delay) && delay >= 0) { botConfig.launchDelay = delay; saveAndBack(); } else { back('Invalid number.'); }
              });
              break;
          case '10':
              rl.question(`Enter max reconnect attempts (current: ${botConfig.reconnectAttempts}): `, (val) => {
                  const attempts = parseInt(val, 10);
                  if (!isNaN(attempts) && attempts >= 0) { botConfig.reconnectAttempts = attempts; saveAndBack(); } else { back('Invalid number.'); }
              });
              break;
          case '11':
              rl.question(`Enter reconnect delay (current: ${botConfig.reconnectDelay}ms): `, (val) => {
                  const delay = parseInt(val, 10);
                  if (!isNaN(delay) && delay >= 0) { botConfig.reconnectDelay = delay; saveAndBack(); } else { back('Invalid number.'); }
              });
              break;
          case '12':
              displayMenu();
              break;
          default:
              back('Invalid choice.');
      }
  }

  // Initial Load
  console.log(loadConfig());
  console.log(loadProxies());
  console.log(loadNames()); // --- NEW: Load names on startup ---
  setTimeout(displayMenu, 1000);

} else {
  // --- WORKER PROCESS (Unchanged logic, with added message handling) ---
  // THIS ENTIRE SECTION REMAINS THE SAME AS THE ORIGINAL SCRIPT
  let isPaused = false;
  let currentBotInterface = {}; // To hold bot state

  process.on('message', (message) => {
      if (message.type === 'start') {
          const config = message.config;
          options.token = config.token;
          options.loadFromCache = config.loadFromCache;
          options.cache = config.cache;
          options.arrasCache = config.arrasCache;
          
          arras.then(function() {
            currentBotInterface = arras.create(config);
          });
      } else if (message.type === 'pause') {
          isPaused = message.paused;
          if (currentBotInterface.log) { // Check if bot is initialized
              currentBotInterface.log(`Bot state is now: ${isPaused ? 'PAUSED' : 'RESUMED'}`);
          }
      }
  });

  const options = { start: () => {} }; // Start is now handled by message handler

  const tree = {
    'Twin': ['Y', 'Basic'], 'Double Twin': ['Y', 'Twin'], 'Triple Shot': ['U', 'Twin'], 'Sniper': ['U', 'Basic'], 'Machine Gun': ['I', 'Basic'], 'Flank Guard': ['H', 'Basic'], 'Hexa Tank': ['Y', 'Flank Guard'], 'Octo Tank': ['Y', 'Hexa Tank'], 'Cyclone': ['U', 'Hexa Tank'], 'Hexa-Trapper': ['I', 'Hexa Tank'], 'Tri-Angle': ['U', 'Flank Guard'], 'Fighter': ['Y', 'Tri-Angle'], 'Booster': ['U', 'Tri-Angle'], 'Falcon': ['I', 'Tri-Angle'], 'Bomber': ['H', 'Tri-Angle'], 'Auto-Tri-Angle': ['J', 'Tri-Angle'], 'Surfer': ['K', 'Tri-Angle'], 'Auto-3': ['I', 'Tri-Angle'], 'Auto-5': ['Y', 'Auto-3'], 'Mega-3': ['U', 'Auto-3'], 'Auto-4': ['I', 'Auto-3'], 'Banshee': ['H', 'Auto-3'], 'Trap Guard': ['H', 'Flank Guard'], 'Buchwhacker': ['Y', 'Trap Guard'], 'Gunner Trapper': ['U', 'Trap Guard'], 'Bomber': ['I', 'Trap Guard'], 'Conqueror': ['J', 'Trap Guard'], 'Bulwark': ['K', 'Trap Guard'], 'Tri-Trapper': ['J', 'Flank Guard'], 'Fortress': ['Y', 'Tri-Trapper'], 'Hexa-Trapper': ['U', 'Tri-Trapper'], 'Septa-Trapper': ['I', 'Tri-Trapper'], 'Architect': ['H', 'Tri-Trapper'], 'Triple-Twin': ['K', 'Flank Guard'], 'Director': ['J', 'Basic'], 'Pounder': ['K', 'Basic'],
  }, getPath = function(name) {
    let p = '', o = tree[name]
    while(o) {
      p = o[0] + p
      let n = o[1]
      if(n === 'Basic') { break }
      o = tree[n]
    }
    return p
  }

  WebAssembly.instantiateStreaming = false
  const arras = (function() {
    const log = function() {
      global.console.log(`[headless]`, ...arguments)
    }
    let lastRecieve = 0
    let connect = function() {
      log('Connecting to leader/follower server...')
      socket = new ws(wu, {
        "headers": {
          "user-agent": "Mozilla/5.0 (X11; CrOS x86_64 14588.123.0) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/101.0.0.0 Safari/537.36",
          "accept-encoding": "gzip, deflate, br",
          "accept-language": "en-US,en;q=0.9",
          "cache-control": "no-cache",
          "connection": "Upgrade",
          "origin": "https://arras.io",
          "pragma": "no-cache",
          "upgrade": "websocket"
        },
        "followRedirects": true,
        "origin": "https://arras.io",
        "localAddress":0
      })
      socket.binaryType = 'arraybuffer'
      socket.addEventListener('open', function() {
        log('Connected to leader/follower server. Waiting for server name to subscribe.')
      })
      socket.addEventListener('message', function(e) {
        try {
          if (!currentBotInterface.target) return;

          let data = unpack(new Uint8Array(e.data));
          if(!data || !Array.isArray(data)) { return }

          const type = data.splice(0, 1)[0];
          switch(type) {
            case 101: { 
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
            case 102: { 
                log(`Leader ${data[0]} is now inactive.`);
                currentBotInterface.setActive(0);
                currentBotInterface.setSubscribed(false);
                break;
            }
            case 103: { 
                log(`Error from server: ${data[0]}`);
                currentBotInterface.setActive(0);
                currentBotInterface.setSubscribed(false);
                break;
            }
          }
        } catch(e) { log('Error processing message from server:', e); }
      })
      socket.addEventListener('close', function() {
        log('Disconnected from leader/follower server.')
        socket = false
        subscribedToLeader = false;
        setTimeout(connect, 3000)
      })
    }, socket = false, send = function(p) {
      if(socket && socket.readyState === 1) {
        socket.send(pack(p))
      }
    }, wu = 'ws://localhost:8080', subscribedToLeader = false;
    connect();

    let app = false
    const wasm = function() {
      return {
        arrayBuffer: function() {
          return app
        }
      }
    }
    let lastStatus = 0, statusData = ''
    const getStatus = function(f, s) {
      let now = global.performance.now()
      if(statusData && now - lastStatus < 15000) {
        return {
          then: function() {
            return {
              then: function(f) {
                let i = JSON.parse(statusData)
                s(i)
                f(i)
              }
            }
          }
        }
      }
      let then = function() {}
      realFetch(f).then(x => x.text()).then(x => {
        statusData = x
        let i = JSON.parse(x)
        s(i)
        then(i)
      })
      return {
        then: function() {
          return {
            then: function(f) {
              then = f
            }
          }
        }
      }
    }
    
    let ready = false, script = false, o = [], then = function(f) {
      if (ready) {
        f();
      } else {
        o.push(f);
      }
    };

    const initializeAndRunQueue = function() {
        ready = true;
        log('Headless arras ready.');
        for (let i = 0, l = o.length; i < l; i++) {
            o[i]();
        }
        o = [];
        then = function(f) {
            f();
        };
    }

    let prerequisites = 0;
    const onPrerequisiteLoaded = function() {
        prerequisites++;
        if (prerequisites === 2) {
            initializeAndRunQueue();
        }
    }

    realFetch('https://arras.io/app.wasm').then(x => {
      x.arrayBuffer().then(x => {
        app = x;
        log('Prerequisite 1/2: app.wasm loaded.');
        onPrerequisiteLoaded();
      })
    });

    const loadScript = function() {
        const activateBot = (scriptContent) => {
            script = scriptContent;
            log('Prerequisite 2/2: Game script loaded.');
            onPrerequisiteLoaded();
        };

        const extractScriptFromHtml = (html) => {
            const scriptTagStart = html.indexOf('<script>');
            if (scriptTagStart === -1) {
                log('Error: Could not find <script> tag in content.');
                return null;
            }
            let scriptContent = html.slice(scriptTagStart + 8);
            const scriptTagEnd = scriptContent.indexOf('</script');
            if (scriptTagEnd === -1) {
                log('Error: Could not find closing </script> tag.');
                return null;
            }
            scriptContent = scriptContent.slice(0, scriptTagEnd);
            return scriptContent;
        };

        log('Fetching from https://arras.io to ensure correct script execution order...');
        realFetch('https://arras.io').then(x => x.text()).then(html => {
            console.log('Response recieved.');
            const extractedScript = extractScriptFromHtml(html);
            if (extractedScript) {
                activateBot(extractedScript);
            }
        }).catch(err => {
            log('FATAL: Could not fetch from arras.io. Please check network or use a valid cache file.', err);
        });
    }
    loadScript();

const run = function(x, config, oa) {
      const log = function() {
        global.console.log(`[headless ${config.id}]`, ...arguments)
      }

      const eventLog = [];

      let target = [0, 0, 0, 0, false],
          active = 0,
          subscribedToLeader = false;

      const internalBotInterface = {
        target: target,
        setActive: (val) => { active = val; },
        setSubscribed: (val) => { subscribedToLeader = val; },
        log: log
      };

      let destroy = function() {
        if(destroyed) { return }
        log('Destroying instance...')
        if(gameSocket && gameSocket.readyState < 3) {
          gameSocket.close()
          gameSocket = false
        }
        clearInterval(mainInterval)
        destroyed = true
      }, destroyed = false
      const setInterval = new Proxy(global.setInterval, { apply:function(a, b, c) {
        if(destroyed) { return }
        return Reflect.apply(a, b, c)
      } }), setTimeout = new Proxy(global.setTimeout, { apply:function(a, b, c) {
        if(destroyed) { return }
        return Reflect.apply(a, b, c)
      } })
      const h = function(o) {
        return new Proxy(o, { get:function(a, b, c) {
          let d = Reflect.get(a, b, c)
          return d
        }, set:function(a, b, c) {
          return Reflect.set(a, b, c)
        } })
      }
      const handleListener = function(type, f, target) {
        listeners[type] = f
      }
      const listeners = {}
      const trigger = {
        mousemove: function(clientX, clientY) {
          if(listeners.mousemove) {
            listeners.mousemove({
              isTrusted: true,
              clientX: clientX,
              clientY: clientY
            })
          }
        },
        mousedown: function(clientX, clientY, button) {
          if(listeners.mousedown) {
            listeners.mousedown({
              isTrusted: true,
              clientX: clientX,
              clientY: clientY,
              button: button
            })
          }
        },
        mouseup: function(clientX, clientY, button) {
          if(listeners.mouseup) {
            listeners.mouseup({
              isTrusted: true,
              clientX: clientX,
              clientY: clientY,
              button: button
            })
          }
        },
        keydown: function(code, repeat) {
          if(listeners.keydown) {
            listeners.keydown({
              isTrusted: true,
              code: code,
              key: '',
              repeat: repeat || false,
              preventDefault: function() {}
            })
          }
        },
        keyup: function(code, repeat) {
          if(listeners.keyup) {
            listeners.keyup({
              isTrusted: true,
              code: code,
              key: '',
              repeat: repeat || false,
              preventDefault: function() {}
            })
          }
        }
      }

      global.window = global.parent = global.top = {
          WebAssembly,
          googletag: {
              cmd: {
                  push: function(f) { try { f(); } catch(e) {} }
              },
              defineSlot: function() { return this; },
              addService: function() { return this; },
              display: function() { return this; },
              pubads: function() { return this; },
              enableSingleRequest: function() { return this; },
              collapseEmptyDivs: function() { return this; },
              enableServices: function() { return this; }
          },
          arrasAdDone: true
      };

      global.crypto = global.window.crypto = {
        getRandomValues: function(a) { return a }
      };
      global.addEventListener = global.window.addEventListener =  function(type, f) {
        handleListener(type, f, global.window)
      };
      global.removeEventListener = global.window.removeEventListener = function(type, f) {
      };
      global.Image = global.window.Image = function() {
        return {}
      };

      let inputs = [], setValue = function(str) {
        for(let i=0,l=inputs.length;i<l;i++) {
          inputs[i].value = str
        }
      }
      let position = [0, 0, 5], died = false, ignore = false, disconnected = false, connected = false, inGame = false, upgrade = false, reconnectCount = 0;
      
      let innerWidth = global.window.innerWidth = 500
      let innerHeight = global.window.innerHeight = 500
      
      let st = 2, lx = 0, gd = 1, canvasRef = {}, sr = 1, s = 1;

      const g = function() {
        let w = innerWidth;
        let h = innerHeight;
        if (!canvasRef.width) canvasRef.width = w;
        if (w * 0.5625 > h) {
            s = 888.888888888 / w;
        } else {
            s = 500 / h;
        }
        sr = canvasRef.width / w;
      };
      g();

      global.document = global.window.document = (function() {
        const emptyFunc = () => {};
        const emptyStyle = { setProperty: emptyFunc };
        
        const simulatedContext2D = {
          isContextLost: () => false,
          
          fillText: function() {
            if(ignore) { return }
            let a = Array.from(arguments)
            if(this.font === 'bold 7px Ubuntu' && this.fillStyle === 'rgb(255,255,255)') {
              if(a[0] === `You have spawned! Welcome to the game.`) {
                hasJoined = firstJoin = true
              } else if(a[0] === 'You have traveled through a portal!') {
                hasJoined = true
              }
              if((a[0].startsWith('The server was ') && a[0].endsWith('% active')) || a[0].startsWith('Survived for ') || a[0].startsWith('Succumbed to ') || a[0] === 'You have self-destructed.' || a[0] === `Vanished into thin air` || a[0].startsWith('You have been killed by ')) {
                died = true
              }
              if(!a[0].startsWith(`You're using an ad blocker.`) && a[0] !== 'Respawn' && a[0] !== 'Back' && a[0] !== 'Reconnect' && a[0].length > 2) {
                log('[arras]', a[0])
              }
            }
            if(this.font === 'bold 7.5px Ubuntu' && this.fillStyle === 'rgb(231,137,109)') {
              if(a[0] === 'You have been temporarily banned from the game.' || a[0] === 'Your IP address have been blacklisted due to suspicious activities.') {
                disconnected = true
                destroy()
                log('[arras]', a[0])
              } else if(a[0].startsWith('The connection closed due to ')) {
                disconnected = true
                if(!destroyed) {
                  destroy()
                  if(connected) {
                    if (reconnectCount < config.reconnectAttempts) {
                        reconnectCount++;
                        log(`Attempting to reconnect in ${config.reconnectDelay / 1000}s... (${reconnectCount}/${config.reconnectAttempts})`);
                        global.setTimeout(function() {
                            log('Reconnecting...');
                            run(x, config, arras);
                        }, config.reconnectDelay);
                    } else {
                        log(`Max reconnection attempts reached (${config.reconnectAttempts}). Will not reconnect.`);
                    }
                  }
                }
                log('[arras]', a[0])
              }
            }
            if(this.font === 'bold 5.1px Ubuntu' && this.fillStyle === 'rgb(255,255,255)') {
              if(a[0].startsWith('Coordinates: (')) {
                let b = a[0].slice(14), l = b.length
                if(b[l - 1] === ')') {
                  b = b.slice(0, l - 1).split(', ')
                  if(b.length === 2) {
                    let x = parseFloat(b[0])
                    let y = parseFloat(b[1])
                    position[0] = x
                    position[1] = y
                    position[2] = 5
                  }
                }
              }
            }
          },
          
          measureText: (text) => ({ width: text.length }),
          clearRect: emptyFunc, strokeRect: emptyFunc, fillRect: emptyFunc,
          save: emptyFunc, translate: emptyFunc, clip: emptyFunc, restore: emptyFunc,
          beginPath: emptyFunc, 
          moveTo: function() {
            canvasRef = this.canvas;
            if (st > 0) {
              st--;
              if (st === 1) {
                lx = arguments[0];
              } else {
                const diff = arguments[0] - lx;
                if (diff !== 0) {
                  gd = sr / diff;
                }
              }
            }
          },
          lineTo: emptyFunc, rect: emptyFunc,
          arc: emptyFunc, ellipse: emptyFunc, roundRect: emptyFunc, closePath: emptyFunc,
          fill: emptyFunc, stroke: emptyFunc, strokeText: emptyFunc, drawImage: emptyFunc,
        };

        const createElement = function(tag, options) {
          const element = {
            tag: tag ? tag.toLowerCase() : '',
            appended: false,
            value: '',
            style: emptyStyle,
            addEventListener: (type, f) => handleListener(type, f, element),
            setAttribute: emptyFunc,
            appendChild: (e) => { e.appended = true },
            focus: emptyFunc,
            blur: emptyFunc,
            remove: emptyFunc,
            getBoundingClientRect: () => ({
              width: innerWidth, height: innerHeight, top: 0, left: 0, bottom: innerHeight, right: innerWidth,
            }),
          };

          if (element.tag === 'canvas') {
            element.toDataURL = () => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAUAAAAFCAYAAACNbyblAAAADElEQVQImWNgoBMAAABpAAFEI8ARAAAAAElFTkSuQmCC';
            element.getContext = (type) => {
                if (type === '2d') {
                    simulatedContext2D.canvas = element;
                    return simulatedContext2D;
                }
                return null;
            };
          }

          if (element.tag === 'input') {
            inputs.push(element);
          }
          
          if (options) {
            Object.assign(element, options);
          }

          return element;
        };

        const doc = createElement('document', {
          createElement: createElement,
          body: null,
          fonts: { load: () => true },
          referrer: '',
        });
        doc.body = createElement('body');
        
        return doc;
      })();

      global.location = global.window.location = {
        hostname: 'arras.io',
        hash: config.hash,
        query: ''
      }
      let lastHash = global.location.hash
      global.prompt = global.window.prompt = function() {
        console.log('prompt', ...arguments)
      }
      let devicePixelRatio = global.window.devicePixelRatio = 1
      let a = false
      global.requestAnimationFrame = global.window.requestAnimationFrame = function(f) {
        st = 2;
        g();
        a = f
      }
      global.performance = {
        time: 0,
        now: function() {
          return this.time
        }
      }
      const console = {
        log: new Proxy(global.console.log, { apply:function(a, b, c) {
          if(c[0] === '%cStop!' || (c[0] && c[0].startsWith && c[0].startsWith('%cHackers have been known'))) { return }
          return Reflect.apply(a, b, c)
        } })
      }

      let proxyAgent = null;
      if (config.proxy) {
          if (config.proxy.type === 'socks') {
              proxyAgent = new SocksProxyAgent(config.proxy.url);
          } else if (config.proxy.type === 'http') {
              proxyAgent = new HttpsProxyAgent(config.proxy.url);
          }
      }

      let i = 0, controller = {
        x: 250,
        y: 250,
        mouseDown: function() {
          trigger.mousedown(controller.x, controller.y)
        },
        mouseUp: function() {
          trigger.mouseup(controller.x, controller.y)
        },
        click: function(x, y) {
          trigger.mousedown(x, y, 0)
          trigger.mouseup(x, y, 0)
        },
        press: function(code) {
          trigger.keydown(code)
          trigger.keyup(code)
        },
        chat: function(str) {
          log('Sent chat:', str)
          controller.press('Enter')
          global.performance.time += 90
          a()
          controller.press('Enter')
          global.performance.time += 90
          a()
          setValue(str)
          controller.press('Enter')
          global.performance.time += 90
          a()
          setValue(str)
          controller.press('Enter')
        },
        moveDirection: function(x, y) {
          trigger[x < 0 ? 'keydown' : 'keyup']('KeyA')
          trigger[y < 0 ? 'keydown' : 'keyup']('KeyW')
          trigger[x > 0 ? 'keydown' : 'keyup']('KeyD')
          trigger[y > 0 ? 'keydown' : 'keyup']('KeyS')
        },
        iv: 4 / Math.PI,
        dv: Math.PI / 4,
        ix: [1, 1, 0, -1, -1, -1, 0, 1],
        iy: [0, 1, 1, 1, 0, -1, -1, -1],
        moveVector: function(x, y, i) {
          let d = Math.atan2(y, x)
          let h = (Math.round(d * controller.iv) % 8 + 8) % 8
          let x2 = controller.ix[h]
          let y2 = controller.iy[h]
          controller.moveDirection(x2, y2)
          return h * controller.dv
        },
        stats: function(arr) {
          for(let i=0;i<10;i++) {
            let code = `Digit${(i + 1) % 10}`
            for(let u=0;u<arr[i];u++) {
              controller.press(code)
            }
          }
        }
      }, statusRecieved = false, status = [], firstJoin = false, hasJoined = false, timeouts = {}, timeout = function(f, t) {
        if(!(t >= 1)) { t = 1 }
        let n = i + t
        let a = timeouts[n]
        if(!a) {
          a = timeouts[n] = []
        }
        a.push(f)
      }, block = false, idleKeys = false, idleIndex = -1
      let idleAngle = 0, cIdleAngle = 0
      
      const mainInterval = setInterval(function() {
        if(block || isPaused) { // <-- Check for pause flag
          return
        }
        
        if(a) {
          switch(i) {
            case 1: {
              setValue(config.name)
              controller.click(250, 190)
              log('Play button clicked!', config.name, global.location.hash)
              break
            }
          }
          if(lastHash !== global.location.hash) {
            log('hash =', global.location.hash)
            lastHash = global.location.hash
          }
          let at = timeouts[i]
          if(at) {
            delete timeouts[i]
            for(let i=0,l=at.length;i<l;i++) {
              at[i]()
            }
          }
          position[2] --
          if(position[2] < 0) {
            controller.press('KeyL')
          }
          if(hasJoined) {
            reconnectCount = 0; // Reset reconnect counter on successful join
            if(ca.onJoin) {
              ca.onJoin()
            }
            hasJoined = false
            inGame = true
            upgrade = true
            let keys = []
            if(firstJoin) {
              firstJoin = false
              for(let i=0,l=config.tank.length;i<l;i++) {
                keys.push(config.tank[i])
              }
            }
            controller.stats(config.stats)
            idleIndex = 0
            idleKeys = keys
            
            if (!fs.existsSync('./success_log.json')) {
                log('SUCCESSFUL CONNECTION! Saving this event sequence as the baseline.');
                fs.writeFileSync('./success_log.json', JSON.stringify(eventLog, null, 2));
            }
          }
          if(idleKeys) {
            if(idleIndex >= 0) {
              controller.press('Key' + idleKeys[idleIndex])
              idleIndex ++
              if(idleIndex >= idleKeys.length) {
                idleIndex = -1
                idleKeys = false
              }
            }
          } else if(idleIndex >= -10) {
            idleIndex --
          } else {
            idleIndex = -11
          }
          if(inGame && config.type === 'follow' && idleIndex < -10) {
            if(upgrade) {
              for(let i=0,l=config.keys.length;i<l;i++) {
                controller.press('Key' + config.keys[i])
              }
              upgrade = false
            }

            // NEW FIXED CODE
            if (socket && socket.readyState === 1 && statusRecieved && !subscribedToLeader && config.squadId) {
                log(`Subscribing to leader using Squad ID: ${config.squadId}`);
                send([10, config.squadId]);
                subscribedToLeader = true;
            }

            active --
            if(i % 175 === 174 && config.chatSpam) {
              controller.chat(config.chatSpam)
            }
            
            let dx = target[0] - position[0], dy = target[1] - position[1]
            if(active > 0) {
              let ram = config.target === 'mouse';
              
              let move_dx = dx;
              let move_dy = dy;

              if (ram) {
                  move_dx += target[2];
                  move_dy += target[3];
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

              let aimFollowsMovement = (config.aim === 'drone' && !target[4]);

              if (aimFollowsMovement) {
                  let p2 = Math.PI * 2;
                  let h = ((Math.round(move_angle * controller.iv) - 0.5) % 8 + 8) % 8 + 0.5;
                  h = controller.dv * h;
                  if (Math.abs(((h - idleAngle) % p2 + Math.PI) % p2 - Math.PI) > 0.75) {
                      idleAngle = h + 0.75 * (2 * Math.random() - 1);
                  }
                  cIdleAngle = averageAngle(cIdleAngle, idleAngle, 5) % p2;
                  let dist = 20;
                  trigger.mousemove(
                      controller.x = 250 + dist * Math.cos(cIdleAngle),
                      controller.y = 250 + dist * Math.sin(cIdleAngle)
                  );
              } else {
                let aim_dx_game = target[2];
                let aim_dy_game = target[3];
                
                // If the leader is not aiming, don't move the bot's mouse.
                if (aim_dx_game !== 0 || aim_dy_game !== 0) {
                    // Calculate the direction of the leader's aim.
                    const angle = Math.atan2(aim_dy_game, aim_dx_game);
                    // Use a fixed distance for the cursor from the center to ensure consistent aiming regardless of zoom level.
                    const dist = 100;
                    
                    trigger.mousemove(
                        controller.x = 250 + dist * Math.cos(angle),
                        controller.y = 250 + dist * Math.sin(angle)
                    );
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
              controller.moveDirection(0, 0)
              if(Math.random() < 0.01) {
                  let dist = 20;
                  let randomAngle = 2 * Math.PI * Math.random();
                  trigger.mousemove(
                      controller.x = 250 + dist * Math.cos(randomAngle),
                      controller.y = 250 + dist * Math.sin(randomAngle)
                  );
              }
              controller.mouseUp()
            }
          }
          if(died) {
            inGame = false
            log('Death detected. Clearing render cache...')
            block = true
            ignore = true
            let index = 0
            let interval = setInterval(function() {
              if(destroyed) {
                clearInterval(interval)
                return
              }
              for(let i=0;i<30;i++) {
                let r = 100 + 900 * Math.random(), q = 100 + 900 * Math.random(), p = 0.5 + Math.random()
                innerWidth = global.window.innerWidth = r
                innerHeight = global.window.innerHeight = q
                devicePixelRatio = global.window.devicePixelRatio = p
                global.performance.time += 9000
                a()
              }
              index ++
              if(index >= 30) {
                clearInterval(interval)
                end()
              }
            }, 30), end = function() {
              innerWidth = global.window.innerWidth = 500
              innerHeight = global.window.innerHeight = 500
              devicePixelRatio = global.window.devicePixelRatio = 1
              if(config.autoRespawn) {
                log('Render cache cleared, respawning...')
                controller.press('Enter')
              } else {
                log('Render cache cleared.')
              }
              block = false
              ignore = false
              global.performance.time += 9000
              a()
              if(statusRecieved) { i ++ }
            }
            died = false
            return
          }
          global.performance.time += 9000
          a()
          if(statusRecieved) {
            i ++
          }
        }
      }, 20)
      const averageAngle = function(a, b, c) {
        let d = 2 * Math.PI;
        a = ((a % d) + d) % d;
        let e = (d + b - a) % d;
        if (e > Math.PI) {
          return (((a + (e - d) / (c + 1)) % d) + d) % d;
        } else {
          return (((a + e / (c + 1)) % d) + d) % d;
        }
      }
      global.localStorage = global.window.localStorage = {
        setItem: function(i, v) {
          this[i] = v
        },
        getItem: function(i) {
          return this[i]
        }
      }

      global.fetch = global.window.fetch = new Proxy(realFetch, { apply:function(a, b, c) {
        let f = c[0];
        eventLog.push({ type: 'fetch', url: f });

        if(f.startsWith('./')) {
          f = c[0] = 'https://arras.io' + f.slice(1)
        } else if(f.startsWith('/')) {
          f = c[0] = 'https://arras.io' + f
        }

        let options = c[1] || {};
        if (proxyAgent) {
            options.agent = proxyAgent;
        }
        c[1] = options;

        if(f.includes('app.wasm')) { return wasm() }

        const fetchPromise = Reflect.apply(a, b, c);

        if (f.includes('status')) {
            fetchPromise.then(response => {
                return response.clone().json();
            }).then(i => {
                if(i.ok && i.status) {
                    statusRecieved = true;
                    status = Object.values(i.status);
                    log('Status recieved and processed.');
                } else {
                    log('Status error.');
                }
            }).catch(err => {
                log('Failed to process status JSON:', err);
            });
        }
        
        return fetchPromise;
      } })

      global.navigator = global.window.navigator = {}
      let gameSocket = false, host = false
      
      global.WebSocket = global.window.WebSocket = new Proxy(ws, { construct:function(a, b, c) {
        const fullUrl = b[0];
        eventLog.push({ type: 'websocket', url: fullUrl });
        host = new url.URL(fullUrl).host

        let h = {
          headers: {
            'user-agent': `Mozilla/5.0 (X11; CrOS x86_64 14588.123.0) AppleWebKit/${(100 + 900 * Math.random()).toFixed(2)} (KHTML, like Gecko) Chrome 101.0.0.0 Safari ${(100 + 900 * Math.random()).toFixed(2)}`,
            'accept-encoding': 'gzip, deflate, br',
            'accept-language': 'en-US,en;q=0.9',
            'cache-control': 'no-cache',
            'connection': 'Upgrade',
            'origin': 'https://arras.io',
            'pragma': 'no-cache',
            'upgrade': 'websocket',
            'Sec-WebSocket-Protocol': b[1] ? b[1].join(', ') : '',
            'host': host
          },
          followRedirects: true,
          origin: 'https://arras.io',
        }
        
        if (proxyAgent) { h.agent = proxyAgent; }
        
        const newArgs = [fullUrl, b[1], h];
        const d = Reflect.construct(a, newArgs, c)

        d.addEventListener('open', function() {
          log('WebSocket open.')
          connected = true
        })

        d.addEventListener('close', function(e) {
          if(gameSocket === d) { gameSocket = false; }
          log('WebSocket closed. wasClean =', e.wasClean, 'code =', e.code, 'reason =', e.reason)

          if (!inGame && e.code !== 1000) {
            try {
              if (fs.existsSync('./success_log.json')) {
                const successfulLog = JSON.parse(fs.readFileSync('./success_log.json'));
                // compareLogs(successfulLog, eventLog); // This function was not defined in original script
              } else {
                log('Failure occurred, but no successful log exists yet to compare against. The first bot to succeed will create one.');
              }
            } catch (err) {
              log('Error during log comparison:', err);
            }
          }
        })

        let closed = false
        d.addEventListener('message', function(e) { let u = Array.from(new Uint8Array(e.data)) })
        d.send = new Proxy(d.send, { apply:function(f, g, h) { return Reflect.apply(f, g, h) } })
        d.close = new Proxy(d.close, { apply:function(f, g, h) {
          if(closed) { return }
          log('WebSocket closed by client.')
          closed = true
          Reflect.apply(f, g, h)
        } })
        d.addEventListener = new Proxy(d.addEventListener, { apply:function(a, b, c) { return Reflect.apply(a, b, c) } })
        gameSocket = d
        return d
      } })
      eval(x)
      let ca = oa || {}
      ca.window = global.window
      ca.destroy = destroy
      ca.controller = controller
      ca.trigger = trigger
      // Return the interface so the master process can reference it
      return Object.assign(ca, internalBotInterface);
    }


    let id = 0
    let arras = {
      then: (cb) => {
          then(() => cb(arras));
      },
      create: function(o) {
        if (!ready) {
            log("Warning: 'create' called before arras was ready. It will be queued.");
        }
        o.id = o.id !== undefined ? o.id : id++;
        return run(script, o)
      }
    }
    if(options.start) {
      options.start(arras)
    }
    return arras
  })()
}