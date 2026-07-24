module.exports = {
  servers: [
    {
      name: "Island",
      ip: "192.168.0.30",
      rconPort: 32335,
      queryPort: 27015,
      password: "",
      joinLink: "",
      enabled: true,
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
    pollChatInterval: 100,
    pollPlayersInterval: 100,
    commandTimeout: 1000,
    transferGracePeriod: 60000,
    chatCommand: "serverchat",
    essentialPlugins: ["Permissions", "ExtendedRcon"],
    ignoredResponses: ["Server received, But no response!!", "Deactivated", "Force respawning Wild Dinos!"],
    ignoredResponsePrefixes: ["AdminCmd: ", "SERVER: ", "SpawnDino_DS"],
    tribeLogsRegex: /^Tribe\s+(.+?),\s+ID\s+(\d+):\s+Day\s+(\d+),\s+([\d:]+):\s+(?:<RichColor Color="([^"]+)">)?([\s\S]+?)(?:<\/>)?\)?$/,
  },
  discord: {
    enabled: true,
    token: "",
    prefix: "cac.",
    admins: [],
    stripEmojis: true,
    channels: {
      chat: "",
      join: "",
      leave: "",
      tribeLogs: "",
      leftovers: "",
    },
    slashCommands: {
      scope: "global",
      guild: "",
    },
  },
  plugins: {
    loadOrder: ["CrossArkChat", "Database"],
  },
  formats: {
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
    toConsole: [
      {
        from: /😊/g,
        to: ":)",
      },
      {
        from: /😉/g,
        to: ";)",
      },
      {
        from: /😄/g,
        to: ":D",
      },
      {
        from: /(☹️|🙁)/g,
        to: ":(",
      },
      {
        from: /😈/g,
        to: ">:)",
      },
      {
        from: /😐/g,
        to: ":|",
      },
      {
        from: /😮/g,
        to: ":o",
      },
      {
        from: /😛/g,
        to: ":p",
      },
    ],
    toDiscord: [
      {
        from: /(?<=^|\s):\)(?=\s|$)/g,
        to: "😊",
      },
      {
        from: /(?<=^|\s);\)(?=\s|$)/g,
        to: "😉",
      },
      {
        from: /(?<=^|\s):D(?=\s|$)/gi,
        to: "😄",
      },
      {
        from: /(?<=^|\s):\((?=\s|$)/g,
        to: "🙁",
      },
      {
        from: /(?<=^|\s)>(?::\))(?=\s|$)/g,
        to: "😈",
      },
      {
        from: /(?<=^|\s):\|(?=\s|$)/g,
        to: "😐",
      },
      {
        from: /(?<=^|\s):o(?=\s|$)/gi,
        to: "😮",
      },
      {
        from: /(?<=^|\s):P(?=\s|$)/gi,
        to: "😛",
      },
      {
        from: /(?<=^|\s)T(\.|-)T(?=\s|$)/g,
        to: "😭",
      },
    ],
    toServers: [
      {
        from: /😊/g,
        to: ":)",
      },
      {
        from: /😉/g,
        to: ";)",
      },
      {
        from: /😄/g,
        to: ":D",
      },
      {
        from: /(☹️|🙁)/g,
        to: ":(",
      },
      {
        from: /😈/g,
        to: ">:)",
      },
      {
        from: /😐/g,
        to: ":|",
      },
      {
        from: /😮/g,
        to: ":o",
      },
      {
        from: /😛/g,
        to: ":p",
      },
    ],
  },
  broadcast: {
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
    rconStatus: false,
    discordStatus: true,
    startup: true,
    plugins: true,
  },
}
