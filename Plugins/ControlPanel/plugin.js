const fs = require("node:fs")
const path = require("node:path")

let interactionHandler = null
let packetHandler = null
let statusTimer = null

module.exports = {
  name: "Control Panel",
  version: "v1.0.1",

  async teardown(cacApi) {
    const client = cacApi.discord.getClient()

    if (interactionHandler) {
      client.off("interactionCreate", interactionHandler)
      interactionHandler = null
    }

    if (packetHandler) {
      cacApi.events.off("packet", packetHandler)
      packetHandler = null
    }

    if (statusTimer) {
      clearInterval(statusTimer)
      statusTimer = null
    }
  },

  async setup(cacApi) {
    const {
      ActionRowBuilder,
      ButtonBuilder,
      ButtonStyle,
      EmbedBuilder,
      ModalBuilder,
      StringSelectMenuBuilder,
      TextInputBuilder,
      TextInputStyle,
      SectionBuilder,
      MessageFlags,
      ContainerBuilder,
      UserSelectMenuBuilder,
      LabelBuilder,
    } = cacApi.utils.modules.djs
    const childProc = cacApi.utils.modules.child_process

    const pluginDir = __dirname
    const configPath = path.join(pluginDir, "config.json")
    const panelsPath = path.join(pluginDir, "panels.json")

    let cacConfig = cacApi.config.get()
    let enabledServers = cacConfig.servers.filter((server) => server.enabled)
    if (!enabledServers.every((server) => server.data?.cluster && server.data?.controlPanel)) {
      let defaultServerData = {
        data: {
          cluster: "Sinfuls RXP",
          controlPanel: {
            startScript: "",
            stopScript: "",
            restartScript: "",
            stopCommand: "doExit",
          },
        },
      }

      console.log(`[Plugin: ${this.name}] Not All Enabled Servers Are Configured As Required...`)
      console.log(`[Plugin: ${this.name}] Add ${JSON.stringify(defaultServerData, null)} To Each Server Config`)
      return
    }

    if (!fs.existsSync(configPath)) {
      fs.writeFileSync(
        configPath,
        JSON.stringify(
          {
            channel: "",
            cluster: true,
          },
          null,
          2,
        ),
      )
    }

    let loadConfig = () => {
      return JSON.parse(fs.readFileSync(configPath))
    }

    let loadPanelCache = () => {
      let defaultPanelCache = {
        createdAt: "",
        messages: {},
      }

      if (!fs.existsSync(panelsPath)) {
        return defaultPanelCache
      }

      try {
        return JSON.parse(fs.readFileSync(panelsPath))
      } catch {
        return defaultPanelCache
      }
    }

    let savePanelCache = (cache) => {
      fs.writeFileSync(panelsPath, JSON.stringify(cache, null, 2))
    }

    let isServerOnline = (serverName) => {
      let cache = cacApi.cache.get()
      const server = cache[serverName]

      if (!server) {
        return false
      }

      return server.online || false
    }

    let getServer = (serverName) => {
      return enabledServers.find((server) => server.name === serverName)
    }

    let getClusters = () => {
      return [
        ...new Set(
          enabledServers
            .map((server) => {
              return server.data.cluster
            })
            .filter(Boolean),
        ),
      ]
    }

    let getClusterServers = (clusterName) =>
      enabledServers.filter((server) => {
        return server.data.cluster === clusterName
      })

    let getFormattedPlayerList = (serverName) => {
      let cache = cacApi.cache.get()
      let server = cache[serverName]
      let result

      if (server.players.length > 0) {
        result = server.players
          .map((player) => {
            if (player.data?.ign) {
              return `${player.data.ign} (${player.name}) [${player.data.tribeName}]: \`${player.steamId}\``
            }
            return `${player.name}: \`${player.steamId}\``
          })
          .join("\n")
      } else {
        result = `No Players Online`
      }
      return result
    }

    let getClusterPlayers = (clusterName) => {
      let cache = cacApi.cache.get()
      let players = []
      Object.entries(cache).forEach(([name, serverCache]) => {
        if (serverCache.cluster == clusterName) {
          players.push(
            ...serverCache.players.map((player) => {
              return {
                server: name,
                ...player,
              }
            }),
          )
        }
      })

      return players
    }

    let getServerPlayers = (serverName) => {
      let cache = cacApi.cache.get()
      return (
        cache[serverName]?.players.map((player) => {
          return {
            server: serverName,
            ...player,
          }
        }) || []
      )
    }

    let createServerEmbed = (serverName) => {
      let cache = cacApi.cache.get()
      let server = enabledServers.find((enabledServer) => enabledServer.name == serverName)
      let isOnline = isServerOnline(serverName)
      let updateTimestampFormatted = `<t:${Math.floor(Date.now() / 1000)}>`

      let players = cache[serverName].players
      const container = new ContainerBuilder()
        .addTextDisplayComponents((textDisplay) =>
          textDisplay.setContent(`## ${isOnline ? "🟢" : "🔴"} ${server.data.cluster} - ${server.name}\n-# Updated: ${updateTimestampFormatted}`),
        )
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((textDisplay) => textDisplay.setContent(isOnline ? getFormattedPlayerList(serverName) : "The server is currently offline."))
        .addSeparatorComponents((separator) => separator)
        .addActionRowComponents((row) =>
          row.setComponents(
            new ButtonBuilder().setCustomId(`controlPanel;rcon;server;${server.name}`).setLabel("Send Command").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;kick;server;${server.name}`).setLabel("Kick Player").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`controlPanel;ban;server;${server.name}`).setLabel("Ban Player").setStyle(ButtonStyle.Danger),
          ),
        )
        .addActionRowComponents((row) =>
          row.setComponents(
            new ButtonBuilder().setCustomId(`controlPanel;start;server;${server.name}`).setLabel("Start").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;stop;server;${server.name}`).setLabel("Stop").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;restart;server;${server.name}`).setLabel("Restart").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;commandStop;server;${server.name}`).setLabel("Send Stop Command").setStyle(ButtonStyle.Secondary),
          ),
        )

      return container
    }

    let createClusterEmbed = (clusterName) => {
      let cache = cacApi.cache.get()
      let totalPlayers = getClusterPlayers(clusterName).length
      let updateTimestampFormatted = `<t:${Math.floor(Date.now() / 1000)}>`

      const container = new ContainerBuilder()
        .addTextDisplayComponents((textDisplay) => textDisplay.setContent(`## ${clusterName} - Central Panel\n-# Updated: ${updateTimestampFormatted}`))
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((textDisplay) => textDisplay.setContent(`Total Players: **${totalPlayers}**`))
        .addSeparatorComponents((separator) => separator)
        .addActionRowComponents((row) =>
          row.setComponents(
            new ButtonBuilder().setCustomId(`controlPanel;rcon;cluster;${clusterName}`).setLabel("Send Command").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;kick;cluster;${clusterName}`).setLabel("Kick Player").setStyle(ButtonStyle.Danger),
            new ButtonBuilder().setCustomId(`controlPanel;ban;cluster;${clusterName}`).setLabel("Ban Player").setStyle(ButtonStyle.Danger),
          ),
        )
        .addActionRowComponents((row) =>
          row.setComponents(
            new ButtonBuilder().setCustomId(`controlPanel;start;cluster;${clusterName}`).setLabel("Start").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;stop;cluster;${clusterName}`).setLabel("Stop").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;restart;cluster;${clusterName}`).setLabel("Restart").setStyle(ButtonStyle.Secondary),
            new ButtonBuilder().setCustomId(`controlPanel;commandStop;cluster;${clusterName}`).setLabel("Send Stop Command").setStyle(ButtonStyle.Secondary),
          ),
        )

      return container
    }

    let createRconModal = (scope, target) => {
      const modal = new ModalBuilder()
        .setCustomId(`controlPanel;rconModal;${scope};${target}`)
        .setTitle("Send RCON Command")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("command").setLabel("RCON Command").setPlaceholder("saveworld").setStyle(TextInputStyle.Short).setRequired(true),
          ),
        )

      return modal
    }

    let createPlayerActionModal = (action, scope, target) => {
      let players = scope === "cluster" ? getClusterPlayers(target) : getServerPlayers(target)

      const modal = new ModalBuilder()
        .setCustomId(`controlPanel;playerAction;${action};${scope};${target}`)
        .setTitle(`${action === "kick" ? "Kick" : "Ban"} Player`)

      if (players.length) {
        modal.addLabelComponents(
          new LabelBuilder().setLabel("Player").setStringSelectMenuComponent(
            new StringSelectMenuBuilder()
              .setCustomId("player")
              .setPlaceholder("Select a player")
              .addOptions(
                players.slice(0, 25).map((player) => {
                  let label = ""
                  let value = String(player.steamId)
                  if (player.data?.ign) {
                    label = `${player.data.ign} (${player.name}) [${player.data.tribeName}]: ${player.steamId}`
                  } else {
                    label = `${player.name}: ${player.steamId}`
                  }

                  if (scope == "cluster") {
                    label = `${player.server} - ${label}`
                  }
                  label = label.slice(0, 100)

                  return { label, value }
                }),
              ),
          ),
        )
      } else {
        modal.addLabelComponents(
          new LabelBuilder()
            .setLabel("Steam ID")
            .setTextInputComponent(
              new TextInputBuilder().setCustomId("player").setPlaceholder("Enter the player's Steam ID").setStyle(TextInputStyle.Short).setRequired(true),
            ),
        )
      }

      return modal
    }

    let sendRcon = async (serverName, command) => {
      try {
        let response = await cacApi.ark.server.sendCommand(serverName, command)
        return { success: true, response }
      } catch (error) {
        return { success: false, error }
      }
    }

    let sendClusterRcon = async (clusterName, command) => {
      let results = []

      for (const server of getClusterServers(clusterName)) {
        results.push({
          server: server.name,
          ...(await sendRcon(server.name, command)),
        })
      }

      return results
    }

    let runScript = (command) => {
      return new Promise((resolve, reject) => {
        childProc.exec(command, (error, stdout, stderr) => {
          if (error) {
            reject(error)
            return
          }
          resolve({ stdout, stderr })
        })
      })
    }

    async function refreshPanels(panelMessages) {
      for (const [key, message] of Object.entries(panelMessages)) {
        try {
          const container = key.startsWith("cluster:") ? createClusterEmbed(key.replace("cluster:", "")) : createServerEmbed(key)

          await message.edit({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
          })
        } catch {}
      }
    }

    let pluginConfig = loadConfig()
    if (!pluginConfig.channel) {
      if (cacConfig.logging.plugins) {
        console.log(`[${this.name}] No Control Panel Channel Configured`)
        return
      }
    }

    const client = cacApi.discord.getClient()
    const controlPanelChannel = client.channels.cache.get(pluginConfig.channel) || (await client.channels.fetch(pluginConfig.channel))

    if (!controlPanelChannel) {
      if (cacConfig.logging.plugins) {
        console.log(`[${this.name}] Channel With Id ${pluginConfig.channel} Not Found`)
        return
      }
    }

    let panelCache = loadPanelCache()
    let panelMessages = {}

    let initPanels = async () => {
      let todayString = new Date().toLocaleDateString()
      let createdAtString = new Date(panelCache.createdAt).toLocaleDateString()

      if (createdAtString !== todayString) {
        for (const messageId of Object.values(panelCache.messages || {})) {
          try {
            const message = await controlPanelChannel.messages.fetch(messageId)
            await message.delete()
          } catch {}
        }

        panelCache = {
          createdAt: Date.now(),
          messages: {},
        }
      }

      for (const server of enabledServers) {
        let message = null
        const messageId = panelCache.messages[server.name]

        if (messageId) {
          try {
            message = await controlPanelChannel.messages.fetch(messageId)
          } catch {
            message = null
          }
        }

        if (!message) {
          message = await controlPanelChannel.send({
            components: [createServerEmbed(server.name)],
            flags: MessageFlags.IsComponentsV2,
          })

          panelCache.messages[server.name] = message.id
        }

        panelMessages[server.name] = message
      }

      if (pluginConfig.cluster) {
        for (let clusterName of getClusters()) {
          let clusterKey = `cluster:${clusterName}`
          let message = null
          const messageId = panelCache.messages[clusterKey]

          if (messageId) {
            try {
              message = await controlPanelChannel.messages.fetch(messageId)
            } catch {
              message = null
            }
          }

          if (!message) {
            message = await controlPanelChannel.send({
              components: [createClusterEmbed(clusterName)],
              flags: MessageFlags.IsComponentsV2,
            })

            panelCache.messages[clusterKey] = message.id
          }

          panelMessages[clusterKey] = message
        }
      }

      panelCache.createdAt = Date.now()
      savePanelCache(panelCache)

      await refreshPanels(panelMessages)
      if (cacConfig.logging.plugins) {
        console.log(`[${this.name}] Panels Ready`)
      }
    }

    interactionHandler = async (interaction) => {
      if (!interaction.customId || !interaction.customId.startsWith("controlPanel;")) {
        return
      }

      let idParts = interaction.customId.split(";")

      if (interaction.isButton()) {
        let [interactionCoreId, action, scope, target] = idParts
        let actionFormatted = String(action).charAt(0).toUpperCase() + action.slice(1).toLowerCase()

        switch (action) {
          case "rcon": {
            await interaction.showModal(createRconModal(scope, target))
            return
          }

          case "kick": {
            await interaction.showModal(createPlayerActionModal(action, scope, target))
            return
          }

          case "ban": {
            await interaction.showModal(createPlayerActionModal(action, scope, target))
            return
          }

          case "start":
          case "stop":
          case "restart": {
            await interaction.deferReply({ ephemeral: true })
            let servers =
              scope == "cluster"
                ? getClusterServers(target).map((server) => {
                    server.name
                  })
                : [target]

            let results = []

            for (let serverName of servers) {
              try {
                let scriptKey = `${action}Script`
                let execCommand = enabledServers.find((server) => server.name == serverName)?.data?.controlPanel?.[scriptKey]

                if (!execCommand) {
                  throw new Error(`No ${scriptKey} Configured For ${serverName}`)
                }

                await runScript(execCommand)
                results.push(`✅ **${serverName}** ${actionFormatted} Success`)
              } catch (error) {
                results.push(`❎ **${serverName}** ${actionFormatted} Failed - ${error.message}`)
              }
            }

            await interaction.editReply(`Executed ${actionFormatted}: \n\n${results.join(`\n`)}`)
            return
          }

          case "commandStop": {
            await interaction.deferReply({ ephemeral: true })
            let servers =
              scope == "cluster"
                ? getClusterServers(target).map((server) => {
                    server.name
                  })
                : [target]

            let results = []

            for (let serverName of servers) {
              try {
                let serverConfig = getServer(serverName)
                let stopCommand = serverConfig?.data?.controlPanel?.stopCommand
                if (!stopCommand) {
                  throw new Error(`No stopCommand Configured For ${target}`)
                }
                let result = await sendRcon(serverName, stopCommand)
                if (!result.success) {
                  throw result.error
                }
                results.push(`✅ **${serverName}** ${actionFormatted} Success`)
              } catch {
                results.push(`❎ **${serverName}** ${actionFormatted} Failed - ${error.message}`)
              }
            }

            await interaction.editReply(`Executed Stop Command: \n\n${results.join(`\n`)}`)
            return
          }
        }

        return
      } else if (interaction.isModalSubmit()) {
        switch (idParts[1]) {
          case "rconModal": {
            let [, , scope, target] = idParts
            let command = interaction.fields.getTextInputField("command")
            await interaction.deferReply({ ephemeral: true })

            if (scope == "cluster") {
              let results = await sendClusterRcon(target, command)
              let output = results
                .map((result) => {
                  let resultText
                  if (result.success) {
                    resultText = `**${result.server}**:\n\`\`\`${result.response
                      .split("\n")
                      .filter((line) => line.trim())
                      .join("\n")}\`\`\``
                  } else {
                    resultText = `**${result.server}**:\n\`\`\`${result.error.message}\`\`\``
                  }
                })
                .join(`\n\n`)

              await interaction.editReply(`RCON Command (${command}) Sent To Cluster **${target}**:\n\n${output}`)
              return
            } else if (scope == "server") {
              let result = await sendRcon(target, command)
              let resultText
              if (result.success) {
                resultText = `**${result.server}**:\n\`\`\`${result.response
                  .split("\n")
                  .filter((line) => line.trim())
                  .join("\n")}\`\`\``
              } else {
                resultText = `**${result.server}**:\n\`\`\`${result.error.message}\`\`\``
              }

              await interaction.editReply(`RCON Command (${command}) Sent To Server **${target}**:\n\n${resultText}`)
              return
            }
            break
          }

          case "playerAction": {
            let [, , action, scope, target] = idParts
            let steamId
            let selectValues = []

            try {
              selectValues = interaction.fields.getStringSelectValues("player")
            } catch {
              selectValues = []
            }

            steamId = selectValues.length ? selectValues[0] : interaction.fields.getTextInputValue("player").trim()

            let serverName = scope == "cluster" ? getClusterPlayers(target).find((player) => player.steamId == steamId)?.server : target
            let cache = cacApi.cache.get()
            let player = serverName ? cache[serverName].players.find((player) => player.steamId == steamId) : null
            let label = `Steam Id **${steamId}**`

            await interaction.deferReply({ ephemeral: true })

            let actionFormatted
            let command
            switch (action) {
              case "kick": {
                actionFormatted = "Kicking"
                command = `kickPlayer ${steamId}`
                break
              }

              case "ban": {
                actionFormatted = "Banning"
                command = `banPlayer ${steamId}`
                break
              }
            }

            switch (scope) {
              case "cluster": {
                const results = await sendClusterRcon(target, command)
                const output = results
                  .map((result) => {
                    let resultText
                    if (result.success) {
                      resultText = `**${result.server}**:\n\`\`\`${result.response
                        .split("\n")
                        .filter((line) => line.trim())
                        .join("\n")}\`\`\``
                    } else {
                      resultText = `**${result.server}**:\n\`\`\`${result.error.message}\`\`\``
                    }
                  })
                  .join(`\n\n`)

                await interaction.editReply(`Attempted **${actionFormatted}** ${label} From The **${target}** Cluster\n\n${output}`)
                return
              }

              case "server": {
                const result = await sendRcon(target, command)
                let resultText
                if (result.success) {
                  resultText = `\`\`\`${result.response
                    .split("\n")
                    .filter((line) => line.trim())
                    .join("\n")}\`\`\``
                } else {
                  resultText = `\`\`\`${result.error.message}\`\`\``
                }

                await interaction.editReply(`Attempted **${actionFormatted}** ${label} From **${target}**\n\n${resultText}`)
                return
              }
            }
            break
          }
        }
      }
    }

    client.on("interactionCreate", interactionHandler)
    packetHandler = async (packet) => {
      if (["join", "leave"].includes(packet.type)) {
        setTimeout(() => refreshPanels(panelMessages), 1000)
      }
    }

    cacApi.events.on("packet", packetHandler)
    cacApi.events.on("serverStatusUpdate", () => refreshPanels(panelMessages))
    initPanels().catch((err) => {
      if (cacConfig.logging.plugins) {
        console.log(`[${this.name}] Panel Init Error`)
      }
    })
  },
}
