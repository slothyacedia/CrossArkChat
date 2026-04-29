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
    pollInterval: 100,
    essentialPlugins: ["Permissions", "PlayerUtilities", "DinoUtilities", "ExtendedRcon", "UnicodeRcon", "RewardsEvolved"],
  },
  discord: {
    enabled: true,
    token: "",
    prefix: "cac.",
    admins: [""],
    stripEmojis: true,
    channels: {
      chat: "",
      join: "",
      leave: "",
      tribeLogs: "",
      leftovers: "",
    },
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
    rconStatus: true,
    discordStatus: true,
    startup: true,
  },
}
