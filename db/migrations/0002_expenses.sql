PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS expense_rooms (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  name TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS expense_participants (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT,
  name TEXT NOT NULL,
  kind TEXT NOT NULL CHECK (kind IN ('user', 'guest')),
  role TEXT NOT NULL CHECK (role IN ('owner', 'member', 'guest')),
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES expense_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS idx_expense_participants_room_user
  ON expense_participants (room_id, user_id)
  WHERE user_id IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_expense_participants_user_updated
  ON expense_participants (user_id, updated_at DESC)
  WHERE user_id IS NOT NULL;

CREATE TABLE IF NOT EXISTS expense_items (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  payer_participant_id TEXT NOT NULL,
  description TEXT NOT NULL,
  amount_cents INTEGER NOT NULL CHECK (amount_cents > 0),
  created_by_user_id TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES expense_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (payer_participant_id) REFERENCES expense_participants(id) ON DELETE RESTRICT,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_expense_items_room_updated
  ON expense_items (room_id, updated_at DESC);

CREATE TABLE IF NOT EXISTS expense_item_splits (
  item_id TEXT NOT NULL,
  participant_id TEXT NOT NULL,
  share_units INTEGER NOT NULL CHECK (share_units > 0),
  PRIMARY KEY (item_id, participant_id),
  FOREIGN KEY (item_id) REFERENCES expense_items(id) ON DELETE CASCADE,
  FOREIGN KEY (participant_id) REFERENCES expense_participants(id) ON DELETE CASCADE
);
