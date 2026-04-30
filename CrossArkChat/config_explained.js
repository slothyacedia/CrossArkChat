module.exports = {
  servers: [
    {
      name: "Island", // Server identifer, give each server a unique name
      ip: "192.168.0.30", // Server ip
      rconPort: 32335, // Server rcon port, needed for chats to get passed around
      queryPort: 27015, // Server steam query port, needed for online checks
      password: "", // Server admin password
      joinLink: "", // Server join link (optional)
      enabled: true, // Enables or disables the server from being in the loop
    },
    {
      name: "Fjordur",
      ip: "192.168.0.30",
      rconPort: 32336,
      queryPort: 27016,
      password: "",
      joinLink: "",
      enabled: true,
    },
  ],
  ark: {
    pollChatInterval: 100, // Chat polling interval in ms
    pollPlayersInterval: 100, // Player polling interval in ms
    commandTimeout: 1000, // Timeout a command after x ms
    chatCommand: "serverchat", // Command used to chat
    essentialPlugins: ["Permissions", "PlayerUtilities", "DinoUtilities", "ExtendedRcon", "UnicodeRcon", "RewardsEvolved"],
    // Plugins that will be loaded on connect
    ignoredResponses: ["Server received, But no response!!", "Deactivated", "Force respawning Wild Dinos!"],
    // RCON responses that will be ignored and not processed
    ignoredResponsePrefixes: ["AdminCmd: ", "SERVER: ", "SpawnDino_DS"],
    // RCON response prefixes that will result in the response being ignored and not processed
    tribeLogsRegex: /^Tribe\s+(.+?),\s+ID\s+(\d+):\s+Day\s+(\d+),\s+([\d:]+):\s+<RichColor Color="([^"]+)">([\s\S]+?)<\/?>\)?$/,
    // Tribe log detection regex (DO NOT CHANGE IF YOU'RE UNSURE)
  },
  discord: {
    enabled: true, // Controls if discord is in the loop
    token: "", // Token for the discord bot, or fill out .env "botToken = ..."
    prefix: "cac.", // Prefix for text commands
    admins: [""], // Admin ids required for text commands
    stripEmojis: true, // Allows for stripping of custom emoji ids
    channels: {
      // Channel ids for which messages are sent to
      chat: "",
      join: "", // Defaults to the chat channel
      leave: "", // Defaults to the chat channel
      tribeLogs: "",
      leftovers: "", // Defaults to the tribe logs channel
    },
  },
  formats: {
    /*
    Allows you to do formatting of the messages that get sent across the system
    Available Placeholders:
    Server Name / Id: {name}, {serverName}, {serverId}, {map}
    Player Name: {player}, {user}
    Tribe Name: {tribeName}
    Tribe Id: {tribeId}
    Join Link: {joinLink}, {invite}
    Date Time: {dateTime}, {time}
    Chat / Text: {text}, {message}
    */
    toConsole: {
      join: "{player} joined {serverName}",
      leave: "{player} left {serverName}",
      chat: "[{serverName}] {player}: {text}",
      tribeLogs: "[{serverName}] {tribeName}({tribeId}): {text}",
      leftovers: "[{serverName}] {text}",
    },
    toDiscord: {
      join: "{player} joined {serverName}",
      leave: "{player} left {serverName}",
      chat: "[{serverName}] {player}: {text}",
    },
    toServers: {
      join: "{player} joined {serverName}",
      leave: "{player} left {serverName}",
      chat: `[{serverName}] {player}: {text}`,
    },
  },
  replacements: {
    /*
    Allows you to do text replacements of the messages that get sent across the system
    You can choose between regex if you're familiar with it, or just plain text
    */
    toConsole: [
      { from: /😊/g, to: ":)" },
      { from: /😉/g, to: ";)" },
      { from: /😄/g, to: ":D" },
      { from: /(☹️|🙁)/g, to: ":(" },
      { from: /😈/g, to: ">:)" },
      { from: /😐/g, to: ":|" },
      { from: /😮/g, to: ":o" },
      { from: /😛/g, to: ":p" },
    ],
    toDiscord: [
      { from: /(?<=^|\s):\)(?=\s|$)/g, to: "😊" },
      { from: /(?<=^|\s);\)(?=\s|$)/g, to: "😉" },
      { from: /(?<=^|\s):D(?=\s|$)/gi, to: "😄" },
      { from: /(?<=^|\s):\((?=\s|$)/g, to: "🙁" },
      { from: /(?<=^|\s)>(?::\))(?=\s|$)/g, to: "😈" },
      { from: /(?<=^|\s):\|(?=\s|$)/g, to: "😐" },
      { from: /(?<=^|\s):o(?=\s|$)/gi, to: "😮" },
      { from: /(?<=^|\s):P(?=\s|$)/gi, to: "😛" },
      { from: /(?<=^|\s)T(\.|-)T(?=\s|$)/g, to: "😭" },
    ],
    toServers: [
      { from: /😊/g, to: ":)" },
      { from: /😉/g, to: ";)" },
      { from: /😄/g, to: ":D" },
      { from: /(☹️|🙁)/g, to: ":(" },
      { from: /😈/g, to: ">:)" },
      { from: /😐/g, to: ":|" },
      { from: /😮/g, to: ":o" },
      { from: /😛/g, to: ":p" },
    ],
  },
  broadcast: {
    // Allows you to control if certain types of messages are sent across the system
    toConsole: {
      join: true,
      leave: true,
      chat: true,
      tribeLogs: true,
      leftovers: true,
    },
    toDiscord: {
      join: true,
      leave: true,
      chat: true,
      tribeLogs: true,
      leftovers: true,
    },
    toServers: {
      join: false,
      leave: false,
      chat: true,
    },
  },
  logging: {
    // Allows you to control if certain system messages are printed to the console
    rconStatus: true,
    discordStatus: true,
    startup: true,
  },
}
