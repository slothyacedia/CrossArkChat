# CrossArkChat API (`cacApi`)

The `cacApi` object is passed to every command module and exposes internal utilities for interacting with CrossArkChat at runtime.

It provides access to:

- Permissions (admin checks)
- Config loading and mutation
- Cache access and mutation
- Command reloading
- Dynamic module installation

---

## Overview

```js
{
  isAdmin(userId),
  loadConfig(),
  loadCommands(),
  getCache(),
  getConfig(),
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
const isAdmin = await cacApi.isAdmin(userId)
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
- Does **not** apply the config automatically

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

### `loadCommands()`

Reloads all command modules.

```js
cacApi.loadCommands()
```

**Behavior:**

- Clears `require` cache for command files
- Re-imports all commands from `/commands` folder
- Re-registers command names

**Use case:**

- Hot-reloading commands without restarting bot

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

- Live reference (mutations affect runtime immediately)
- Persisted periodically to `cache.json`

---

### `writeCache(newCache)`

Replaces the entire cache object (preserving reference).

```js
cacApi.writeCache(newCache)
```

**Behavior:**

- Clears existing keys and assigns new ones

**Warning:**

- Overwrites everything — use carefully

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

## Design Notes

### Reference Preservation

Both:

- `writeConfig`
- `writeCache`

exist to avoid breaking references inside long-lived systems like:

- RCON agents
- timers
- event handlers

---

### Hot Reload Limitations

While config and commands can be reloaded:

- Existing intervals and connections are not rebuilt
- Some changes may require a full restart

---

## Example Usage

### Reload Config

```js
const newConfig = cacApi.loadConfig()
cacApi.writeConfig(newConfig)
```

---

### Admin Check

```js
if (!(await cacApi.isAdmin(message.author.id))) {
  throw new Error("Not authorized")
}
```

---

### Access Cache

```js
const cache = cacApi.getCache()
cache.Discord.messages.push({ test: true })
```

---

## Final Notes

- `getConfig()` and `getCache()` return live state
- Avoid careless mutation
- Use `writeConfig()` / `writeCache()` for full updates
- Use `loadCommands()` for command hot-reload
