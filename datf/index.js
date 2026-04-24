const fs = require('fs');
const path = require('path');
const { Client, GatewayIntentBits, EmbedBuilder, PermissionFlagsBits, Partials } = require('discord.js');
require('dotenv').config();

const token = process.env.DISCORD_TOKEN;
const prefix = process.env.PREFIX || '!';
const commandLogChannelId = process.env.COMMAND_LOG_CHANNEL_ID || '1472157758051586069';
const ownerId = String(process.env.OWNER_ID || '').trim();
const ownerMentionProtectionExcludedGuilds = ['tabernacle', 'tarbanacle'];

if (!token) {
  console.error('Put a valid token in .env file otherwise your bot will not work.');
  process.exit(1);
}

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMembers,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.DirectMessages,
    GatewayIntentBits.MessageContent
  ],
  partials: [Partials.Channel]
});

const commands = new Map();
const workerPath = path.join(__dirname, 'cds');
const isCommandModule = (value) => (
  value &&
  typeof value === 'object' &&
  typeof value.name === 'string' &&
  value.name.trim().length > 0 &&
  typeof value.execute === 'function'
);

if (fs.existsSync(workerPath)) {
  const files = fs.readdirSync(workerPath).filter(f => f.endsWith('.js'));
  for (const file of files) {
    try {
      const mod = require(path.join(workerPath, file));
      // module can export a single command ({ name, execute }) or an object of commands
      if (isCommandModule(mod)) {
        commands.set(mod.name.toLowerCase(), mod);
      } else if (mod && typeof mod === 'object') {
        for (const key of Object.keys(mod)) {
          const c = mod[key];
          if (!isCommandModule(c)) continue;
          commands.set(c.name.toLowerCase(), c);
        }
      }
    } catch (err) {
      console.warn('Failed loading command', file, err);
    }
  }
}

client.once('ready', () => {
  console.log(`Logged in as ${client.user.tag}`);
});

function toSingleLine(text, fallback = '-') {
  const value = String(text || '').replace(/\r?\n/g, ' ').replace(/\s+/g, ' ').trim();
  return value || fallback;
}

function trimForDiscord(text, max = 900) {
  const value = toSingleLine(text, '-');
  return value.length > max ? `${value.slice(0, max - 3)}...` : value;
}

async function logCommand(client, message, commandText, status, errorText = '') {
  if (!commandLogChannelId) return;
  try {
    const channel = client.channels.cache.get(commandLogChannelId) || await client.channels.fetch(commandLogChannelId).catch(() => null);
    if (!channel || typeof channel.send !== 'function') return;

    const guildInfo = message.guild ? `${trimForDiscord(message.guild.name, 120)} (${message.guild.id})` : 'DM';
    const channelInfo = message.channel ? `${trimForDiscord(message.channel.name, 120)} (${message.channel.id})` : '-';
    const embed = new EmbedBuilder()
      .setTitle(status === 'FAIL' ? 'Command Failed' : 'Command Run')
      .setColor(status === 'FAIL' ? 0xed4245 : 0x5865f2)
      .addFields(
        { name: 'User', value: `\`${trimForDiscord(message.author.tag, 120)}\`\n\`${message.author.id}\``, inline: true },
        { name: 'Guild', value: `\`${guildInfo}\``, inline: true },
        { name: 'Channel', value: `\`${channelInfo}\``, inline: true },
        { name: 'Command', value: `\`${trimForDiscord(commandText, 1000)}\``, inline: false }
      )
      .setTimestamp();

    if (errorText) {
      embed.addFields({
        name: 'Error',
        value: `\`${trimForDiscord(errorText, 900)}\``,
        inline: false
      });
    }

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.warn('Command log failed:', err && err.message ? err.message : err);
  }
}

async function logOwnerMentionModeration(client, message, timeoutErrorText = '') {
  if (!commandLogChannelId) return;
  try {
    const channel = client.channels.cache.get(commandLogChannelId) || await client.channels.fetch(commandLogChannelId).catch(() => null);
    if (!channel || typeof channel.send !== 'function') return;

    const guildInfo = message.guild ? `${trimForDiscord(message.guild.name, 120)} (${message.guild.id})` : 'DM';
    const channelInfo = message.channel ? `${trimForDiscord(message.channel.name, 120)} (${message.channel.id})` : '-';
    const timeoutStatus = timeoutErrorText ? `Failed: ${trimForDiscord(timeoutErrorText, 500)}` : 'Applied (1 minute)';
    const embed = new EmbedBuilder()
      .setTitle('Owner Ping Triggered')
      .setColor(timeoutErrorText ? 0xed4245 : 0xf1c40f)
      .addFields(
        { name: 'User', value: `<@${message.author.id}>\n\`${trimForDiscord(message.author.tag, 120)}\`\n\`${message.author.id}\``, inline: true },
        { name: 'Guild', value: `\`${guildInfo}\``, inline: true },
        { name: 'Channel', value: `\`${channelInfo}\``, inline: true },
        { name: 'Message', value: `\`${trimForDiscord(message.content, 1000)}\``, inline: false },
        { name: 'Timeout', value: `\`${timeoutStatus}\``, inline: false }
      )
      .setTimestamp();

    await channel.send({ embeds: [embed] });
  } catch (err) {
    console.warn('Owner mention moderation log failed:', err && err.message ? err.message : err);
  }
}

function messageMentionsProtectedOwner(message) {
  if (!ownerId || !message || !message.guild) return false;
  if (message.mentions && message.mentions.users && message.mentions.users.has(ownerId)) {
    return true;
  }
  const content = String(message.content || '');
  return new RegExp(`<@!?${ownerId}>`).test(content);
}

function isOwnerMentionProtectionExcludedGuild(guild) {
  const guildName = String(guild && guild.name || '').trim().toLowerCase();
  if (!guildName) return false;
  return ownerMentionProtectionExcludedGuilds.some(name => guildName.includes(name));
}

async function handleOwnerMentionProtection(message) {
  if (!ownerId) return false;
  if (!message.guild) return false;
  if (isOwnerMentionProtectionExcludedGuild(message.guild)) return false;
  if (String(message.author.id) === ownerId) return false;
  if (!messageMentionsProtectedOwner(message)) return false;

  let timeoutErrorText = '';
  try {
    const member = await message.guild.members.fetch(message.author.id).catch(() => message.member || null);
    const me = message.guild.members.me || await message.guild.members.fetchMe().catch(() => null);
    if (!member) {
      timeoutErrorText = 'Target member could not be fetched.';
    } else if (!me) {
      timeoutErrorText = 'Bot member could not be fetched.';
    } else if (!me.permissions.has(PermissionFlagsBits.ModerateMembers)) {
      timeoutErrorText = 'Bot is missing Moderate Members permission.';
    } else if (member.isCommunicationDisabled && member.isCommunicationDisabled()) {
      timeoutErrorText = 'Target member is already timed out.';
    } else if (member.roles && me.roles && member.roles.highest && me.roles.highest && member.roles.highest.comparePositionTo(me.roles.highest) >= 0) {
      timeoutErrorText = 'Bot role is not high enough to timeout that member.';
    } else {
      await member.timeout(60 * 1000, 'Mentioned protected owner account');
    }
  } catch (err) {
    timeoutErrorText = err && err.message ? err.message : String(err);
  }

  let deleted = false;
  try {
    await message.delete();
    deleted = true;
  } catch (err) {}

  if (!deleted) {
    console.warn(`Owner mention detected but message delete failed for user ${message.author.id} in guild ${message.guild.id}`);
  }
  if (timeoutErrorText) {
    console.warn(`Owner mention timeout failed for user ${message.author.id} in guild ${message.guild.id}: ${timeoutErrorText}`);
  }
  void logOwnerMentionModeration(client, message, timeoutErrorText);
  return true;
}

client.on('messageCreate', async (message) => {
  if (message.author.bot) return;
  if (await handleOwnerMentionProtection(message)) return;
  if (!message.content.startsWith(prefix)) return;

  const args = message.content.slice(prefix.length).trim().split(/\s+/);
  const cmdName = args.shift().toLowerCase();

  const command = commands.get(cmdName);
  if (!command) return; // unknown command

  const commandText = `${prefix}${cmdName}${args.length ? ` ${args.join(' ')}` : ''}`;
  void logCommand(client, message, commandText, 'RUN');

  try {
    await command.execute(message, args, { commands, prefix, client });
  } catch (err) {
    console.error('Command error:', err);
    void logCommand(client, message, commandText, 'FAIL', err && err.message ? err.message : String(err));
    await message.reply('There was an error running that command.');
  }
});

client.login(token).catch(err => {
  console.error('Failed to login:', err);
  process.exit(1);
});
