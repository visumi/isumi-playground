PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS expense_paid_settlements (
  room_id TEXT NOT NULL,
  from_participant_id TEXT NOT NULL,
  to_participant_id TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  paid_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  paid_by_user_id TEXT NOT NULL,
  PRIMARY KEY (room_id, from_participant_id, to_participant_id),
  FOREIGN KEY (room_id) REFERENCES expense_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (from_participant_id) REFERENCES expense_participants(id) ON DELETE CASCADE,
  FOREIGN KEY (to_participant_id) REFERENCES expense_participants(id) ON DELETE CASCADE,
  FOREIGN KEY (paid_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);
