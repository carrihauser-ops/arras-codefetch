const { EmbedBuilder: EmbedBuilder } = require("discord.js");

module.exports = {
    say: {
        name: "say",
        category: "basic",
        description: "Send text to a channel by ID (owner only)",
        execute: async (message, args) => {
            const ownerId = process.env.OWNER_ID;
            if (!ownerId) {
                await message.reply("Owner ID not set in environment.");
                return;
            }
            if (message.author.id !== ownerId) {
                await message.reply("You are not allowed to use this command.");
                return;
            }
            const channelToken = String(args.shift() || "").trim();
            const channelIdMatch = channelToken.match(/^<?#?(\d{16,22})>?$/);
            if (!channelIdMatch) {
                await message.reply("Usage: `?say <channel_id> <message>`");
                return;
            }
            const channelId = channelIdMatch[1];
            const text = args.join(" ").trim();
            if (!text) {
                await message.reply("Please provide a message to send.");
                return;
            }
            let targetChannel = null;
            try {
                targetChannel = message.client.channels.cache.get(channelId) || await message.client.channels.fetch(channelId);
            } catch (err) {
                targetChannel = null;
            }
            if (!targetChannel || typeof targetChannel.send !== "function") {
                await message.reply("Invalid channel ID or the bot cannot access that channel.");
                return;
            }
            try {
                await message.delete();
            } catch (err) {}
            await targetChannel.send(text);
        }
    },
    ping: {
        name: "ping",
        category: "basic",
        description: "Show bot latency",
        execute: async (message) => {
            const latency = Date.now() - message.createdTimestamp;
            await message.reply(`Pong! \`${latency}ms\``);
        }
    },
    help: {
        name: "help",
        category: "basic",
        description: "List all available commands",
        execute: async (message, args, { commands: commands, prefix: prefix }) => {
            const embed = (new EmbedBuilder)
                .setTitle("Available Commands")
                .setColor(1752220)
                .setDescription("Here are the commands you can use:")
                .setTimestamp()
                .setFooter({
                    text: "Type commands with the configured prefix"
                });
            try {
                const botUser = message.client.user;
                if (botUser) {
                    embed.setAuthor({
                        name: botUser.tag,
                        iconURL: botUser.displayAvatarURL()
                    });
                }
            } catch (err) {}
            const groups = {};
            for (const [name, cmd] of commands) {
                if (!cmd || typeof cmd.execute !== "function") continue;
                const cat = cmd.category || "basic";
                if (cat === "hidden") continue;
                groups[cat] = groups[cat] || [];
                groups[cat].push({
                    name: name,
                    desc: cmd.description || "No description"
                });
            }
            if (groups.basic && groups.basic.length) {
                const value = groups.basic
                    .map(c => `**${prefix}${c.name}** - ${c.desc}`)
                    .join("\n");
                embed.addFields({
                    name: "Basic",
                    value: value,
                    inline: false
                });
            }
            const advancedEntry = groups.advanced && groups.advanced.find(c => c.name === "advanced");
            embed.addFields({
                name: "Advanced",
                value: advancedEntry
                    ? `**${prefix}${advancedEntry.name}** - ${advancedEntry.desc}`
                    : `**${prefix}advanced** - Show advanced commands`,
                inline: false
            });
            await message.reply({
                embeds: [embed]
            });
        }
    }
};
