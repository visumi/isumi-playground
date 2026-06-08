PRAGMA foreign_keys = ON;

ALTER TABLE expense_participants
  ADD COLUMN is_establishment INTEGER NOT NULL DEFAULT 0 CHECK (is_establishment IN (0, 1));

CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_participants_room_establishment
  ON expense_participants (room_id)
  WHERE is_establishment = 1;
