module.exports = {
  name: "Database Engine",
  version: "v1.0.0",

  async teardown(cacApi) {
    if (cacApi.database) {
      if (cacApi.database._rawConnection) {
        cacApi.database._rawConnection.close()
      }
      delete cacApi.database
    }
  },

  async setup(cacApi) {
    const path = cacApi.utils.modules.path
    const Database = await cacApi.utils.modMan.require("better-sqlite3")
    const db = new Database(path.join(__dirname, "database.sqlite"))

    const initializedTables = new Set()

    const provisionTable = (tableName) => {
      const cleanName = tableName.replace(/[^a-zA-Z0-9_]/g, "")
      if (!initializedTables.has(cleanName)) {
        db.prepare(`CREATE TABLE IF NOT EXISTS ${cleanName} (_rowId INTEGER PRIMARY KEY AUTOINCREMENT)`).run()
        initializedTables.add(cleanName)
      }
      return cleanName
    }

    const databaseAPI = function (tableName) {
      const cleanName = provisionTable(tableName)
      return db
    }

    databaseAPI.tools = {
      createTable(name) {
        const cleanTable = provisionTable(name)

        return {
          createColumn(name, type = "string") {
            const cleanCol = name.replace(/[^a-zA-Z0-9_]/g, "")

            const typeMap = {
              string: "TEXT",
              text: "TEXT",
              number: "INTEGER",
              int: "INTEGER",
              integer: "INTEGER",
              real: "REAL",
              float: "REAL",
              boolean: "INTEGER",
              bool: "INTEGER",
            }

            let targetType = typeMap[type.toLowerCase()]

            if (!targetType) {
              console.log(`[Database:${cleanTable}] Unknown type "${type}" passed for column "${name}". Defaulting to "string" (TEXT).`)
              targetType = "TEXT"
            }

            try {
              db.prepare(`ALTER TABLE ${cleanTable} ADD COLUMN ${cleanCol} ${targetType}`).run()
            } catch (err) {
              if (!err.message.includes("duplicate column name")) {
                console.log(`[Database:${cleanTable}] Error adding column ${cleanCol}:`, err.message)
              }
            }
            return this
          },

          deleteColumn(name) {
            const cleanCol = name.replace(/[^a-zA-Z0-9_]/g, "")
            try {
              db.prepare(`ALTER TABLE ${cleanTable} DROP COLUMN ${cleanCol}`).run()
            } catch (err) {
              if (!err.message.includes("no such column")) {
                console.log(`[dbTools:${cleanTable}] Error:`, err.message)
              }
            }
            return this
          },

          insert(object) {
            const keys = Object.keys(object).map((k) => k.replace(/[^a-zA-Z0-9_]/g, ""))
            const placeholders = keys.map(() => "?").join(", ")
            const values = Object.values(object)
            db.prepare(`INSERT INTO ${cleanTable} (${keys.join(", ")}) VALUES (${placeholders})`).run(...values)
            return this
          },

          findOne(key, value) {
            const cleanCol = key.replace(/[^a-zA-Z0-9_]/g, "")
            return db.prepare(`SELECT * FROM ${cleanTable} WHERE ${cleanCol} = ?`).get(value)
          },

          find(key, value) {
            const cleanCol = key.replace(/[^a-zA-Z0-9_]/g, "")
            return db.prepare(`SELECT * FROM ${cleanTable} WHERE ${cleanCol} = ?`).all(value)
          },

          update(column, value, newValue) {
            const cleanWhere = column.replace(/[^a-zA-Z0-9_]/g, "")
            const keys = Object.keys(newValue)
              .map((k) => `${k.replace(/[^a-zA-Z0-9_]/g, "")} = ?`)
              .join(", ")
            const values = [...Object.values(newValue), value]
            db.prepare(`UPDATE ${cleanTable} SET ${keys} WHERE ${cleanWhere} = ?`).run(...values)
            return this
          },
        }
      },
    }

    databaseAPI._rawConnection = db
    cacApi.database = databaseAPI
  },
}
