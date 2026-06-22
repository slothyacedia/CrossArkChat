module.exports = {
  name: "Database",
  version: "v1.0.2",

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

    const existingTables = db
      .prepare(
        `
      SELECT name FROM sqlite_master 
      WHERE type='table' AND name NOT LIKE 'sqlite_%'
    `,
      )
      .all()

    const initializedTables = new Set(existingTables.map((table) => table.name))

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
      table(name) {
        const cleanTable = provisionTable(name)

        return {
          createColumn(name, type = "string") {
            const cleanCol = name.replace(/[^a-zA-Z0-9_]/g, "")
            const typeString = type.toLowerCase()

            let isUnique = typeString.includes("unique")

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

            const baseTypeKeyword = typeString.replace("unique", "").trim()
            let targetType = typeMap[baseTypeKeyword] || "TEXT"

            try {
              db.prepare(`ALTER TABLE ${cleanTable} ADD COLUMN ${cleanCol} ${targetType}`).run()

              if (isUnique) {
                db.prepare(`CREATE UNIQUE INDEX IF NOT EXISTS idx_${cleanTable}_${cleanCol} ON ${cleanTable} (${cleanCol})`).run()
              }
            } catch (err) {
              if (!err.message.includes("duplicate column name")) {
                console.log(`[dbTools:${cleanTable}] Error adding column ${cleanCol}:`, err.message)
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

            const values = Object.values(object).map((val) => {
              if (typeof val === "boolean") return val ? 1 : 0
              return val
            })

            db.prepare(`INSERT INTO ${cleanTable} (${keys.join(", ")}) VALUES (${placeholders})`).run(...values)
            return this
          },

          findOne(column, value) {
            const cleanCol = column.replace(/[^a-zA-Z0-9_]/g, "")
            return db.prepare(`SELECT * FROM ${cleanTable} WHERE ${cleanCol} = ?`).get(value)
          },

          find(column, value) {
            const cleanCol = column.replace(/[^a-zA-Z0-9_]/g, "")
            return db.prepare(`SELECT * FROM ${cleanTable} WHERE ${cleanCol} = ?`).all(value)
          },

          allRows() {
            return db.prepare(`SELECT * FROM ${cleanTable}`).all()
          },

          update(column, value, object) {
            const cleanWhere = column.replace(/[^a-zA-Z0-9_]/g, "")
            const keys = Object.keys(object)
              .map((k) => `${k.replace(/[^a-zA-Z0-9_]/g, "")} = ?`)
              .join(", ")

            const values = [
              ...Object.values(object).map((val) => {
                if (typeof val === "boolean") return val ? 1 : 0
                return val
              }),
              value,
            ]

            db.prepare(`UPDATE ${cleanTable} SET ${keys} WHERE ${cleanWhere} = ?`).run(...values)
            return this
          },

          upsert(column, value, object) {
            const cleanWhere = column.replace(/[^a-zA-Z0-9_]/g, "")
            const recordExists = this.findOne(cleanWhere, value)

            if (recordExists) {
              this.update(cleanWhere, value, object)
            } else {
              const fullPayload = {
                ...object,
                [cleanWhere]: value,
              }
              this.insert(fullPayload)
            }
            return this
          },
        }
      },
    }

    databaseAPI.tools.createTable = databaseAPI.tools.table

    databaseAPI._rawConnection = db
    cacApi.database = databaseAPI
  },
}
