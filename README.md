# arras-codefetch
A simple repo that scrapes all the arras teamcodes in a mode.
I will no longer update, or implement stuff in this source as I have quited arras.io. 
I highly recommend you implement better stuff on this instead of just using it for getting codes of a mode.
# Instructions
- 1. Upon arriving to the folder, you may see .env file, index.js file, and bot.cmd file.
- 2. Before running bot.cmd which runs your bot on your pc locally, (i highly recommend you get a vps) go open up the .env file to setup the things like the bot token, prefix, and the owner id (for anti ping, and some commands which are restricted to owner only)
- 3. After your done setting up the .env file, make sure to put atleast 20 proxies in the proxies.txt file otherwise the bot won't work and won't scrape the team codes.
- 4. Run bot.cmd
- 5. Your bot is now fully settedup.
# Commands Usage

## Basic

[prefix]help - Shows a list of commands

[prefix]advanced - Shows a list of commands related to arras.io team codes

[prefix]say [channel id] - Bot sends a message in the designated channel by using the channel id, owner only

[prefix]ping - Shows bot's latency


## Advanced

[prefix]svstat/lb [squad id] - Scrapes leaderboard, shows when the arena will close and when did it open, shows what the server's mspt is

[prefix]ssl - Shows how many the server has invited the bot in

[prefix]st - Forcestops the scraping in the middle if a error has occured, owner only

[prefix]tf [squad id] - Scrapes the team codes of a mode

[prefix]tfcheck - Check if a proxy is alive against through arras endpoints

# Misc
Credits are especially given to me and tristam, no one else.
