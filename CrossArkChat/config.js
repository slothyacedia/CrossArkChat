module.exports = {
  servers: [
    {
      name: "Island", // Server identifier, give each server a unique name
      ip: "192.168.0.30", // Server ip
      rconPort: 32335, // Server RCON port
      queryPort: 27015, // Server steam query port, used for server online checks
      password: "", // Server RCON password
      joinLink: "", // Server join link (optional)
      enabled: true, // Enables or disables a server
      data: {
        cluster: "Cluster1",
      },
    },
    {
      name: "Fjordur",
      ip: "192.168.0.30",
      rconPort: 32336,
      queryPort: 27016,
      password: "",
      joinLink: "",
      enabled: true,
      data: {
        cluster: "Cluster1",
      },
    },
  ],
  ark: {
    pollChatInterval: 100, // Chat polling interval in ms
    pollPlayersInterval: 100, // Player polling interval in ms
    commandTimeout: 1000, // Timeout a command after x ms
    transferGracePeriod: 60000, // Map transfer grace period, for session tracking
    chatCommand: "serverchat", // Command used to chat to the server
    essentialPlugins: ["Permissions", "ExtendedRcon"],
    // Plugins that will be loaded on first server connect
    ignoredResponses: ["Server received, But no response!!", "Deactivated", "Force respawning Wild Dinos!"],
    // Ignored responses from RCON polling
    ignoredResponsePrefixes: ["AdminCmd: ", "SERVER: ", "SpawnDino_DS"],
    // Ignored response prefixes from RCON polling
    tribeLogsRegex: /^Tribe\s+(.+?),\s+ID\s+(\d+):\s+Day\s+(\d+),\s+([\d:]+):\s+(?:<RichColor Color="([^"]+)">)?([\s\S]+?)(?:<\/>)?\)?$/,
    // Tribe logs regex, do not touch this if you do not know what you're doing
  },
  discord: {
    enabled: true, // Enables or disables the discord integration
    token: "", // Discord bot token, a alternative is to fill out the .env file
    prefix: "cac.", // Discord bot prefix for text commands
    admins: [], // Discord bot admins who will be able to execute admin related functions
    stripEmojis: true, // Strips emojis into their names only
    channels: {
      chat: "", // In game and discord chat integration happens in this channel id
      join: "", // Defaults to the chat channel
      leave: "", // Defaults to the chat channel
      tribeLogs: "", // Tribe logs get forwarded to this channel id
      leftovers: "", // Defaults to the tribe logs channel
    },
    slashCommands: {
      scope: "global", // "guild" or "global"
      guild: "", // Guild id if scope is defined as guild
    },
  },
  plugins: {
    loadOrder: ["CrossArkChat", "Database"],
    // CrossArkChat.js plugin load priority order, try to load CrosArkChat and Database plugins first
  },
  formats: {
    /*
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
      join: "{player} joined {serverName} ({text})",
      leave: "{player} left {serverName} ({text})",
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
      chat: "[{serverName}] {player}: {text}",
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
    rconStatus: false,
    discordStatus: true,
    startup: true,
    plugins: false,
  },
}
