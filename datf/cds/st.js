const {requestStopForScope: requestStopForScope, requestStopAllScopes: requestStopAllScopes, getActiveWorkerCount: getActiveWorkerCount, getScrapeScopeKey: getScrapeScopeKey} = require("./scrape_control");

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

module.exports = {
    st: {
        name: "st",
        category: "advanced",
        description: "Owner only: stop active tf/lb scraping workers",
        execute: async (message, args) => {
            const allowed = await ensureOwnerAccess(message);
            if (!allowed) return;
            const mode = String(args[0] || "").trim().toLowerCase();
            if (mode === "all") {
                const activeBefore = getActiveWorkerCount();
                const killed = requestStopAllScopes();
                await message.reply(`Stop signal sent for all scopes. Active workers before stop: \`${activeBefore}\`. Kill signals sent: \`${killed}\`.`);
                return;
            }
            const scopeKey = getScrapeScopeKey(message);
            const activeBefore = getActiveWorkerCount(scopeKey);
            const killed = requestStopForScope(scopeKey);
            await message.reply(`Stop signal sent for this scope. Active workers before stop: \`${activeBefore}\`. Kill signals sent: \`${killed}\`.`);
        }
    }
};
