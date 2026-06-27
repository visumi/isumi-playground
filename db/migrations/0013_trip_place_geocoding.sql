ALTER TABLE trip_places ADD COLUMN latitude REAL;
ALTER TABLE trip_places ADD COLUMN longitude REAL;
ALTER TABLE trip_places ADD COLUMN geocoded_address TEXT;
ALTER TABLE trip_places ADD COLUMN geocoded_at TEXT;
ALTER TABLE trip_places ADD COLUMN geocoding_status TEXT;

CREATE INDEX IF NOT EXISTS idx_trip_places_room_geocoding
  ON trip_places (room_id, geocoding_status);
