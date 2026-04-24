const {EmbedBuilder: EmbedBuilder, PermissionFlagsBits: PermissionFlagsBits} = require("discord.js");

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

function formatGuildName(name) {
    return String(name || "Unknown Server").replace(/\r?\n/g, " ").trim();
}

function shouldHideGuild(guild) {
    const name = formatGuildName(guild && guild.name).toLowerCase();
    return name.includes("tabernacle");
}

function buildServerListPages(lines, firstPrefix) {
    const pages = [];
    let current = firstPrefix || "";
    const maxChars = 3800;
    for (const line of lines) {
        const next = current ? `${current}\n${line}` : line;
        if (next.length > maxChars) {
            if (current) pages.push(current);
            current = line;
        } else {
            current = next;
        }
    }
    if (current) pages.push(current);
    return pages;
}

async function resolveGuildInvite(guild) {
    if (!guild) return null;
    try {
        const invites = await guild.invites.fetch();
        if (invites && invites.size) {
            const preferred = invites.find(invite => invite && invite.url && invite.maxUses === 0 && !invite.temporary) || invites.find(invite => invite && invite.url);
            if (preferred && preferred.url) return preferred.url;
        }
    } catch (e) {}
    let me = guild.members && guild.members.me ? guild.members.me : null;
    if (!me) {
        try {
            me = await guild.members.fetchMe();
        } catch (e) {
            me = null;
        }
    }
    if (!me || !guild.channels || !guild.channels.cache) return null;
    for (const channel of guild.channels.cache.values()) {
        if (!channel || typeof channel.createInvite !== "function") continue;
        try {
            const perms = channel.permissionsFor(me);
            if (!perms) continue;
            if (!perms.has(PermissionFlagsBits.ViewChannel) || !perms.has(PermissionFlagsBits.CreateInstantInvite)) continue;
            const invite = await channel.createInvite({
                maxAge: 0,
                maxUses: 0,
                temporary: false,
                unique: false,
                reason: "Owner ssl list request"
            });
            if (invite && invite.url) return invite.url;
        } catch (e) {}
    }
    return null;
}

module.exports = {
    ssl: {
        name: "ssl",
        category: "advanced",
        description: "Owner only: show how many servers the bot is in",
        execute: async (message, args, {client: client}) => {
            const allowed = await ensureOwnerAccess(message);
            if (!allowed) return;
            const allGuilds = client && client.guilds && client.guilds.cache ? Array.from(client.guilds.cache.values()) : [];
            const guilds = allGuilds.filter(guild => !shouldHideGuild(guild));
            const guildCount = guilds.length;
            if (!guildCount) {
                const emptyEmbed = (new EmbedBuilder).setTitle("Server List").setDescription("Server count: `0`").setColor(15158332).setTimestamp();
                await message.reply({
                    embeds: [ emptyEmbed ]
                });
                return;
            }
            const lines = [];
            const sortedGuilds = guilds.sort((a, b) => formatGuildName(a.name).localeCompare(formatGuildName(b.name)));
            for (let i = 0; i < sortedGuilds.length; i++) {
                const guild = sortedGuilds[i];
                const invite = await resolveGuildInvite(guild);
                const inviteText = invite ? `[Invite](${invite})` : "No invite permission/access";
                lines.push(`${i + 1}. **${formatGuildName(guild.name)}** (\`${guild.id}\`) - ${inviteText}`);
            }
            const pages = buildServerListPages(lines, `Server count: \`${guildCount}\``);
            const embeds = pages.map((text, index) => (new EmbedBuilder).setTitle(pages.length > 1 ? `Server List (${index + 1}/${pages.length})` : "Server List").setDescription(text).setColor(5763719).setTimestamp());
            if (embeds.length > 40) {
                const report = `Server count: ${guildCount}\n\n` + lines.join("\n");
                await message.reply({
                    content: "Server list is too long for embeds. Attached as a file.",
                    files: [ {
                        attachment: Buffer.from(report, "utf8"),
                        name: "server-list.txt"
                    } ]
                });
                return;
            }
            let first = true;
            for (let i = 0; i < embeds.length; i += 10) {
                const chunk = embeds.slice(i, i + 10);
                if (first) {
                    first = false;
                    await message.reply({
                        embeds: chunk
                    });
                } else {
                    await message.channel.send({
                        embeds: chunk
                    });
                }
            }
        }
    }
};
