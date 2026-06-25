CREATE TRIGGER IF NOT EXISTS trip_lodgings_prevent_overlap_insert
BEFORE INSERT ON trip_lodgings
WHEN EXISTS (
  SELECT 1
  FROM trip_lodgings existing
  WHERE existing.room_id = NEW.room_id
    AND existing.check_in_date < NEW.check_out_date
    AND existing.check_out_date > NEW.check_in_date
)
BEGIN
  SELECT RAISE(ABORT, 'lodging_date_conflict');
END;

CREATE TRIGGER IF NOT EXISTS trip_lodgings_prevent_overlap_update
BEFORE UPDATE OF room_id, check_in_date, check_out_date ON trip_lodgings
WHEN EXISTS (
  SELECT 1
  FROM trip_lodgings existing
  WHERE existing.room_id = NEW.room_id
    AND existing.id <> NEW.id
    AND existing.check_in_date < NEW.check_out_date
    AND existing.check_out_date > NEW.check_in_date
)
BEGIN
  SELECT RAISE(ABORT, 'lodging_date_conflict');
END;
