PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS trip_rooms (
  id TEXT PRIMARY KEY,
  owner_user_id TEXT NOT NULL,
  title TEXT NOT NULL,
  destination TEXT NOT NULL,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  timezone TEXT NOT NULL DEFAULT 'America/Sao_Paulo',
  revision INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (owner_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trip_members (
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  role TEXT NOT NULL CHECK (role IN ('owner', 'member')),
  joined_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (room_id, user_id),
  FOREIGN KEY (room_id) REFERENCES trip_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trip_days (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  date TEXT NOT NULL,
  position INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  UNIQUE (room_id, date),
  FOREIGN KEY (room_id) REFERENCES trip_rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trip_places (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT 'other',
  address TEXT,
  notes TEXT,
  created_by_user_id TEXT NOT NULL,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES trip_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (created_by_user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trip_place_images (
  place_id TEXT PRIMARY KEY,
  content_type TEXT NOT NULL CHECK (content_type = 'image/webp'),
  byte_size INTEGER NOT NULL CHECK (byte_size > 0 AND byte_size <= 1048576),
  data BLOB NOT NULL,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (place_id) REFERENCES trip_places(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trip_day_items (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  day_id TEXT NOT NULL,
  place_id TEXT NOT NULL,
  position INTEGER NOT NULL,
  duration_minutes INTEGER NOT NULL DEFAULT 60 CHECK (duration_minutes BETWEEN 15 AND 1440),
  transport_mode TEXT CHECK (transport_mode IN ('walk', 'car', 'transit', 'other')),
  transport_minutes INTEGER CHECK (transport_minutes IS NULL OR transport_minutes BETWEEN 1 AND 1440),
  transport_notes TEXT,
  transport_needs_review INTEGER NOT NULL DEFAULT 0 CHECK (transport_needs_review IN (0, 1)),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES trip_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (day_id) REFERENCES trip_days(id) ON DELETE CASCADE,
  FOREIGN KEY (place_id) REFERENCES trip_places(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trip_flight_segments (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  direction TEXT NOT NULL DEFAULT 'other' CHECK (direction IN ('outbound', 'return', 'other')),
  departure_airport TEXT NOT NULL,
  arrival_airport TEXT NOT NULL,
  departure_at TEXT NOT NULL,
  arrival_at TEXT NOT NULL,
  airline TEXT,
  flight_number TEXT,
  position INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES trip_rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trip_lodgings (
  id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  name TEXT NOT NULL,
  address TEXT,
  check_in_date TEXT NOT NULL,
  check_out_date TEXT NOT NULL,
  notes TEXT,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES trip_rooms(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS trip_operations (
  operation_id TEXT PRIMARY KEY,
  room_id TEXT NOT NULL,
  user_id TEXT NOT NULL,
  operation_type TEXT NOT NULL,
  room_revision INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (room_id) REFERENCES trip_rooms(id) ON DELETE CASCADE,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE INDEX IF NOT EXISTS idx_trip_rooms_owner_updated
  ON trip_rooms (owner_user_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_members_user
  ON trip_members (user_id, joined_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_days_room_position
  ON trip_days (room_id, position);
CREATE INDEX IF NOT EXISTS idx_trip_places_room_updated
  ON trip_places (room_id, updated_at DESC);
CREATE INDEX IF NOT EXISTS idx_trip_day_items_day_position
  ON trip_day_items (day_id, position);
CREATE INDEX IF NOT EXISTS idx_trip_flights_room_position
  ON trip_flight_segments (room_id, position);
CREATE INDEX IF NOT EXISTS idx_trip_lodgings_room_dates
  ON trip_lodgings (room_id, check_in_date, check_out_date);
CREATE INDEX IF NOT EXISTS idx_trip_operations_room_created
  ON trip_operations (room_id, created_at DESC);
