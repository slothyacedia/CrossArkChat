const path = require("node:path")
const fs = require("node:fs")

let onPacket = null
let poller = null

module.exports = {
  name: "Live Player List",
  version: "v1.0.0",

  async teardown(cacApi) {
    if (onPacket) cacApi.events.off("packet", onPacket)
    if (poller) clearTimeout(poller)
  },

  async setup(cacApi) {
    const djs = cacApi.utils.modules.djs
    const { EmbedBuilder } = djs
    const pluginDir = __dirname
    const configPath = path.join(pluginDir, "config.json")

    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(
        configPath,
        JSON.stringify(
          {
            channel: "",
            watchlist: {
              names: [],
              steamIds: [],
            },
          },
          null,
          2,
        ),
      )
    }

    function loadPluginConfig() {
      delete require.cache[require.resolve(configPath)]
      return JSON.parse(fs.readFileSync(configPath, "utf8"))
    }

    let getPlayerList = () => {
      let cache = cacApi.cache.get()
      let config = cacApi.config.get()
      let players = {}
      let servers = Object.entries(cache).filter(([name, server]) => {
        let configMatch = config.servers.find((s) => s.name == name)

        return configMatch?.enabled
      })

      servers.forEach(([name, server]) => {
        players[name] = server.players.map((player) => {
          if (player.data?.ign) {
            return `${player.data.ign} (${player.name}) [${player.data.tribeName}]: \`${player.steamId}\``
          } else {
            return `${player.name}: \`${player.steamId}\``
          }
        })
      })
      return players
    }

    let createEmbed = (players) => {
      let embed = new EmbedBuilder().setTitle("Live Player List").setTimestamp(new Date())
      for (let server in players) {
        embed.addFields({ name: server, value: players[server].join("\n") || "No players online" })
      }

      return embed
    }

    let pluginConfig = loadPluginConfig()

    if (!pluginConfig.channel) {
      console.warn(`[${this.name}] No channel configured. Please set the channel ID in config.json.`)
      return
    }

    let client = cacApi.discord.getClient()
    let channel = client.channels.cache.get(pluginConfig.channel) || (await client.channels.fetch(pluginConfig.channel))
    if (!channel) {
      console.warn(`[${this.name}] Channel with ID ${pluginConfig.channel} not found.`)
      return
    }

    let messages = await channel.messages.fetch({ limit: 100 })
    await channel.bulkDelete(messages, true)
    let message = await channel.send({ embeds: [new EmbedBuilder().setTitle("Live Player List").setDescription("Loading...")] })

    let onStart = async () => {
      let players = getPlayerList()
      let embed = createEmbed(players)
      await message.edit({ embeds: [embed] })
    }

    await onStart()

    let getDelay = () => {
      let now = new Date()
      let ms = 60000 - (now.getSeconds() * 1000 + now.getMilliseconds())
      return ms
    }

    poller = setTimeout(async () => {
      let players = getPlayerList()
      let embed = createEmbed(players)
      await message.edit({ embeds: [embed] })
    }, getDelay())

    onPacket = async function (packet) {
      if (["join", "leave"].includes(packet.type)) {
        setTimeout(async () => {
          let players = getPlayerList()
          let embed = createEmbed(players)
          await message.edit({ embeds: [embed] })
        }, 1000)
      }
    }

    cacApi.events.on("packet", onPacket)
  },
}
