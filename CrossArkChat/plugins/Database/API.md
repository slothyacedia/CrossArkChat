# Database cacApi Extension

- `Database` extends `cacApi` by embedding itself into `cacApi.database`.
- `Database` uses SQLite3 under the hood powered by `better-sqlite3`.
- **Plugin name:** `"Database"` — **Version:** `v1.0.1`

---

# Documentation

## Plugin Lifecycle

### `setup(cacApi)`

Called automatically when the plugin loads. Opens (or creates) a `database.sqlite` file in the plugin's own directory, provisions any tables that already exist in the file into the internal tracking set, and attaches the full `cacApi.database` API.

### `teardown(cacApi)`

Called automatically when the plugin unloads. Closes the raw `better-sqlite3` connection and removes `cacApi.database` from the API object, ensuring clean shutdown with no dangling file handles.

---

## `cacApi.database(<name>)`

Registers/provisions the named table (if it does not already exist) and returns the raw `better-sqlite3` database connection object. Use this when you need to run explicit SQL statements beyond what the tools abstraction provides.

> ⚠️ **Note:** By default, tables provisioned via the database engine are initialized only with an internal `_rowId` primary key column (`INTEGER PRIMARY KEY AUTOINCREMENT`) unless additional columns are appended using the tools API.

> ⚠️ **Note:** All table and column names are automatically sanitized — any character that is not alphanumeric or an underscore (`[^a-zA-Z0-9_]`) is stripped before the name is used in a SQL statement.

**Example:**

```js
let db = cacApi.database("messages")
db.prepare(
  `
  INSERT INTO messages (id, text)
  VALUES (?, ?)
  `,
).run(0, "hello world")
```

### `cacApi.database._rawConnection`

Holds a direct reference to the underlying `better-sqlite3` `Database` instance. Useful when you need low-level access outside of a normal `cacApi.database(<name>)` call.

```js
const raw = cacApi.database._rawConnection
const rows = raw.prepare("SELECT * FROM players").all()
```

---

## `cacApi.database.tools`

For general plugin development, use the built-in abstraction wrappers via `cacApi.database.tools`.

### Initializing Tables

To provision a new table structure or open a management chain for an existing one, use `table`:

```js
cacApi.database.tools.table(<tableName>)
// OR
cacApi.database.tools.createTable(<tableName>)
```

Calling either returns a **toolset context** that lets you chain structural and data operations together. If the table already exists in the database file, it is opened without modification.

> ℹ️ Table names are sanitized the same way as column names — non-alphanumeric/underscore characters are stripped.

---

### Structural Schema Chaining

#### `createColumn(<name>, <type>)`

Adds a new column to the table with the given name and type. The `type` string supports the following keywords (case-insensitive):

| Keyword(s)                       | SQLite type |
| -------------------------------- | ----------- |
| `"string"`, `"text"`             | `TEXT`      |
| `"number"`, `"int"`, `"integer"` | `INTEGER`   |
| `"real"`, `"float"`              | `REAL`      |
| `"boolean"`, `"bool"`            | `INTEGER`   |
| _(anything else)_                | `TEXT`      |

Append the `"unique"` modifier anywhere in the type string to create a `UNIQUE` index on the column:

```js
// Automatically creates the column and configures an underlying UNIQUE index
cacApi.database.tools.table("players").createColumn("steamId", "string unique")
```

> ℹ️ If the column already exists, the error is silently swallowed and the chain continues. All other errors are logged to the console as `[dbTools:<table>] Error adding column <col>: <message>`.

Returns `this` for chaining.

---

#### `deleteColumn(<name>)`

Permanently drops the named column from the table schema.

```js
cacApi.database.tools.table("players").deleteColumn("legacyField")
```

> ℹ️ If the column does not exist, the error is silently swallowed and the chain continues. All other errors are logged to the console as `[dbTools:<table>] Error: <message>`.

Returns `this` for chaining.

---

### Data Operations Chaining

#### `insert(<object>)`

Inserts a new row into the table, mapping object keys directly to column names.

```js
let playerTable = cacApi.database.tools
  .table("players")
  .createColumn("steamId", "string unique")
  .createColumn("profile", "string")
  .createColumn("flagged", "bool")
let profile = {
  steamId: "1234567890987654321",
  profile: JSON.stringify(otherData, null, 2),
  flagged: false, // Automatically saved as integer 0 in SQLite
}

playerTable.insert(profile)
```

Returns `this` for chaining.

---

#### `findOne(<column>, <value>)`

Searches the specified column for a matching value and returns the **first** row object found, or `undefined` if no match exists.

```js
const player = cacApi.database.tools.table("players").findOne("steamId", "1234567890987654321")
```

---

#### `find(<column>, <value>)`

Searches the specified column and returns an **array** of all matching row objects. Returns an empty array if no rows match.

```js
const flagged = cacApi.database.tools.table("players").find("flagged", 1)
```

---

#### `update(<column>, <value>, <object>)`

Finds all rows where `<column>` equals `<value>` and applies the key/value pairs in `<object>` as column updates. Does nothing if no row matches.

```js
// Only changes the 'flagged' column for this specific user
cacApi.database.tools.table("players").update("steamId", "1234567890987654321", { flagged: true })
```

Returns `this` for chaining.

---

#### `upsert(<column>, <value>, <object>)`

A non-destructive operation that checks for an existing record first:

- **Match found** — calls `.update(<column>, <value>, <object>)`.
- **No match** — merges `{ [column]: value }` into `<object>` and calls `.insert(...)`.

```js
// Updates tokens to 100 if the user exists, or creates a new row if missing
cacApi.database.tools.table("wallet").upsert("steamId", "1234567890987654321", { tokens: 100 })
```

Returns `this` for chaining.

---

## Internal Type Conversions

To ensure compatibility with standard SQLite data types, the engine applies automatic coercions:

- **Booleans:** JavaScript `true`/`false` values passed through `insert`, `update`, or `upsert` are written to the database as `1`/`0`. They are **not** automatically re-converted back to booleans on read — `findOne` and `find` return raw SQLite integers (`1` or `0`).
- **Strings / Numbers:** Values map accurately against `TEXT`, `INTEGER`, or `REAL` column types as defined during column creation.

---

## Method Chaining Reference

Most tool methods return `this`, allowing full operation chaining on a single table context:

```js
cacApi.database.tools
  .table("players")
  .createColumn("steamId", "string unique")
  .createColumn("tokens", "number")
  .createColumn("flagged", "boolean")
  .insert({ steamId: "123", tokens: 500, flagged: false })
```

The following methods support chaining: `createColumn`, `deleteColumn`, `insert`, `update`, `upsert`.

The following methods **do not** chain (they return data): `findOne`, `find`.
