import type { DatabaseSync } from "node:sqlite";

/** Restores the exact Telegram receipt shape that existed before migration v30. */
export function downgradeTelegramDeliveryReconciliationSchemaToV29(database: DatabaseSync): void {
  database.exec(`
    BEGIN IMMEDIATE;
    DROP INDEX telegram_inbound_receipts_expiry;
    DROP INDEX telegram_outbound_deliveries_update;
    ALTER TABLE telegram_inbound_receipts RENAME TO telegram_inbound_receipts_v30_fixture;
    CREATE TABLE telegram_inbound_receipts (
      update_id TEXT PRIMARY KEY,
      action_fingerprint TEXT NOT NULL,
      identity_binding TEXT NOT NULL,
      action_kind TEXT NOT NULL,
      processing_state TEXT NOT NULL CHECK (processing_state IN ('RECEIVED', 'COMPLETED', 'REJECTED')),
      received_at TEXT NOT NULL,
      expires_at TEXT NOT NULL,
      command_id TEXT
    ) STRICT;
    INSERT INTO telegram_inbound_receipts
      SELECT update_id, action_fingerprint, identity_binding, action_kind, processing_state, received_at, expires_at, command_id
      FROM telegram_inbound_receipts_v30_fixture;
    DROP TABLE telegram_inbound_receipts_v30_fixture;
    CREATE INDEX telegram_inbound_receipts_expiry ON telegram_inbound_receipts (expires_at, update_id);
    DELETE FROM schema_migrations WHERE version = 30;
    PRAGMA user_version = 29;
    COMMIT;
  `);
}
