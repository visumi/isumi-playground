ALTER TABLE trip_rooms ADD COLUMN public_share_token TEXT;

CREATE UNIQUE INDEX IF NOT EXISTS idx_trip_rooms_public_share_token
  ON trip_rooms (public_share_token)
  WHERE public_share_token IS NOT NULL;
