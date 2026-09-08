PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS expense_item_payments (
  item_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_by_user_id TEXT NOT NULL,
  PRIMARY KEY (item_id, participant_id),
  FOREIGN KEY (item_id) REFERENCES expense_items(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES expense_participants(id) ON DELETE CASCADE,
  FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_expense_item_payments_participant
  ON expense_item_payments (participant_id, paid_at DESC);
