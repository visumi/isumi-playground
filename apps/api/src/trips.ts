import type { Client, InStatement, Row } from "@libsql/client/web";
import type { AuthUser } from "./shared";
import { executeStatementsAtomically, HttpError, toUtcIsoTimestamp } from "./shared";

export type TripPlaceCategory = "food" | "culture" | "nightlife" | "nature" | "shopping" | "other";
export type TripTransportMode = "walk" | "car" | "transit" | "other";

export interface TripRoomInput {
  title?: string;
  destination?: string;
  startDate?: string;
  endDate?: string;
  timezone?: string;
}

export interface TripPlaceInput {
  name?: string;
  category?: TripPlaceCategory;
  address?: string | null;
  notes?: string | null;
  version?: number;
}

export interface TripDayItemInput {
  dayId?: string;
  placeId?: string;
  position?: number;
  durationMinutes?: number;
  transportMode?: TripTransportMode | null;
  transportMinutes?: number | null;
  transportNotes?: string | null;
  version?: number;
}

export interface TripFlightInput {
  direction?: "outbound" | "return" | "other";
  departureAirport?: string;
  arrivalAirport?: string;
  departureAt?: string;
  arrivalAt?: string;
  airline?: string | null;
  flightNumber?: string | null;
  version?: number;
}

export interface TripLodgingInput {
  name?: string;
  address?: string | null;
  checkInDate?: string;
  checkOutDate?: string;
  notes?: string | null;
  version?: number;
}

export interface TripMoveOperation {
  operationId: string;
  type: "move_item";
  entityVersion: number;
  itemId: string;
  targetDayId: string;
  targetPosition: number;
}

interface TripRoomRow extends Row {
  id: string;
  owner_user_id: string;
  title: string;
  destination: string;
  start_date: string;
  end_date: string;
  timezone: string;
  revision: number;
  created_at: string;
  updated_at: string;
}

export async function listTripRooms(db: Client, userId: string) {
  const result = await db.execute({
    sql: `
      SELECT r.id, r.owner_user_id, r.title, r.destination, r.start_date, r.end_date,
             r.timezone, r.revision, r.created_at, r.updated_at
      FROM trip_rooms r
      INNER JOIN trip_members m ON m.room_id = r.id
      WHERE m.user_id = ?
      ORDER BY r.updated_at DESC
    `,
    args: [userId]
  });
  return result.rows.map((row) => mapRoom(row as TripRoomRow));
}

export async function createTripRoom(db: Client, user: AuthUser, payload: TripRoomInput) {
  const roomId = crypto.randomUUID();
  const title = text(payload.title, "Nova viagem", 120);
  const destination = text(payload.destination, "Destino a definir", 160);
  const startDate = date(payload.startDate, "start_date");
  const endDate = date(payload.endDate, "end_date");
  const timezone = text(payload.timezone, "America/Sao_Paulo", 80);

  if (endDate < startDate) {
    throw new HttpError(400, "invalid_date_range");
  }

  const statements: InStatement[] = [
    {
      sql: `
        INSERT INTO trip_rooms
          (id, owner_user_id, title, destination, start_date, end_date, timezone)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [roomId, user.uid, title, destination, startDate, endDate, timezone]
    },
    {
      sql: "INSERT INTO trip_members (room_id, user_id, role) VALUES (?, ?, 'owner')",
      args: [roomId, user.uid]
    }
  ];

  for (const [position, dayDate] of enumerateTripDates(startDate, endDate).entries()) {
    statements.push({
      sql: "INSERT INTO trip_days (id, room_id, date, position) VALUES (?, ?, ?, ?)",
      args: [crypto.randomUUID(), roomId, dayDate, position]
    });
  }

  await executeStatementsAtomically(db, statements);
  return getTripSnapshot(db, user.uid, roomId);
}

export async function getTripSnapshot(db: Client, userId: string, roomId: string) {
  const member = await assertTripMember(db, roomId, userId);
  const roomResult = await db.execute({
    sql: `
      SELECT id, owner_user_id, title, destination, start_date, end_date, timezone,
             revision, created_at, updated_at
      FROM trip_rooms WHERE id = ? LIMIT 1
    `,
    args: [roomId]
  });
  const room = roomResult.rows[0] as TripRoomRow | undefined;
  if (!room) throw new HttpError(404, "not_found");

  const [members, days, places, items, flights, lodgings] = await Promise.all([
    db.execute({
      sql: `
        SELECT m.user_id, m.role, m.joined_at, u.email, u.name, u.picture
        FROM trip_members m INNER JOIN users u ON u.id = m.user_id
        WHERE m.room_id = ? ORDER BY m.role DESC, m.joined_at
      `,
      args: [roomId]
    }),
    db.execute({ sql: "SELECT id, date, position FROM trip_days WHERE room_id = ? ORDER BY position", args: [roomId] }),
    db.execute({
      sql: `
        SELECT p.id, p.name, p.category, p.address, p.notes, p.created_by_user_id,
               p.version, p.created_at, p.updated_at,
               CASE WHEN i.place_id IS NULL THEN 0 ELSE 1 END AS has_image
        FROM trip_places p LEFT JOIN trip_place_images i ON i.place_id = p.id
        WHERE p.room_id = ? ORDER BY p.created_at, p.id
      `,
      args: [roomId]
    }),
    db.execute({
      sql: `
        SELECT id, day_id, place_id, position, duration_minutes, transport_mode,
               transport_minutes, transport_notes, version
        FROM trip_day_items WHERE room_id = ? ORDER BY day_id, position
      `,
      args: [roomId]
    }),
    db.execute({
      sql: `
        SELECT id, direction, departure_airport, arrival_airport, departure_at, arrival_at,
               airline, flight_number, position, version
        FROM trip_flight_segments WHERE room_id = ? ORDER BY departure_at, position
      `,
      args: [roomId]
    }),
    db.execute({
      sql: `
        SELECT id, name, address, check_in_date, check_out_date, notes, version
        FROM trip_lodgings WHERE room_id = ? ORDER BY check_in_date
      `,
      args: [roomId]
    })
  ]);

  return {
    room: mapRoom(room),
    currentMemberRole: member.role,
    members: members.rows.map((row) => ({
      userId: String(row.user_id),
      role: String(row.role),
      email: String(row.email),
      name: row.name ? String(row.name) : null,
      picture: row.picture ? String(row.picture) : null,
      joinedAt: toUtcIsoTimestamp(String(row.joined_at))
    })),
    days: days.rows.map((row) => ({
      id: String(row.id),
      date: String(row.date),
      position: Number(row.position)
    })),
    places: places.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      category: String(row.category),
      address: row.address ? String(row.address) : null,
      notes: row.notes ? String(row.notes) : null,
      createdByUserId: String(row.created_by_user_id),
      version: Number(row.version),
      hasImage: Number(row.has_image) === 1,
      createdAt: toUtcIsoTimestamp(String(row.created_at)),
      updatedAt: toUtcIsoTimestamp(String(row.updated_at))
    })),
    items: items.rows.map((row) => ({
      id: String(row.id),
      dayId: String(row.day_id),
      placeId: String(row.place_id),
      position: Number(row.position),
      durationMinutes: Number(row.duration_minutes),
      transportMode: row.transport_mode ? String(row.transport_mode) : null,
      transportMinutes: row.transport_minutes === null ? null : Number(row.transport_minutes),
      transportNotes: row.transport_notes ? String(row.transport_notes) : null,
      version: Number(row.version)
    })),
    flights: flights.rows.map((row) => ({
      id: String(row.id),
      direction: String(row.direction),
      departureAirport: String(row.departure_airport),
      arrivalAirport: String(row.arrival_airport),
      departureAt: String(row.departure_at),
      arrivalAt: String(row.arrival_at),
      airline: row.airline ? String(row.airline) : null,
      flightNumber: row.flight_number ? String(row.flight_number) : null,
      position: Number(row.position),
      version: Number(row.version)
    })),
    lodgings: lodgings.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      address: row.address ? String(row.address) : null,
      checkInDate: String(row.check_in_date),
      checkOutDate: String(row.check_out_date),
      notes: row.notes ? String(row.notes) : null,
      version: Number(row.version)
    }))
  };
}

export async function acceptTripRoom(db: Client, userId: string, roomId: string) {
  const room = await db.execute({
    sql: "SELECT id FROM trip_rooms WHERE id = ? LIMIT 1",
    args: [roomId]
  });
  if (room.rows.length === 0) throw new HttpError(404, "not_found");

  await executeStatementsAtomically(db, [
    {
      sql: `
        INSERT INTO trip_members (room_id, user_id, role)
        VALUES (?, ?, 'member') ON CONFLICT(room_id, user_id) DO NOTHING
      `,
      args: [roomId, userId]
    },
    touchRoom(roomId)
  ]);

  return getTripSnapshot(db, userId, roomId);
}

export async function updateTripRoom(db: Client, userId: string, roomId: string, payload: TripRoomInput) {
  await assertTripOwner(db, roomId, userId);
  const currentResult = await db.execute({
    sql: "SELECT title, destination, timezone FROM trip_rooms WHERE id = ?",
    args: [roomId]
  });
  const current = currentResult.rows[0];
  if (!current) throw new HttpError(404, "not_found");

  await db.execute({
    sql: `
      UPDATE trip_rooms SET title = ?, destination = ?, timezone = ?,
        revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?
    `,
    args: [
      text(payload.title, String(current.title), 120),
      text(payload.destination, String(current.destination), 160),
      text(payload.timezone, String(current.timezone), 80),
      roomId
    ]
  });
  return getTripSnapshot(db, userId, roomId);
}

export async function deleteTripRoom(db: Client, userId: string, roomId: string): Promise<void> {
  await assertTripOwner(db, roomId, userId);
  await db.execute({ sql: "DELETE FROM trip_rooms WHERE id = ?", args: [roomId] });
}

export async function createTripPlace(db: Client, userId: string, roomId: string, payload: TripPlaceInput) {
  await assertTripMember(db, roomId, userId);
  const placeId = crypto.randomUUID();
  await executeStatementsAtomically(db, [
    {
      sql: `
        INSERT INTO trip_places (id, room_id, name, category, address, notes, created_by_user_id)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        placeId,
        roomId,
        requiredText(payload.name, "missing_place_name", 160),
        category(payload.category),
        nullableText(payload.address, 240),
        nullableText(payload.notes, 2000),
        userId
      ]
    },
    touchRoom(roomId)
  ]);
  return getTripSnapshot(db, userId, roomId);
}

export async function updateTripPlace(db: Client, userId: string, roomId: string, placeId: string, payload: TripPlaceInput) {
  await assertTripMember(db, roomId, userId);
  const version = integer(payload.version, "missing_entity_version", 1, Number.MAX_SAFE_INTEGER);
  const result = await db.execute({
    sql: `
      UPDATE trip_places SET name = ?, category = ?, address = ?, notes = ?,
        version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND room_id = ? AND version = ?
    `,
    args: [
      requiredText(payload.name, "missing_place_name", 160),
      category(payload.category),
      nullableText(payload.address, 240),
      nullableText(payload.notes, 2000),
      placeId,
      roomId,
      version
    ]
  });
  if (result.rowsAffected === 0) throw new HttpError(409, "entity_version_conflict");
  await db.execute(touchRoom(roomId));
  return getTripSnapshot(db, userId, roomId);
}

export async function deleteTripPlace(db: Client, userId: string, roomId: string, placeId: string): Promise<void> {
  await assertTripMember(db, roomId, userId);
  await executeStatementsAtomically(db, [
    { sql: "DELETE FROM trip_places WHERE id = ? AND room_id = ?", args: [placeId, roomId] },
    touchRoom(roomId)
  ]);
}

export async function upsertTripPlaceImage(
  db: Client,
  userId: string,
  roomId: string,
  placeId: string,
  data: Uint8Array,
  contentType: string
): Promise<void> {
  await assertTripMember(db, roomId, userId);
  if (contentType !== "image/webp") throw new HttpError(415, "image_must_be_webp");
  if (data.byteLength === 0 || data.byteLength > 1_048_576) throw new HttpError(413, "image_too_large");
  if (!isWebp(data)) throw new HttpError(400, "invalid_webp");
  const place = await db.execute({ sql: "SELECT id FROM trip_places WHERE id = ? AND room_id = ?", args: [placeId, roomId] });
  if (place.rows.length === 0) throw new HttpError(404, "not_found");

  await executeStatementsAtomically(db, [
    {
      sql: `
        INSERT INTO trip_place_images (place_id, content_type, byte_size, data, updated_at)
        VALUES (?, 'image/webp', ?, ?, CURRENT_TIMESTAMP)
        ON CONFLICT(place_id) DO UPDATE SET byte_size = excluded.byte_size,
          data = excluded.data, updated_at = CURRENT_TIMESTAMP
      `,
      args: [placeId, data.byteLength, data]
    },
    { sql: "UPDATE trip_places SET version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?", args: [placeId] },
    touchRoom(roomId)
  ]);
}

export async function getTripPlaceImage(db: Client, userId: string, roomId: string, placeId: string) {
  await assertTripMember(db, roomId, userId);
  const result = await db.execute({
    sql: `
      SELECT i.content_type, i.data
      FROM trip_place_images i INNER JOIN trip_places p ON p.id = i.place_id
      WHERE i.place_id = ? AND p.room_id = ? LIMIT 1
    `,
    args: [placeId, roomId]
  });
  const row = result.rows[0];
  if (!row) throw new HttpError(404, "not_found");
  const rawData = row.data;
  const data = rawData instanceof Uint8Array
    ? rawData
    : rawData instanceof ArrayBuffer
      ? new Uint8Array(rawData)
      : new Uint8Array();
  return { contentType: String(row.content_type), data };
}

export async function deleteTripPlaceImage(db: Client, userId: string, roomId: string, placeId: string): Promise<void> {
  await assertTripMember(db, roomId, userId);
  await executeStatementsAtomically(db, [
    {
      sql: `
        DELETE FROM trip_place_images WHERE place_id IN
          (SELECT id FROM trip_places WHERE id = ? AND room_id = ?)
      `,
      args: [placeId, roomId]
    },
    touchRoom(roomId)
  ]);
}

export async function createTripDayItem(db: Client, userId: string, roomId: string, payload: TripDayItemInput) {
  await assertTripMember(db, roomId, userId);
  const dayId = requiredText(payload.dayId, "missing_day", 64);
  const placeId = requiredText(payload.placeId, "missing_place", 64);
  await assertDayAndPlace(db, roomId, dayId, placeId);
  const position = await nextPosition(db, dayId);
  await executeStatementsAtomically(db, [
    {
      sql: `
        INSERT INTO trip_day_items
          (id, room_id, day_id, place_id, position, duration_minutes)
        VALUES (?, ?, ?, ?, ?, ?)
      `,
      args: [
        crypto.randomUUID(),
        roomId,
        dayId,
        placeId,
        position,
        integer(payload.durationMinutes ?? 60, "invalid_duration", 15, 1440)
      ]
    },
    touchRoom(roomId)
  ]);
  return getTripSnapshot(db, userId, roomId);
}

export async function updateTripDayItem(db: Client, userId: string, roomId: string, itemId: string, payload: TripDayItemInput) {
  await assertTripMember(db, roomId, userId);
  const version = integer(payload.version, "missing_entity_version", 1, Number.MAX_SAFE_INTEGER);
  const result = await db.execute({
    sql: `
      UPDATE trip_day_items SET duration_minutes = ?, transport_mode = ?,
        transport_minutes = ?, transport_notes = ?,
        version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND room_id = ? AND version = ?
    `,
    args: [
      integer(payload.durationMinutes ?? 60, "invalid_duration", 15, 1440),
      transportMode(payload.transportMode),
      nullableInteger(payload.transportMinutes, "invalid_transport_duration", 1, 1440),
      nullableText(payload.transportNotes, 500),
      itemId,
      roomId,
      version
    ]
  });
  if (result.rowsAffected === 0) throw new HttpError(409, "entity_version_conflict");
  await db.execute(touchRoom(roomId));
  return getTripSnapshot(db, userId, roomId);
}

export async function deleteTripDayItem(db: Client, userId: string, roomId: string, itemId: string): Promise<void> {
  await assertTripMember(db, roomId, userId);
  const existing = await db.execute({
    sql: "SELECT day_id FROM trip_day_items WHERE id = ? AND room_id = ?",
    args: [itemId, roomId]
  });
  if (!existing.rows[0]) throw new HttpError(404, "not_found");
  const dayId = String(existing.rows[0].day_id);
  await executeStatementsAtomically(db, [
    { sql: "DELETE FROM trip_day_items WHERE id = ? AND room_id = ?", args: [itemId, roomId] },
    ...normalizeDayPositionsStatements(dayId),
    touchRoom(roomId)
  ]);
}

export async function applyTripMoveOperation(db: Client, userId: string, roomId: string, operation: TripMoveOperation) {
  await assertTripMember(db, roomId, userId);
  const duplicate = await db.execute({
    sql: "SELECT room_revision FROM trip_operations WHERE operation_id = ? AND room_id = ?",
    args: [operation.operationId, roomId]
  });
  if (duplicate.rows[0]) return getTripSnapshot(db, userId, roomId);

  const itemResult = await db.execute({
    sql: "SELECT day_id, version FROM trip_day_items WHERE id = ? AND room_id = ?",
    args: [operation.itemId, roomId]
  });
  const item = itemResult.rows[0];
  if (!item) throw new HttpError(404, "not_found");
  if (Number(item.version) !== operation.entityVersion) throw new HttpError(409, "entity_version_conflict");
  const targetDay = await db.execute({ sql: "SELECT id FROM trip_days WHERE id = ? AND room_id = ?", args: [operation.targetDayId, roomId] });
  if (targetDay.rows.length === 0) throw new HttpError(400, "invalid_day");

  const oldDayId = String(item.day_id);
  const dayItems = await db.execute({
    sql: `
      SELECT id, day_id FROM trip_day_items
      WHERE room_id = ? AND (day_id = ? OR day_id = ?)
      ORDER BY day_id, position, id
    `,
    args: [roomId, oldDayId, operation.targetDayId]
  });
  const oldOrder = dayItems.rows
    .filter((row) => String(row.day_id) === oldDayId && String(row.id) !== operation.itemId)
    .map((row) => String(row.id));
  const targetOrder = oldDayId === operation.targetDayId
    ? oldOrder
    : dayItems.rows
      .filter((row) => String(row.day_id) === operation.targetDayId && String(row.id) !== operation.itemId)
      .map((row) => String(row.id));
  const targetPosition = Math.min(targetOrder.length, Math.max(0, Math.trunc(operation.targetPosition)));
  targetOrder.splice(targetPosition, 0, operation.itemId);
  const positionStatements: InStatement[] = [
    ...oldOrder.map((id, position) => ({
      sql: "UPDATE trip_day_items SET position = ? WHERE id = ? AND room_id = ?",
      args: [position, id, roomId]
    })),
    ...targetOrder.map((id, position) => ({
      sql: "UPDATE trip_day_items SET day_id = ?, position = ? WHERE id = ? AND room_id = ?",
      args: [operation.targetDayId, position, id, roomId]
    }))
  ];
  await executeStatementsAtomically(db, [
    {
      sql: `
        UPDATE trip_day_items SET day_id = ?, position = ?, transport_mode = NULL,
          transport_minutes = NULL, transport_notes = NULL, transport_needs_review = 0,
          version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND room_id = ? AND version = ?
      `,
      args: [operation.targetDayId, targetPosition, operation.itemId, roomId, operation.entityVersion]
    },
    {
      sql: `
        UPDATE trip_day_items SET transport_mode = NULL, transport_minutes = NULL,
          transport_notes = NULL, transport_needs_review = 0,
          version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE room_id = ? AND id <> ? AND (
          (day_id = ? AND position BETWEEN ? AND ?) OR
          (day_id = ? AND position BETWEEN ? AND ?)
        )
      `,
      args: [
        roomId,
        operation.itemId,
        oldDayId,
        Math.max(0, targetPosition - 1),
        targetPosition + 1,
        operation.targetDayId,
        Math.max(0, targetPosition - 1),
        targetPosition + 1
      ]
    },
    ...positionStatements,
    {
      sql: "UPDATE trip_rooms SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
      args: [roomId]
    },
    {
      sql: `
        INSERT INTO trip_operations
          (operation_id, room_id, user_id, operation_type, room_revision)
        SELECT ?, ?, ?, ?, revision FROM trip_rooms WHERE id = ?
      `,
      args: [operation.operationId, roomId, userId, operation.type, roomId]
    }
  ]);
  return getTripSnapshot(db, userId, roomId);
}

export async function createTripFlight(db: Client, userId: string, roomId: string, payload: TripFlightInput) {
  await assertTripMember(db, roomId, userId);
  await executeStatementsAtomically(db, [
    {
      sql: `
        INSERT INTO trip_flight_segments
          (id, room_id, direction, departure_airport, arrival_airport, departure_at,
           arrival_at, airline, flight_number, position)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        crypto.randomUUID(),
        roomId,
        flightDirection(payload.direction),
        requiredText(payload.departureAirport, "missing_departure_airport", 12),
        requiredText(payload.arrivalAirport, "missing_arrival_airport", 12),
        requiredText(payload.departureAt, "missing_departure_time", 40),
        requiredText(payload.arrivalAt, "missing_arrival_time", 40),
        nullableText(payload.airline, 120),
        nullableText(payload.flightNumber, 30),
        Date.now()
      ]
    },
    touchRoom(roomId)
  ]);
  return getTripSnapshot(db, userId, roomId);
}

export async function updateTripFlight(
  db: Client,
  userId: string,
  roomId: string,
  flightId: string,
  payload: TripFlightInput
) {
  await assertTripMember(db, roomId, userId);
  const version = integer(payload.version, "missing_entity_version", 1, Number.MAX_SAFE_INTEGER);
  const result = await db.execute({
    sql: `
      UPDATE trip_flight_segments SET direction = ?, departure_airport = ?,
        arrival_airport = ?, departure_at = ?, arrival_at = ?, airline = ?,
        flight_number = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND room_id = ? AND version = ?
    `,
    args: [
      flightDirection(payload.direction),
      requiredText(payload.departureAirport, "missing_departure_airport", 12),
      requiredText(payload.arrivalAirport, "missing_arrival_airport", 12),
      requiredText(payload.departureAt, "missing_departure_time", 40),
      requiredText(payload.arrivalAt, "missing_arrival_time", 40),
      nullableText(payload.airline, 120),
      nullableText(payload.flightNumber, 30),
      flightId,
      roomId,
      version
    ]
  });
  if (result.rowsAffected === 0) throw new HttpError(409, "entity_version_conflict");
  await db.execute(touchRoom(roomId));
  return getTripSnapshot(db, userId, roomId);
}

export async function deleteTripFlight(db: Client, userId: string, roomId: string, flightId: string): Promise<void> {
  await assertTripMember(db, roomId, userId);
  await executeStatementsAtomically(db, [
    { sql: "DELETE FROM trip_flight_segments WHERE id = ? AND room_id = ?", args: [flightId, roomId] },
    touchRoom(roomId)
  ]);
}

export async function createTripLodging(db: Client, userId: string, roomId: string, payload: TripLodgingInput) {
  await assertTripMember(db, roomId, userId);
  const checkIn = date(payload.checkInDate, "missing_check_in");
  const checkOut = date(payload.checkOutDate, "missing_check_out");
  if (checkOut <= checkIn) throw new HttpError(400, "invalid_date_range");
  await assertLodgingPeriodAvailable(db, roomId, checkIn, checkOut);
  await executeStatementsAtomically(db, [
    {
      sql: `
        INSERT INTO trip_lodgings (id, room_id, name, address, check_in_date, check_out_date, notes)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        crypto.randomUUID(),
        roomId,
        requiredText(payload.name, "missing_lodging_name", 160),
        nullableText(payload.address, 240),
        checkIn,
        checkOut,
        nullableText(payload.notes, 1000)
      ]
    },
    touchRoom(roomId)
  ]);
  return getTripSnapshot(db, userId, roomId);
}

export async function updateTripLodging(
  db: Client,
  userId: string,
  roomId: string,
  lodgingId: string,
  payload: TripLodgingInput
) {
  await assertTripMember(db, roomId, userId);
  const checkIn = date(payload.checkInDate, "missing_check_in");
  const checkOut = date(payload.checkOutDate, "missing_check_out");
  const version = integer(payload.version, "missing_entity_version", 1, Number.MAX_SAFE_INTEGER);
  if (checkOut <= checkIn) throw new HttpError(400, "invalid_date_range");
  await assertLodgingPeriodAvailable(db, roomId, checkIn, checkOut, lodgingId);

  const result = await db.execute({
    sql: `
      UPDATE trip_lodgings SET name = ?, address = ?, check_in_date = ?, check_out_date = ?,
        notes = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND room_id = ? AND version = ?
    `,
    args: [
      requiredText(payload.name, "missing_lodging_name", 160),
      nullableText(payload.address, 240),
      checkIn,
      checkOut,
      nullableText(payload.notes, 1000),
      lodgingId,
      roomId,
      version
    ]
  });
  if (result.rowsAffected === 0) throw new HttpError(409, "entity_version_conflict");
  await db.execute(touchRoom(roomId));
  return getTripSnapshot(db, userId, roomId);
}

export async function deleteTripLodging(db: Client, userId: string, roomId: string, lodgingId: string): Promise<void> {
  await assertTripMember(db, roomId, userId);
  await executeStatementsAtomically(db, [
    { sql: "DELETE FROM trip_lodgings WHERE id = ? AND room_id = ?", args: [lodgingId, roomId] },
    touchRoom(roomId)
  ]);
}

async function assertLodgingPeriodAvailable(
  db: Client,
  roomId: string,
  checkIn: string,
  checkOut: string,
  ignoredLodgingId?: string
): Promise<void> {
  const conflict = await db.execute({
    sql: `
      SELECT id FROM trip_lodgings
      WHERE room_id = ?
        AND check_in_date < ?
        AND check_out_date > ?
        AND (? IS NULL OR id <> ?)
      LIMIT 1
    `,
    args: [roomId, checkOut, checkIn, ignoredLodgingId || null, ignoredLodgingId || null]
  });
  if (conflict.rows.length > 0) throw new HttpError(409, "lodging_date_conflict");
}

export function lodgingPeriodsOverlap(
  firstCheckIn: string,
  firstCheckOut: string,
  secondCheckIn: string,
  secondCheckOut: string
): boolean {
  return firstCheckIn < secondCheckOut && firstCheckOut > secondCheckIn;
}

export async function assertTripMember(db: Client, roomId: string, userId: string): Promise<{ role: "owner" | "member" }> {
  const result = await db.execute({
    sql: "SELECT role FROM trip_members WHERE room_id = ? AND user_id = ? LIMIT 1",
    args: [roomId, userId]
  });
  const row = result.rows[0];
  if (!row) throw new HttpError(403, "trip_member_required");
  return { role: String(row.role) as "owner" | "member" };
}

async function assertTripOwner(db: Client, roomId: string, userId: string): Promise<void> {
  const member = await assertTripMember(db, roomId, userId);
  if (member.role !== "owner") throw new HttpError(403, "trip_owner_required");
}

function mapRoom(row: TripRoomRow) {
  return {
    id: row.id,
    ownerUserId: row.owner_user_id,
    title: row.title,
    destination: row.destination,
    startDate: row.start_date,
    endDate: row.end_date,
    timezone: row.timezone,
    revision: Number(row.revision),
    createdAt: toUtcIsoTimestamp(row.created_at),
    updatedAt: toUtcIsoTimestamp(row.updated_at)
  };
}

function touchRoom(roomId: string): InStatement {
  return {
    sql: "UPDATE trip_rooms SET revision = revision + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ?",
    args: [roomId]
  };
}

function normalizeDayPositionsStatements(dayId: string): InStatement[] {
  return [{
    sql: `
      UPDATE trip_day_items
      SET position = (
        SELECT COUNT(*) - 1 FROM trip_day_items sibling
        WHERE sibling.day_id = trip_day_items.day_id
          AND (sibling.position < trip_day_items.position
            OR (sibling.position = trip_day_items.position AND sibling.id <= trip_day_items.id))
      )
      WHERE day_id = ?
    `,
    args: [dayId]
  }];
}

async function nextPosition(db: Client, dayId: string): Promise<number> {
  const result = await db.execute({
    sql: "SELECT COALESCE(MAX(position), -1) + 1 AS next_position FROM trip_day_items WHERE day_id = ?",
    args: [dayId]
  });
  return Number(result.rows[0]?.next_position || 0);
}

async function assertDayAndPlace(db: Client, roomId: string, dayId: string, placeId: string): Promise<void> {
  const [day, place] = await Promise.all([
    db.execute({ sql: "SELECT id FROM trip_days WHERE id = ? AND room_id = ?", args: [dayId, roomId] }),
    db.execute({ sql: "SELECT id FROM trip_places WHERE id = ? AND room_id = ?", args: [placeId, roomId] })
  ]);
  if (day.rows.length === 0) throw new HttpError(400, "invalid_day");
  if (place.rows.length === 0) throw new HttpError(400, "invalid_place");
}

export function enumerateTripDates(startDate: string, endDate: string): string[] {
  const dates: string[] = [];
  const current = new Date(`${startDate}T12:00:00Z`);
  const end = new Date(`${endDate}T12:00:00Z`);
  while (current <= end && dates.length < 366) {
    dates.push(current.toISOString().slice(0, 10));
    current.setUTCDate(current.getUTCDate() + 1);
  }
  if (dates.length === 0 || current <= end) throw new HttpError(400, "trip_too_long");
  return dates;
}

function text(value: unknown, fallback: string, max: number): string {
  return (typeof value === "string" && value.trim() ? value.trim() : fallback).slice(0, max);
}

function requiredText(value: unknown, error: string, max: number): string {
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) throw new HttpError(400, error);
  return normalized.slice(0, max);
}

function nullableText(value: unknown, max: number): string | null {
  if (typeof value !== "string") return null;
  const normalized = value.trim();
  return normalized ? normalized.slice(0, max) : null;
}

function date(value: unknown, error: string): string {
  const normalized = requiredText(value, error, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(normalized) || Number.isNaN(Date.parse(`${normalized}T00:00:00Z`))) {
    throw new HttpError(400, error);
  }
  return normalized;
}

function integer(value: unknown, error: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isInteger(value) || value < min || value > max) {
    throw new HttpError(400, error);
  }
  return value;
}

function nullableInteger(value: unknown, error: string, min: number, max: number): number | null {
  return value === null || value === undefined ? null : integer(value, error, min, max);
}

function category(value: unknown): TripPlaceCategory {
  return ["food", "culture", "nightlife", "nature", "shopping", "other"].includes(String(value))
    ? value as TripPlaceCategory
    : "other";
}

function transportMode(value: unknown): TripTransportMode | null {
  if (value === null || value === undefined || value === "") return null;
  if (!["walk", "car", "transit", "other"].includes(String(value))) throw new HttpError(400, "invalid_transport_mode");
  return value as TripTransportMode;
}

function flightDirection(value: unknown): "outbound" | "return" | "other" {
  return ["outbound", "return", "other"].includes(String(value))
    ? value as "outbound" | "return" | "other"
    : "other";
}

export function isWebp(data: Uint8Array): boolean {
  return data.length >= 12
    && new TextDecoder().decode(data.slice(0, 4)) === "RIFF"
    && new TextDecoder().decode(data.slice(8, 12)) === "WEBP";
}
