PRAGMA foreign_keys = OFF;

CREATE TABLE trip_routes_next (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  from_item_id TEXT,
  from_lodging_id TEXT,
  to_item_id TEXT,
  to_lodging_id TEXT,
  transport_mode TEXT NOT NULL CHECK (transport_mode IN ('walk', 'car', 'transit', 'other')),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CHECK (
    (from_item_id IS NOT NULL AND from_lodging_id IS NULL)
    OR (from_item_id IS NULL AND from_lodging_id IS NOT NULL)
  ),
  CHECK (
    (to_item_id IS NOT NULL AND to_lodging_id IS NULL)
    OR (to_item_id IS NULL AND to_lodging_id IS NOT NULL)
  ),
  FOREIGN KEY (room_id) REFERENCES trip_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (from_item_id) REFERENCES trip_day_items(id) ON DELETE CASCADE,
  FOREIGN KEY (from_lodging_id) REFERENCES trip_lodgings(id) ON DELETE CASCADE,
  FOREIGN KEY (to_item_id) REFERENCES trip_day_items(id) ON DELETE CASCADE,
  FOREIGN KEY (to_lodging_id) REFERENCES trip_lodgings(id) ON DELETE CASCADE
);

INSERT INTO trip_routes_next (
  id, room_id, from_item_id, from_lodging_id, to_item_id, to_lodging_id,
  transport_mode, version, created_at, updated_at
)
SELECT
  id, room_id, from_item_id, from_lodging_id, to_item_id, to_lodging_id,
  transport_mode, version, created_at, updated_at
FROM trip_routes;

DROP TABLE trip_routes;
ALTER TABLE trip_routes_next RENAME TO trip_routes;

CREATE UNIQUE INDEX idx_trip_routes_room_item_to_item_pair
  ON trip_routes (room_id, from_item_id, to_item_id)
  WHERE from_item_id IS NOT NULL AND to_item_id IS NOT NULL;

CREATE UNIQUE INDEX idx_trip_routes_room_lodging_to_item_pair
  ON trip_routes (room_id, from_lodging_id, to_item_id)
  WHERE from_lodging_id IS NOT NULL AND to_item_id IS NOT NULL;

CREATE UNIQUE INDEX idx_trip_routes_room_item_to_lodging_pair
  ON trip_routes (room_id, from_item_id, to_lodging_id)
  WHERE from_item_id IS NOT NULL AND to_lodging_id IS NOT NULL;

CREATE UNIQUE INDEX idx_trip_routes_room_lodging_to_lodging_pair
  ON trip_routes (room_id, from_lodging_id, to_lodging_id)
  WHERE from_lodging_id IS NOT NULL AND to_lodging_id IS NOT NULL;

CREATE INDEX idx_trip_routes_room_pair
  ON trip_routes (room_id, from_item_id, from_lodging_id, to_item_id, to_lodging_id);

PRAGMA foreign_keys = ON;
