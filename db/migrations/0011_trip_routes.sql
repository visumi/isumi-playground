PRAGMA foreign_keys = OFF;

DROP TABLE IF EXISTS trip_place_images;

CREATE TABLE IF NOT EXISTS trip_day_items_next (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  day_id TEXT NOT NULL,
  place_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES trip_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (day_id) REFERENCES trip_days(id) ON DELETE CASCADE,
  FOREIGN KEY (place_id) REFERENCES trip_places(id) ON DELETE CASCADE
);

INSERT INTO trip_day_items_next (
  id, room_id, day_id, place_id, position, version, created_at, updated_at
)
SELECT id, room_id, day_id, place_id, position, version, created_at, updated_at
FROM trip_day_items;

DROP TABLE trip_day_items;
ALTER TABLE trip_day_items_next RENAME TO trip_day_items;

CREATE INDEX IF NOT EXISTS idx_trip_day_items_day_position
  ON trip_day_items (day_id, position);

CREATE TABLE IF NOT EXISTS trip_routes (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  from_item_id TEXT NOT NULL,
  to_item_id TEXT NOT NULL,
  transport_mode TEXT NOT NULL CHECK (transport_mode IN ('walk', 'car', 'transit', 'other')),
  duration_minutes INTEGER NOT NULL CHECK (duration_minutes BETWEEN 1 AND 1440),
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (room_id, from_item_id, to_item_id),
  FOREIGN KEY (room_id) REFERENCES trip_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (from_item_id) REFERENCES trip_day_items(id) ON DELETE CASCADE,
  FOREIGN KEY (to_item_id) REFERENCES trip_day_items(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trip_routes_room_pair
  ON trip_routes (room_id, from_item_id, to_item_id);

PRAGMA foreign_keys = ON;
