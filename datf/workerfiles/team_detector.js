const { scrapeAllTeams, parseTeamUrl } = require('./l_s.js');
const https = require('https');
let detectedTeams = new Set();

function startTeamMonitoring(gameHash, botTeamUrl) {
  
  const botTeamData = parseTeamUrl(botTeamUrl);
  let botTeam = null;
  
  if (botTeamData) {
    botTeam = botTeamData.digit;
    
    
    if (process.send) {
      process.send({
        type: 'team_detected',
        digit: botTeam,
        hash: botTeamData.hash
      });
    }
  }

  
  const monitorInterval = setInterval(async () => {
    try {
      const teams = await scrapeAllTeams(gameHash);
      
      if (teams) {
        for (const [digit, hash] of Object.entries(teams)) {
          const teamKey = `${digit}`;
          if (!detectedTeams.has(teamKey)) {
            detectedTeams.add(teamKey);
            
            
            if (process.send) {
              process.send({
                type: 'team_detected',
                digit: parseInt(digit),
                hash: hash
              });
            }
          }
        }
      }
    } catch (err) {
      console.error('Team monitoring error:', err);
    }
  }, 800);

  
  return monitorInterval;
}


function stopTeamMonitoring(intervalId) {
  if (intervalId) {
    clearInterval(intervalId);
  }
}

module.exports = {
  startTeamMonitoring,
  stopTeamMonitoring
};
