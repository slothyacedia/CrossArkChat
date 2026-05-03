# CrossArkChat API (`cacApi`)

The `cacApi` object is passed to every plugin and exposes internal utilities for interacting with CrossArkChat at runtime.

It provides access to:

- Permissions (admin checks)
- Config loading and mutation
- Cache access and mutation
- Plugin and command management
- Event system
- ARK server and Discord communication
- Dynamic module installation

---

## Overview

```js
{
  isAdmin(userId),
  loadConfig(),
  loadPlugins(),
  getCache(),
  getConfig(),
  getArkAgents(),
  getDiscordClient(),
  handlePacket(packet),
  registerCommand(names, handler),
  unregisterCommand(names),
  reloadPlugin(name),
  getLoadedPlugins(),
  on(event, handler),
  off(event, handler),
  sendToServers(message),
  sendToServer(name, message),
  sendToDiscord(channelId, message),
  writeConfig(newConfig),
  writeCache(newCache),
  modMan: {
    installModule(module, version),
    require(module, version)
  }
}
```

---

## Methods

### `isAdmin(userId)`

Checks whether a user has admin privileges.

```js
const admin = await cacApi.isAdmin(userId)
```

**Returns:**

- `true` → user is admin or bot owner
- `false` → not authorized

**Notes:**

- Checks `config.discord.admins`
- Falls back to Discord application owner/team
- Async due to API fetch

---

### `loadConfig()`

Loads config fresh from disk.

```js
const newConfig = cacApi.loadConfig()
```

**Behavior:**

- Supports both `config.js` and `config.json`
- Clears `require` cache before loading
- Does **not** apply the config automatically — use with `writeConfig()`

---

### `loadPlugins()`

Reloads all plugins from the `/plugins` folder.

```js
await cacApi.loadPlugins()
```

**Behavior:**

- Scans `/plugins` for subfolders containing `plugin.js`
- Calls `teardown(api)` on each plugin if defined before reloading
- Re-runs `setup(api)` on each plugin
- Updates the internal plugin registry

**Notes:**

- Safe to call at runtime
- Re-registers commands and event listeners — plugins should implement `teardown()` to clean up first

---

### `reloadPlugin(name)`

Reloads a single plugin by name.

```js
await cacApi.reloadPlugin("watchlist")
```

**Behavior:**

- Looks up the plugin's file path from the internal registry
- Calls `teardown(api)` if defined
- Re-requires and re-runs `setup(api)`

**Throws:**

- If the plugin name is not found in the registry

---

### `getLoadedPlugins()`

Returns the internal plugin registry.

```js
const plugins = cacApi.getLoadedPlugins()
// Map<pluginName, filePath>
```

---

### `getConfig()`

Returns the current in-memory config object.

```js
const config = cacApi.getConfig()
```

**Important:**

- This is a live reference
- Mutating it directly affects runtime behavior

---

### `writeConfig(newConfig)`

Replaces the contents of the current config **without changing its reference**.

```js
cacApi.writeConfig(newConfig)
```

**Why this exists:**

- Prevents stale references in long-running systems
- Ensures all parts of the app see updated values

**How it works:**

- Deletes all existing keys
- Copies new values onto the same object

**Warning:**

- Does not restart systems (timers, agents, etc.)
- Some changes may not fully apply until restart

---

### `getCache()`

Returns the current cache object.

```js
const cache = cacApi.getCache()
```

**Structure:**

```js
{
  Discord: { messages: [], players: [] },
  TribeLogs: { messages: [], players: [] },
  [serverName]: {
    messages: [],
    players: []
  }
}
```

**Notes:**

- Live reference — mutations affect runtime immediately
- Persisted periodically to `cache.json`

---

### `writeCache(newCache)`

Replaces the entire cache object (preserving reference).

```js
cacApi.writeCache(newCache)
```

**Warning:**

- Overwrites everything — use carefully

---

### `getArkAgents()`

Returns the list of active ARK RCON agent instances.

```js
const agents = cacApi.getArkAgents()
```

**Structure:**

```js
;[
  {
    name: "ServerName",
    send: async (message) => {},
  },
]
```

**Notes:**

- Only contains agents for enabled servers
- Use `sendToServer()` for targeted sends instead of iterating manually

---

### `getDiscordClient()`

Returns the active Discord.js `Client` instance.

```js
const client = cacApi.getDiscordClient()
```

**Notes:**

- May be `null` if Discord is disabled or not yet connected
- Use `sendToDiscord()` for simple channel sends

---

### `handlePacket(packet)`

Injects a packet directly into the relay pipeline.

```js
cacApi.handlePacket({
  id: `my-plugin-${Date.now()}`,
  origin: "my-plugin",
  type: "chat",
  server: "Discord",
  player: "System",
  text: "Hello from my plugin",
  metadata: {},
})
```

**Behavior:**

- Formats and broadcasts the packet to ARK servers and Discord according to config
- Emits the `packet` event so other plugins can observe it
- `origin` controls which ARK servers receive it — servers matching `origin` are skipped

**Packet fields:**

| Field      | Type   | Description                                                     |
| ---------- | ------ | --------------------------------------------------------------- |
| `id`       | string | Unique identifier                                               |
| `origin`   | string | Source of the packet (server name, `"discord"`, or plugin name) |
| `type`     | string | Packet type (`chat`, `join`, `leave`, `tribeLogs`, `leftovers`) |
| `server`   | string | Display name of the source server                               |
| `player`   | string | Player name associated with the packet                          |
| `text`     | string | Message content                                                 |
| `metadata` | object | Optional extra data (e.g. `tribeName`, `tribeId`, `color`)      |

---

### `registerCommand(names, handler)`

Registers one or more Discord command names to a handler function.

```js
cacApi.registerCommand(["mycommand", "mc"], async (message, cmd, args) => {
  return message.reply("Hello!")
})
```

**Parameters:**

- `names` — string or array of strings (command names, prefix-excluded)
- `handler` — `async (message, cmd, args) => {}`

**Notes:**

- Names are case-insensitive
- Overwrites any existing handler registered to the same name

---

### `unregisterCommand(names)`

Removes one or more commands from the registry.

```js
cacApi.unregisterCommand(["mycommand", "mc"])
```

**Notes:**

- Silently ignores names that aren't registered
- Should be called in `teardown()` to clean up before a plugin reload

---

### `on(event, handler)`

Subscribes to an internal event.

```js
cacApi.on("packet", (packet) => {
  console.log(packet)
})
```

**Available events:**

| Event    | Payload  | Description                                               |
| -------- | -------- | --------------------------------------------------------- |
| `packet` | `packet` | Fired for every packet that passes through `handlePacket` |

---

### `off(event, handler)`

Unsubscribes a previously registered event handler.

```js
cacApi.off("packet", myHandler)
```

**Notes:**

- Must pass the same function reference used in `on()`
- Should be called in `teardown()` to avoid duplicate listeners on reload

---

### `sendToServers(message)`

Broadcasts a message to all connected ARK servers.

```js
cacApi.sendToServers("Server restart in 5 minutes!")
```

---

### `sendToServer(name, message)`

Sends a message to a specific ARK server by name.

```js
cacApi.sendToServer("TheIsland", "Hello Island!")
```

**Notes:**

- Silently does nothing if the server name is not found

---

### `sendToDiscord(channelId, message)`

Sends a message to a Discord channel by ID.

```js
cacApi.sendToDiscord("123456789", "Hello Discord!")
```

**Notes:**

- Silently does nothing if the channel is not found or client is not ready

---

## Module Manager (`modMan`)

Utility for dynamically installing and requiring Node modules at runtime.

---

### `modMan.require(moduleName, version?)`

Attempts to require a module, installs it if missing.

```js
const axios = await cacApi.modMan.require("axios")
```

---

### `modMan.installModule(moduleName, version?)`

Manually installs a module via npm.

```js
await cacApi.modMan.installModule("lodash", "4.17.21")
```

**Behavior:**

- Runs `npm install` synchronously
- Returns the required module after install

**Warning:**

- Blocks execution during install
- Requires filesystem write access

---

## Plugin Structure

A plugin is a folder inside `/plugins` containing a `plugin.js` file.

```
plugins/
  my-plugin/
    plugin.js
    config.json
```

`plugin.js` must export:

```js
module.exports = {
  name: "my-plugin", // unique name used in registry
  version: "1.0.0",

  setup(api) {
    // runs on load — register commands, listeners, intervals
  },

  teardown(api) {
    // optional — runs before reload to clean up
    api.unregisterCommand(["mycommand"])
    api.off("packet", myHandler)
  },
}
```

---

## Design Notes

### Reference Preservation

Both `writeConfig` and `writeCache` exist to avoid breaking references inside long-lived systems like RCON agents, timers, and event handlers.

### Plugin Teardown

Plugins that register commands or event listeners should always implement `teardown()` to clean up before being reloaded. Without it, reloading a plugin will result in duplicate listeners and command handlers.

### Hot Reload Limitations

While config and plugins can be reloaded at runtime:

- Existing RCON connections and intervals are not rebuilt
- Some config changes may not fully apply until restart

---

## Example Usage

### Reload Config

```js
cacApi.writeConfig(cacApi.loadConfig())
```

### Admin Check

```js
if (!(await cacApi.isAdmin(message.author.id))) {
  throw new Error("Not authorized")
}
```

### Inject a Packet

```js
cacApi.handlePacket({
  id: `announce-${Date.now()}`,
  origin: "my-plugin",
  type: "chat",
  server: "System",
  player: "System",
  text: "Scheduled restart in 10 minutes!",
  metadata: {},
})
```

### Listen to Packets

```js
function onPacket(packet) {
  if (packet.type === "join") {
    console.log(`${packet.player} joined ${packet.server}`)
  }
}

cacApi.on("packet", onPacket)

// in teardown
cacApi.off("packet", onPacket)
```

### Send to a Specific Server

```js
cacApi.sendToServer("TheIsland", "Welcome to the Island!")
```
