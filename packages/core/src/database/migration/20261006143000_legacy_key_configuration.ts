import { sql } from "drizzle-orm"
import { Effect, Option, Schema, Struct } from "effect"
import { Credential } from "@opencode/schema/credential"
import type { DatabaseMigration } from "../migration.js"

// The legacy credential import used to keep V1 connect-form answers, such as an Azure resource name, as API key
// metadata. V2 keeps form answers as API key configuration, where provider plugins read them. V1 metadata held only
// strings, so other metadata is left alone.
const decodeImportedKey = Schema.decodeUnknownOption(
  Schema.fromJsonString(
    Schema.Struct({ ...Credential.Key.fields, metadata: Schema.Record(Schema.String, Schema.String) }),
  ),
)

const migration: DatabaseMigration.Migration = {
  id: "20261006143000_legacy_key_configuration",
  up(tx) {
    return Effect.gen(function* () {
      const rows = yield* tx.all<{ id: string; value: string }>(sql`SELECT id, value FROM credential`)
      yield* Effect.forEach(rows, (row) => {
        const key = Option.getOrUndefined(decodeImportedKey(row.value))
        if (!key) return Effect.void
        return tx.run(sql`
          UPDATE credential
          SET value = ${JSON.stringify(
            Credential.Key.make({
              ...Struct.omit(key, ["metadata"]),
              configuration: { ...key.metadata, ...key.configuration },
            }),
          )}
          WHERE id = ${row.id}
        `)
      })
    })
  },
}

export default migration
