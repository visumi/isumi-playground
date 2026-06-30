CREATE TABLE IF NOT EXISTS trip_flight_connections_next (
  id TEXT PRIMARY KEY,
  flight_id TEXT NOT NULL,
  departure_airport TEXT NOT NULL,
  arrival_airport TEXT NOT NULL,
  departure_at TEXT NOT NULL,
  arrival_at TEXT NOT NULL,
  airline TEXT,
  flight_number TEXT,
  layover_minutes INTEGER NOT NULL CHECK (layover_minutes >= 0 AND layover_minutes <= 2880),
  position INTEGER NOT NULL DEFAULT 0,
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (flight_id) REFERENCES trip_flight_segments(id) ON DELETE CASCADE
);

INSERT OR IGNORE INTO trip_flight_connections_next (
  id,
  flight_id,
  departure_airport,
  arrival_airport,
  departure_at,
  arrival_at,
  airline,
  flight_number,
  layover_minutes,
  position,
  version,
  created_at,
  updated_at
)
SELECT
  id,
  flight_id,
  departure_airport,
  arrival_airport,
  departure_at,
  arrival_at,
  airline,
  flight_number,
  layover_minutes,
  0,
  version,
  created_at,
  updated_at
FROM trip_flight_connections;

DROP TABLE trip_flight_connections;

ALTER TABLE trip_flight_connections_next RENAME TO trip_flight_connections;

CREATE INDEX IF NOT EXISTS idx_trip_flight_connections_flight
  ON trip_flight_connections (flight_id, position);
