// logRefreshListener.js
const fs = require('fs');
const path = require('node:path');

const CONFIG_PATH = path.resolve('./data/strikerconfig.json');
function loadConfig() {
  if (!fs.existsSync(CONFIG_PATH)) return {};
  try { return JSON.parse(fs.readFileSync(CONFIG_PATH, 'utf8')); }
  catch { return {}; }
}
function getGuildLogChannelId(gid) {
  const cfg = loadConfig();
  return (
    cfg[gid]?.strikeLogChannelId ||
    process.env.STRIKE_LOG_CHANNEL_ID ||
    process.env.INFRACTION_LOG_CHANNEL_ID ||
    null
  );
}

// Simple per-channel debounce (1.5s) so multiple sends cause one refresh
const timers = new Map();
function schedule(channel, fn, wait = 1500) {
  clearTimeout(timers.get(channel.id));
  timers.set(channel.id, setTimeout(() => {
    timers.delete(channel.id);
    fn().catch(() => {});
  }, wait));
}

module.exports = function attachLogRefreshListener(client) {
  client.on('messageCreate', (msg) => {
    // only react to this bot's own messages in the configured log channel
    if (!msg.guild || msg.author.id !== client.user.id) return;
    const logId = getGuildLogChannelId(msg.guildId);
    if (!logId || msg.channelId !== logId) return;

    schedule(msg.channel, async () => {
      const { postOrRefreshLauncher } = require('./commands/striker/launcher.js');
      await postOrRefreshLauncher(msg.channel);
    });
  });
};
