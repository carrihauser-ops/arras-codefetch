const {EmbedBuilder: EmbedBuilder} = require("discord.js");

module.exports = {
    advanced: {
        name: "advanced",
        category: "advanced",
        description: "Show advanced commands",
        execute: async (message, args, {commands: commands, prefix: prefix}) => {
            const embed = (new EmbedBuilder).setTitle("Advanced Commands").setColor(10181046).setDescription("Advanced commands available on this bot:").setTimestamp();
            const adv = [];
            for (const [name, cmd] of commands) {
                if (!cmd || typeof cmd.execute !== "function") continue;
                if ((cmd.category || "") === "advanced") adv.push({
                    name: name,
                    desc: cmd.description || "No description"
                });
            }
            if (adv.length === 0) {
                embed.addFields({
                    name: "None",
                    value: "No advanced commands available.",
                    inline: false
                });
            } else {
                for (const c of adv) embed.addFields({
                    name: `${prefix}${c.name}`,
                    value: c.desc,
                    inline: false
                });
            }
            await message.reply({
                embeds: [ embed ]
            });
        }
    }
};
