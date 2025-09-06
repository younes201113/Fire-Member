const dotenv = require('dotenv');
dotenv.config();

function arr(v) {
  if (!v) return [];
  return String(v).split(',').map(s => s.trim()).filter(Boolean);
}

module.exports = {
  bot: {
    token: process.env.DISCORD_TOKEN,
    clientId: process.env.CLIENT_ID,
    clientSecret: process.env.CLIENT_SECRET,
    guildId: process.env.GUILD_ID,
    verifiedRoleId: process.env.VERIFIED_ROLE_ID,
    ownerIds: arr(process.env.OWNER_IDS),
    categoryId: process.env.CATEGORY_ID
  },
  web: {
    port: Number(process.env.WEBSITE_PORT || 3000),
    baseUrl: process.env.WEBSITE_BASE_URL || 'http://localhost:3000'
  }
};
