CREATE TABLE IF NOT EXISTS trip_flight_connections (
  id TEXT PRIMARY KEY,
  flight_id TEXT NOT NULL UNIQUE,
  departure_airport TEXT NOT NULL,
  arrival_airport TEXT NOT NULL,
  departure_at TEXT NOT NULL,
  arrival_at TEXT NOT NULL,
  airline TEXT,
  flight_number TEXT,
  layover_minutes INTEGER NOT NULL CHECK (layover_minutes >= 0 AND layover_minutes <= 2880),
  version INTEGER NOT NULL DEFAULT 1,
  created_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  updated_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (flight_id) REFERENCES trip_flight_segments(id) ON DELETE CASCADE
);

WITH candidates AS (
  SELECT
    connection.id AS connection_id,
    main.id AS flight_id,
    connection.departure_airport,
    connection.arrival_airport,
    connection.departure_at,
    connection.arrival_at,
    connection.airline,
    connection.flight_number,
    connection.version,
    connection.created_at,
    connection.updated_at,
    MAX(0, CAST(ROUND((julianday(connection.departure_at) - julianday(main.arrival_at)) * 1440) AS INTEGER)) AS layover_minutes,
    ABS((julianday(connection.departure_at) - julianday(main.arrival_at)) * 1440) AS proximity_minutes
  FROM trip_flight_segments connection
  INNER JOIN trip_flight_segments main
    ON main.room_id = connection.room_id
   AND main.direction IN ('outbound', 'return')
  WHERE connection.direction = 'other'
),
nearest_connection AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY connection_id
      ORDER BY proximity_minutes, departure_at, flight_id
    ) AS connection_rank
  FROM candidates
),
selected_connection AS (
  SELECT
    *,
    ROW_NUMBER() OVER (
      PARTITION BY flight_id
      ORDER BY proximity_minutes, departure_at, connection_id
    ) AS flight_rank
  FROM nearest_connection
  WHERE connection_rank = 1
)
INSERT OR IGNORE INTO trip_flight_connections (
  id,
  flight_id,
  departure_airport,
  arrival_airport,
  departure_at,
  arrival_at,
  airline,
  flight_number,
  layover_minutes,
  version,
  created_at,
  updated_at
)
SELECT
  connection_id,
  flight_id,
  departure_airport,
  arrival_airport,
  departure_at,
  arrival_at,
  airline,
  flight_number,
  layover_minutes,
  version,
  created_at,
  updated_at
FROM selected_connection
WHERE flight_rank = 1;

DELETE FROM trip_flight_segments
WHERE id IN (SELECT id FROM trip_flight_connections);

UPDATE trip_flight_segments
SET direction = 'outbound',
    updated_at = CURRENT_TIMESTAMP
WHERE direction = 'other';

CREATE INDEX IF NOT EXISTS idx_trip_flight_connections_flight
  ON trip_flight_connections (flight_id);
