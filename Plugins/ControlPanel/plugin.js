const fs = require("node:fs")
const path = require("node:path")

let interactionHandler = null
let packetHandler = null
let ssuPacketHandler = null
let ssuPacketHandling = null
let ssuPacketQueue = new Set()

module.exports = {
  name: "Control Panel",
  version: "v1.7.3",

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

    if (ssuPacketHandler) {
      cacApi.events.off("serverStatusUpdate", ssuPacketHandler)
      ssuPacketHandler = null
    }

    if (ssuPacketHandling) {
      clearTimeout(ssuPacketHandling)
      ssuPacketHandling = null
    }
    ssuPacketQueue.clear()
  },

  async setup(cacApi) {
    const {
      ActionRowBuilder,
      ButtonBuilder,
      ButtonStyle,
      ModalBuilder,
      StringSelectMenuBuilder,
      TextInputBuilder,
      TextInputStyle,
      MessageFlags,
      ContainerBuilder,
      LabelBuilder,
      CheckboxBuilder,
      ChannelType,
      PermissionFlagsBits,
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
          cluster: "clusterName",
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
            deleteResponsesAfter: 15,
            onlineEmoji: "",
            offlineEmoji: "",
            clusterEmoji: "",
          },
          null,
          2,
        ),
      )
    }

    let loadConfig = () => JSON.parse(fs.readFileSync(configPath))
    let pluginConfig = loadConfig()

    let loadPanelCache = () => {
      let defaultPanelCache = { createdAt: "", messages: {}, threads: {} }
      if (!fs.existsSync(panelsPath)) return defaultPanelCache
      try {
        let cache = JSON.parse(fs.readFileSync(panelsPath))
        return { ...defaultPanelCache, ...cache }
      } catch {
        return defaultPanelCache
      }
    }

    let savePanelCache = (cache) => {
      fs.writeFileSync(panelsPath, JSON.stringify(cache, null, 2))
    }

    let isServerOnline = (serverName) => {
      let cache = cacApi.cache.get()
      return cache[serverName]?.online || false
    }

    let getServer = (serverName) => enabledServers.find((server) => server.name === serverName)

    let getClusters = () => [...new Set(enabledServers.map((server) => server.data.cluster).filter(Boolean))]

    let getClusterServers = (clusterName) => enabledServers.filter((server) => server.data.cluster === clusterName)

    let getFormattedPlayerList = (serverName) => {
      let cache = cacApi.cache.get()
      let players = cache[serverName]?.players || []

      if (players.length > 0) {
        return players
          .map((player) => {
            if (player.data?.ign) {
              return `${player.data.ign} (${player.name}) [${player.data.tribeName}]: \`${player.steamId}\``
            }
            return `${player.name}: \`${player.steamId}\``
          })
          .join("\n")
      }
      return "No Players Online"
    }

    let getClusterPlayers = (clusterName) => {
      let cache = cacApi.cache.get()
      let players = []
      Object.entries(cache).forEach(([name, serverCache]) => {
        if (serverCache?.cluster === clusterName && Array.isArray(serverCache.players)) {
          players.push(
            ...serverCache.players.map((player) => ({
              server: name,
              ...player,
            })),
          )
        }
      })
      return players
    }

    let getServerPlayers = (serverName) => {
      let cache = cacApi.cache.get()
      return (
        cache[serverName]?.players?.map((player) => ({
          server: serverName,
          ...player,
        })) || []
      )
    }

    let createServerEmbed = (serverName) => {
      let server = getServer(serverName)
      let isOnline = isServerOnline(serverName)
      let updateTimestampFormatted = `<t:${Math.floor(Date.now() / 1000)}>`

      return new ContainerBuilder()
        .addTextDisplayComponents((textDisplay) => {
          let onlineEmoji = pluginConfig.onlineEmoji ? pluginConfig.onlineEmoji : "🟢"
          let offlineEmoji = pluginConfig.offlineEmoji ? pluginConfig.offlineEmoji : "🔴"
          return textDisplay.setContent(
            `## ${isOnline ? onlineEmoji : offlineEmoji} ${server.data.cluster || "Unclustered"} - ${server.name}\n-# Updated: ${updateTimestampFormatted}`,
          )
        })
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((textDisplay) =>
          textDisplay.setContent(isOnline ? getFormattedPlayerList(serverName) : `${server.name} Is Currently Offline.`),
        )
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
        .addActionRowComponents((row) =>
          row.setComponents(
            new ButtonBuilder().setCustomId(`controlPanel;refresh;server;${server.name}`).setLabel("Refresh Panel").setStyle(ButtonStyle.Success),
          ),
        )
    }

    let createClusterEmbed = (clusterName) => {
      let cache = cacApi.cache.get()
      let totalPlayers = getClusterPlayers(clusterName).length
      let clusterServers = getClusterServers(clusterName)
      let onlineServers = clusterServers.filter((server) => cache[server.name]?.online)
      let updateTimestampFormatted = `<t:${Math.floor(Date.now() / 1000)}>`

      return new ContainerBuilder()
        .addTextDisplayComponents((textDisplay) => {
          let clusterEmoji = pluginConfig.clusterEmoji ? `${pluginConfig.clusterEmoji} ` : ""
          return textDisplay.setContent(`## ${clusterEmoji}${clusterName} - Cluster Control\n-# Updated: ${updateTimestampFormatted}`)
        })
        .addSeparatorComponents((separator) => separator)
        .addTextDisplayComponents((textDisplay) =>
          textDisplay.setContent(`Total Players: **${totalPlayers}**\nOnline Servers: **${onlineServers.length}**/**${clusterServers.length}**`),
        )
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
        .addActionRowComponents((row) =>
          row.setComponents(
            new ButtonBuilder().setCustomId(`controlPanel;refresh;cluster;${clusterName}`).setLabel("Refresh Panels").setStyle(ButtonStyle.Success),
          ),
        )
    }

    let createRconModal = (scope, target) => {
      return new ModalBuilder()
        .setCustomId(`controlPanel;rconModal;${scope};${target}`)
        .setTitle("Send RCON Command")
        .addComponents(
          new ActionRowBuilder().addComponents(
            new TextInputBuilder().setCustomId("command").setLabel("RCON Command").setPlaceholder("saveworld").setStyle(TextInputStyle.Short).setRequired(true),
          ),
        )
    }

    let createConfirmationModal = (action, scope, target) => {
      let actionFormatted = action === "commandStop" ? "Stop Command" : String(action).charAt(0).toUpperCase() + action.slice(1).toLowerCase()

      return new ModalBuilder()
        .setCustomId(`controlPanel;confirmAction;${action};${scope};${target}`)
        .setTitle(`Confirm: ${actionFormatted}`)
        .addLabelComponents(
          new LabelBuilder().setLabel(`Confirm: ${target}`).setCheckboxComponent(new CheckboxBuilder().setCustomId("confirmInput").setDefault(false)),
        )
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
              .setPlaceholder("Select A Player")
              .addOptions(
                players.slice(0, 25).map((player) => {
                  let label = player.data?.ign
                    ? `${player.data.ign} (${player.name}) [${player.data.tribeName}]: ${player.steamId}`
                    : `${player.name}: ${player.steamId}`

                  if (scope === "cluster") {
                    label = `${player.server} - ${label}`
                  }
                  return { label: label.slice(0, 100), value: String(player.steamId) }
                }),
              ),
          ),
        )
      } else {
        modal.addLabelComponents(
          new LabelBuilder()
            .setLabel("Steam ID")
            .setTextInputComponent(
              new TextInputBuilder().setCustomId("player").setPlaceholder("Enter The Player's Steam Id").setStyle(TextInputStyle.Short).setRequired(true),
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
      return new Promise((resolve) => {
        try {
          const isWin = process.platform === "win32"
          const child = childProc.spawn(isWin ? "cmd.exe" : "/bin/sh", [isWin ? "/c" : "-c", command], {
            detached: true,
            stdio: "ignore",
          })

          child.on("error", (err) => {
            resolve({ success: false, error: err.message })
          })

          child.unref()
          resolve({ success: true })
        } catch (error) {
          resolve({ success: false, error: error.message })
        }
      })
    }

    async function refreshPanels(panelMessages, specTarget) {
      let cache = cacApi.cache.get()
      const targets = specTarget ? (Array.isArray(specTarget) ? [...specTarget] : [specTarget]) : null

      if (targets) {
        for (let target of targets) {
          if (cache[target]?.cluster) {
            let clusterId = `cluster:${cache[target].cluster}`
            if (!targets.includes(clusterId)) {
              targets.push(clusterId)
            }
          }
        }
      }

      for (const [key, message] of Object.entries(panelMessages)) {
        if (targets && !targets.includes(key)) continue

        try {
          const container = key.startsWith("cluster:") ? createClusterEmbed(key.replace("cluster:", "")) : createServerEmbed(key)
          await message.edit({
            components: [container],
            flags: MessageFlags.IsComponentsV2,
          })
        } catch {}
      }
    }

    if (!pluginConfig.channel) {
      if (cacConfig.logging.plugins) {
        console.log(`[${this.name}] No Control Panel Channel Configured`)
      }
      return
    }

    const client = cacApi.discord.getClient()
    const controlPanelChannel = client.channels.cache.get(pluginConfig.channel) || (await client.channels.fetch(pluginConfig.channel))

    if (!controlPanelChannel) {
      if (cacConfig.logging.plugins) {
        console.log(`[${this.name}] Channel With Id ${pluginConfig.channel} Not Found`)
      }
      return
    }

    const isForumChannel = controlPanelChannel.type === ChannelType.GuildForum

    let panelCache = loadPanelCache()
    let panelMessages = {}

    let sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

    let getChannelViewers = async () => {
      try {
        const guildMembers = await controlPanelChannel.guild.members.fetch()
        return [...guildMembers.filter((member) => controlPanelChannel.permissionsFor(member)?.has(PermissionFlagsBits.ViewChannel)).values()]
      } catch (error) {
        if (cacConfig.logging.plugins) {
          console.log(`[${this.name}] Failed To Fetch Channel Viewers`, error)
        }
        return []
      }
    }

    let addViewersToThread = async (thread, viewers) => {
      const batchSize = 50
      const batchDelayMs = 500

      let existingMemberIds = new Set()
      try {
        const existingMembers = await thread.members.fetch()
        existingMemberIds = new Set(existingMembers.keys())
      } catch (error) {
        if (cacConfig.logging.plugins) {
          console.log(`[${this.name}] Failed To Fetch Existing Thread Members For ${thread.id}`, error)
        }
      }

      const newViewers = viewers.filter((member) => !existingMemberIds.has(member.id))
      if (!newViewers.length) return

      for (let i = 0; i < newViewers.length; i += batchSize) {
        const batch = newViewers.slice(i, i + batchSize)
        const mentionContent = batch.map((member) => `<@${member.id}>`).join(" ")

        try {
          const pingMessage = await thread.send({
            content: mentionContent,
            allowedMentions: { users: batch.map((member) => member.id) },
          })
          await pingMessage.delete().catch(() => {})
        } catch (error) {
          if (cacConfig.logging.plugins) {
            console.log(`[${this.name}] Failed To Add Viewer Batch To Thread ${thread.id}`, error)
          }
        }

        if (i + batchSize < newViewers.length) {
          await sleep(batchDelayMs)
        }
      }
    }

    let initPanels = async () => {
      let todayString = new Date().toLocaleDateString()
      let createdAtString = new Date(panelCache.createdAt).toLocaleDateString()

      if (createdAtString !== todayString) {
        if (isForumChannel) {
          const deleteThreadPromises = Object.values(panelCache.threads || {}).map(async (threadId) => {
            try {
              const thread = controlPanelChannel.threads.cache.get(threadId) || (await controlPanelChannel.threads.fetch(threadId))
              await thread?.delete()
            } catch {}
          })
          await Promise.all(deleteThreadPromises)
        } else {
          const deletePromises = Object.values(panelCache.messages || {}).map(async (messageId) => {
            try {
              const message = controlPanelChannel.messages.cache.get(messageId) || (await controlPanelChannel.messages.fetch(messageId))
              await message.delete()
            } catch {}
          })
          await Promise.all(deletePromises)
        }

        panelCache = { createdAt: Date.now(), messages: {}, threads: {} }
      }

      let clusters = getClusters()
      let results = []
      let channelViewers = isForumChannel ? await getChannelViewers() : []

      for (let cluster of clusters) {
        let clusterServers = getClusterServers(cluster)
        let sendTarget = controlPanelChannel

        if (isForumChannel) {
          let thread = null
          const threadId = panelCache.threads[cluster]

          if (threadId) {
            try {
              thread = controlPanelChannel.threads.cache.get(threadId) || (await controlPanelChannel.threads.fetch(threadId))
            } catch {}
          }

          if (!thread) {
            thread = await controlPanelChannel.threads.create({
              name: cluster,
              message: pluginConfig.cluster ? { components: [createClusterEmbed(cluster)], flags: MessageFlags.IsComponentsV2 } : { content: `## ${cluster}` },
            })
            panelCache.threads[cluster] = thread.id
          }

          await addViewersToThread(thread, channelViewers)

          sendTarget = thread

          if (pluginConfig.cluster) {
            const clusterKey = `cluster:${cluster}`
            let message = null
            try {
              message = await thread.fetchStarterMessage()
            } catch {}

            if (message) {
              panelCache.messages[clusterKey] = message.id
              results.push({ key: clusterKey, message })
            }
          }
        }

        for (let server of clusterServers) {
          const messageId = panelCache.messages[server.name]
          let message = null

          if (messageId) {
            try {
              message = sendTarget.messages.cache.get(messageId) || (await sendTarget.messages.fetch(messageId))
            } catch {}
          }

          if (!message) {
            message = await sendTarget.send({
              components: [createServerEmbed(server.name)],
              flags: MessageFlags.IsComponentsV2,
            })
            panelCache.messages[server.name] = message.id
          }

          results.push({ key: server.name, message })
        }

        if (!isForumChannel && pluginConfig.cluster) {
          const clusterKey = `cluster:${cluster}`
          const messageId = panelCache.messages[clusterKey]
          let message = null

          if (messageId) {
            try {
              message = controlPanelChannel.messages.cache.get(messageId) || (await controlPanelChannel.messages.fetch(messageId))
            } catch {}
          }

          if (!message) {
            message = await controlPanelChannel.send({
              components: [createClusterEmbed(cluster)],
              flags: MessageFlags.IsComponentsV2,
            })
            panelCache.messages[clusterKey] = message.id
          }

          results.push({ key: clusterKey, message })
        }
      }

      results.forEach(({ key, message }) => {
        panelMessages[key] = message
      })

      panelCache.createdAt = Date.now()
      savePanelCache(panelCache)

      await refreshPanels(panelMessages)

      if (cacConfig.logging.plugins) console.log(`[${this.name}] Panels Ready`)
    }

    let scheduleReplyDeletion = (interaction) => {
      const delayMs = (pluginConfig.deleteResponsesAfter ?? 15) * 1000
      if (delayMs <= 0) return

      setTimeout(async () => {
        try {
          await interaction.deleteReply()
        } catch {}
      }, delayMs)
    }

    interactionHandler = async (interaction) => {
      if (!interaction.customId || !interaction.customId.startsWith("controlPanel;")) return
      if (!(await cacApi.utils.isAdmin(interaction.user.id))) {
        interaction.reply({
          content: "No Permission To Use This",
          flags: [MessageFlags.Ephemeral],
        })
      }

      let idParts = interaction.customId.split(";")

      if (interaction.isButton()) {
        let [, action, scope, target] = idParts

        switch (action) {
          case "rcon": {
            return interaction.showModal(createRconModal(scope, target))
          }

          case "kick":
          case "ban": {
            return interaction.showModal(createPlayerActionModal(action, scope, target))
          }

          case "start":
          case "stop":
          case "restart":
          case "commandStop": {
            return interaction.showModal(createConfirmationModal(action, scope, target))
          }

          case "refresh": {
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })
            let servers = scope === "cluster" ? getClusterServers(target).map((server) => server.name) : [target]
            await interaction.editReply(`Refreshing Panel${scope === "cluster" ? "s" : ""}`)
            scheduleReplyDeletion(interaction)
            refreshPanels(panelMessages, servers)
            return
          }
        }
      } else if (interaction.isModalSubmit()) {
        switch (idParts[1]) {
          case "rconModal": {
            let [, , scope, target] = idParts
            let command = interaction.fields.getTextInputValue("command")
            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })

            if (scope === "cluster") {
              let results = await sendClusterRcon(target, command)
              let output = results
                .map(
                  (result) =>
                    `**${result.server}**:\n\`\`\`${
                      result.success
                        ? (result.response || "No Response From Server")
                            .split("\n")
                            .filter((l) => l.trim())
                            .join("\n")
                        : result.error.message
                    }\`\`\``,
                )
                .join("\n")

              await interaction.editReply(`RCON Command (${command}) Sent To Cluster **${target}**:\n\n${output}`)
              scheduleReplyDeletion(interaction)
              return
            } else if (scope === "server") {
              let result = await sendRcon(target, command)
              let resultText = `\`\`\`${
                result.success
                  ? (result.response || "No Response From Server")
                      .split("\n")
                      .filter((l) => l.trim())
                      .join("\n")
                  : result.error.message
              }\`\`\``

              await interaction.editReply(`RCON Command (${command}) Sent To Server **${target}**:\n\n${resultText}`)
              scheduleReplyDeletion(interaction)
              return
            }
            break
          }

          case "playerAction": {
            let [, , action, scope, target] = idParts
            let selectValues = []

            try {
              selectValues = interaction.fields.getStringSelectValues("player")
            } catch {
              selectValues = []
            }

            let steamId = selectValues.length ? selectValues[0] : interaction.fields.getTextInputValue("player").trim()
            let label = `Steam Id **${steamId}**`

            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })

            let actionFormatted = action === "kick" ? "Kicking" : "Banning"
            let command = `${action}Player ${steamId}`

            if (scope === "cluster") {
              const results = await sendClusterRcon(target, command)
              const output = results
                .map(
                  (result) =>
                    `**${result.server}**:\n\`\`\`${
                      result.success
                        ? (result.response || "No Response From Server")
                            .split("\n")
                            .filter((l) => l.trim())
                            .join("\n")
                        : result.error.message
                    }\`\`\``,
                )
                .join("\n")

              await interaction.editReply(`Attempted **${actionFormatted}** ${label} From The **${target}** Cluster\n\n${output}`)
              scheduleReplyDeletion(interaction)
              return
            } else if (scope === "server") {
              const result = await sendRcon(target, command)
              let resultText = `\`\`\`${
                result.success
                  ? (result.response || "No Response From Server")
                      .split("\n")
                      .filter((l) => l.trim())
                      .join("\n")
                  : result.error.message
              }\`\`\``

              await interaction.editReply(`Attempted **${actionFormatted}** ${label} From **${target}**\n\n${resultText}`)
              scheduleReplyDeletion(interaction)
              return
            }
            break
          }

          case "confirmAction": {
            let [, , action, scope, target] = idParts
            let isConfirmed = interaction.fields.getCheckbox("confirmInput")

            if (!isConfirmed) {
              await interaction.reply({ content: "❎ Action Cancelled, Check The Confirmation Box.", flags: [MessageFlags.Ephemeral] })
              scheduleReplyDeletion(interaction)
              return
            }

            await interaction.deferReply({ flags: [MessageFlags.Ephemeral] })

            let actionFormatted = action === "commandStop" ? "Stop Command" : String(action).charAt(0).toUpperCase() + action.slice(1).toLowerCase()
            let servers = scope === "cluster" ? getClusterServers(target).map((server) => server.name) : [target]
            let results = []

            if (["start", "stop", "restart"].includes(action)) {
              for (let serverName of servers) {
                try {
                  let scriptKey = `${action}Script`
                  let execCommand = enabledServers.find((server) => server.name === serverName)?.data?.controlPanel?.[scriptKey]

                  if (!execCommand) {
                    throw new Error(`No ${scriptKey} Configured For ${serverName}`)
                  }

                  let result = await runScript(execCommand)
                  if (result.success) {
                    results.push(`✅ **${serverName}** ${actionFormatted} Success`)
                  } else {
                    results.push(`❎ **${serverName}** ${actionFormatted} Failed - ${result.error}`)
                  }
                } catch (error) {
                  results.push(`❎ **${serverName}** ${actionFormatted} Failed - ${error.message}`)
                }
              }
            } else if (action === "commandStop") {
              for (let serverName of servers) {
                try {
                  let serverConfig = getServer(serverName)
                  let stopCommand = serverConfig?.data?.controlPanel?.stopCommand
                  if (!stopCommand) {
                    throw new Error(`No Stop Command Configured For ${target}`)
                  }

                  let result = await sendRcon(serverName, stopCommand)
                  if (!result.success) {
                    throw result.error
                  }

                  results.push(`✅ **${serverName}** ${actionFormatted} Success`)
                } catch (error) {
                  results.push(`❎ **${serverName}** ${actionFormatted} Failed - ${error.message}`)
                }
              }
            }

            await interaction.editReply(`Executed ${actionFormatted}:\n\n${results.join("\n")}`)
            scheduleReplyDeletion(interaction)
            return
          }
        }
      }
    }

    client.on("interactionCreate", interactionHandler)

    packetHandler = async (packet) => {
      if (["join", "leave"].includes(packet.type)) {
        setTimeout(() => refreshPanels(panelMessages, packet.server), 1000)
      }
    }

    let isProcessingSSU = false

    ssuPacketHandler = async (ssuPacket) => {
      if (ssuPacket?.server) {
        ssuPacketQueue.add(ssuPacket.server)
      }

      if (isProcessingSSU) {
        return
      }
      isProcessingSSU = true

      ssuPacketHandling = setTimeout(async () => {
        while (ssuPacketQueue.size > 0) {
          const batch = Array.from(ssuPacketQueue)
          ssuPacketQueue.clear()

          for (const server of batch) {
            await refreshPanels(panelMessages, server)
          }
        }

        isProcessingSSU = false
        ssuPacketHandling = null
      }, 1000)
    }

    cacApi.events.on("packet", packetHandler)
    cacApi.events.on("serverStatusUpdate", ssuPacketHandler)

    initPanels().catch((err) => {
      if (cacConfig.logging.plugins) {
        console.log(`[${this.name}] Panel Init Error`, err)
      }
    })
  },
}
