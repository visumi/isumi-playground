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
  latitude?: number;
  longitude?: number;
  version?: number;
}

export interface TripDayItemInput {
  dayId?: string;
  placeId?: string;
}

export interface TripDayItemOrderInput {
  itemIds?: string[];
}

export interface TripDayItemBulkInput {
  dayId?: string;
  placeIds?: string[];
  itemIds?: string[];
  removeItemIds?: string[];
}

export interface TripRouteInput {
  fromItemId?: string;
  fromLodgingId?: string;
  toItemId?: string;
  toLodgingId?: string;
  transportMode?: TripTransportMode;
  durationMinutes?: number;
  version?: number;
}

export interface TripLodgingInput {
  name?: string;
  address?: string | null;
  checkInDate?: string;
  checkOutDate?: string;
  notes?: string | null;
  latitude?: number;
  longitude?: number;
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
  public_share_token?: string | null;
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
  const rooms = result.rows.map((row) => mapRoom(row as TripRoomRow));

  if (rooms.length === 0) {
    return [];
  }

  const members = await db.execute({
    sql: `
      SELECT m.room_id, m.user_id, m.role, m.joined_at, u.email, u.name, u.picture
      FROM trip_members m
      INNER JOIN users u ON u.id = m.user_id
      WHERE m.room_id IN (${rooms.map(() => "?").join(", ")})
      ORDER BY m.role DESC, m.joined_at
    `,
    args: rooms.map((room) => room.id)
  });
  const membersByRoom = new Map<string, Array<ReturnType<typeof mapTripMember>>>();

  for (const row of members.rows) {
    const roomId = String(row.room_id);
    membersByRoom.set(roomId, [...(membersByRoom.get(roomId) || []), mapTripMember(row)]);
  }

  return rooms.map((room) => ({
    ...room,
    members: membersByRoom.get(room.id) || []
  }));
}

export async function createTripRoom(db: Client, user: AuthUser, payload: TripRoomInput) {
  const roomId = crypto.randomUUID();
  const publicShareToken = generateTripPublicShareToken();
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
          (id, owner_user_id, title, destination, start_date, end_date, timezone, public_share_token)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [roomId, user.uid, title, destination, startDate, endDate, timezone, publicShareToken]
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
      SELECT id, owner_user_id, title, destination, start_date, end_date, timezone, public_share_token,
             revision, created_at, updated_at
      FROM trip_rooms WHERE id = ? LIMIT 1
    `,
    args: [roomId]
  });
  const room = roomResult.rows[0] as TripRoomRow | undefined;
  if (!room) throw new HttpError(404, "not_found");

  const [members, days, places, items, routes, lodgings] = await Promise.all([
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
        SELECT id, name, category, address, notes, created_by_user_id,
               latitude, longitude, geocoded_address, geocoded_at, geocoding_status,
               version, created_at, updated_at
        FROM trip_places WHERE room_id = ? ORDER BY created_at, id
      `,
      args: [roomId]
    }),
    db.execute({
      sql: `
        SELECT id, day_id, place_id, position, version
        FROM trip_day_items WHERE room_id = ? ORDER BY day_id, position
      `,
      args: [roomId]
    }),
    db.execute({
      sql: `
        SELECT id, from_item_id, from_lodging_id, to_item_id, to_lodging_id,
               transport_mode, duration_minutes, version
        FROM trip_routes WHERE room_id = ? ORDER BY created_at, id
      `,
      args: [roomId]
    }),
    db.execute({
      sql: `
        SELECT id, name, address, check_in_date, check_out_date, notes,
               latitude, longitude, version
        FROM trip_lodgings WHERE room_id = ? ORDER BY check_in_date
      `,
      args: [roomId]
    })
  ]);

  return {
    room: mapRoom(room),
    currentMemberRole: member.role,
    members: members.rows.map(mapTripMember),
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
      latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
      longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
      geocodedAddress: row.geocoded_address ? String(row.geocoded_address) : null,
      geocodedAt: row.geocoded_at ? toUtcIsoTimestamp(String(row.geocoded_at)) : null,
      geocodingStatus: row.geocoding_status ? String(row.geocoding_status) : null,
      createdByUserId: String(row.created_by_user_id),
      version: Number(row.version),
      createdAt: toUtcIsoTimestamp(String(row.created_at)),
      updatedAt: toUtcIsoTimestamp(String(row.updated_at))
    })),
    items: items.rows.map((row) => ({
      id: String(row.id),
      dayId: String(row.day_id),
      placeId: String(row.place_id),
      position: Number(row.position),
      version: Number(row.version)
    })),
    routes: routes.rows.map((row) => ({
      id: String(row.id),
      fromItemId: row.from_item_id ? String(row.from_item_id) : null,
      fromLodgingId: row.from_lodging_id ? String(row.from_lodging_id) : null,
      toItemId: row.to_item_id ? String(row.to_item_id) : null,
      toLodgingId: row.to_lodging_id ? String(row.to_lodging_id) : null,
      transportMode: String(row.transport_mode),
      durationMinutes: Number(row.duration_minutes),
      version: Number(row.version)
    })),
    lodgings: lodgings.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      address: row.address ? String(row.address) : null,
      checkInDate: String(row.check_in_date),
      checkOutDate: String(row.check_out_date),
      notes: row.notes ? String(row.notes) : null,
      latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
      longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude),
      version: Number(row.version)
    }))
  };
}

export async function getPublicTripSnapshot(db: Client, publicShareToken: string) {
  const token = requiredText(publicShareToken, "not_found", 96);
  const roomResult = await db.execute({
    sql: `
      SELECT id, owner_user_id, title, destination, start_date, end_date, timezone,
             revision, created_at, updated_at
      FROM trip_rooms WHERE public_share_token = ? LIMIT 1
    `,
    args: [token]
  });
  const room = roomResult.rows[0] as TripRoomRow | undefined;
  if (!room) throw new HttpError(404, "not_found");

  const [members, days, places, items, routes, lodgings] = await Promise.all([
    db.execute({ sql: "SELECT COUNT(*) AS total FROM trip_members WHERE room_id = ?", args: [room.id] }),
    db.execute({ sql: "SELECT id, date, position FROM trip_days WHERE room_id = ? ORDER BY position", args: [room.id] }),
    db.execute({
      sql: `
        SELECT id, name, category, address, notes, latitude, longitude
        FROM trip_places WHERE room_id = ? ORDER BY created_at, id
      `,
      args: [room.id]
    }),
    db.execute({
      sql: `
        SELECT id, day_id, place_id, position
        FROM trip_day_items WHERE room_id = ? ORDER BY day_id, position
      `,
      args: [room.id]
    }),
    db.execute({
      sql: `
        SELECT id, from_item_id, from_lodging_id, to_item_id, to_lodging_id,
               transport_mode, duration_minutes
        FROM trip_routes WHERE room_id = ? ORDER BY created_at, id
      `,
      args: [room.id]
    }),
    db.execute({
      sql: `
        SELECT id, name, address, check_in_date, check_out_date, notes,
               latitude, longitude
        FROM trip_lodgings WHERE room_id = ? ORDER BY check_in_date
      `,
      args: [room.id]
    })
  ]);

  return {
    room: {
      id: room.id,
      title: room.title,
      destination: room.destination,
      startDate: room.start_date,
      endDate: room.end_date,
      timezone: room.timezone,
      revision: Number(room.revision),
      updatedAt: toUtcIsoTimestamp(room.updated_at)
    },
    membersCount: Number(members.rows[0]?.total || 0),
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
      latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
      longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude)
    })),
    items: items.rows.map((row) => ({
      id: String(row.id),
      dayId: String(row.day_id),
      placeId: String(row.place_id),
      position: Number(row.position)
    })),
    routes: routes.rows.map((row) => ({
      id: String(row.id),
      fromItemId: row.from_item_id ? String(row.from_item_id) : null,
      fromLodgingId: row.from_lodging_id ? String(row.from_lodging_id) : null,
      toItemId: row.to_item_id ? String(row.to_item_id) : null,
      toLodgingId: row.to_lodging_id ? String(row.to_lodging_id) : null,
      transportMode: String(row.transport_mode),
      durationMinutes: Number(row.duration_minutes)
    })),
    lodgings: lodgings.rows.map((row) => ({
      id: String(row.id),
      name: String(row.name),
      address: row.address ? String(row.address) : null,
      checkInDate: String(row.check_in_date),
      checkOutDate: String(row.check_out_date),
      notes: row.notes ? String(row.notes) : null,
      latitude: row.latitude === null || row.latitude === undefined ? null : Number(row.latitude),
      longitude: row.longitude === null || row.longitude === undefined ? null : Number(row.longitude)
    }))
  };
}

export async function ensureTripPublicShareToken(db: Client, userId: string, roomId: string): Promise<{ publicShareToken: string }> {
  await assertTripMember(db, roomId, userId);
  const current = await db.execute({
    sql: "SELECT public_share_token FROM trip_rooms WHERE id = ? LIMIT 1",
    args: [roomId]
  });
  const row = current.rows[0];
  if (!row) throw new HttpError(404, "not_found");
  if (row.public_share_token) return { publicShareToken: String(row.public_share_token) };

  const publicShareToken = generateTripPublicShareToken();
  await db.execute({
    sql: "UPDATE trip_rooms SET public_share_token = ? WHERE id = ? AND public_share_token IS NULL",
    args: [publicShareToken, roomId]
  });

  const updated = await db.execute({
    sql: "SELECT public_share_token FROM trip_rooms WHERE id = ? LIMIT 1",
    args: [roomId]
  });
  const token = updated.rows[0]?.public_share_token;
  if (!token) throw new HttpError(500, "public_share_token_unavailable");
  return { publicShareToken: String(token) };
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

export async function createTripPlace(
  db: Client,
  userId: string,
  roomId: string,
  payload: TripPlaceInput
) {
  await assertTripMember(db, roomId, userId);
  const placeId = crypto.randomUUID();
  const address = nullableText(payload.address, 240);
  const latitude = coordinate(payload.latitude, "invalid_latitude", -90, 90);
  const longitude = coordinate(payload.longitude, "invalid_longitude", -180, 180);
  await executeStatementsAtomically(db, [
    {
      sql: `
        INSERT INTO trip_places
          (id, room_id, name, category, address, notes, latitude, longitude,
           created_by_user_id, geocoding_status)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'resolved')
      `,
      args: [
        placeId,
        roomId,
        requiredText(payload.name, "missing_place_name", 160),
        category(payload.category),
        address,
        nullableText(payload.notes, 2000),
        latitude,
        longitude,
        userId
      ]
    },
    touchRoom(roomId)
  ]);
  return getTripSnapshot(db, userId, roomId);
}

export async function updateTripPlace(
  db: Client,
  userId: string,
  roomId: string,
  placeId: string,
  payload: TripPlaceInput
) {
  await assertTripMember(db, roomId, userId);
  const version = integer(payload.version, "missing_entity_version", 1, Number.MAX_SAFE_INTEGER);
  const address = nullableText(payload.address, 240);
  const latitude = coordinate(payload.latitude, "invalid_latitude", -90, 90);
  const longitude = coordinate(payload.longitude, "invalid_longitude", -180, 180);
  const result = await db.execute({
    sql: `
      UPDATE trip_places SET name = ?, category = ?, address = ?, notes = ?,
        latitude = ?, longitude = ?, geocoded_address = NULL, geocoded_at = NULL,
        geocoding_status = 'resolved',
        version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND room_id = ? AND version = ?
    `,
    args: [
      requiredText(payload.name, "missing_place_name", 160),
      category(payload.category),
      address,
      nullableText(payload.notes, 2000),
      latitude,
      longitude,
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
  const plannedItem = await db.execute({
    sql: "SELECT id FROM trip_day_items WHERE room_id = ? AND place_id = ? LIMIT 1",
    args: [roomId, placeId]
  });
  if (plannedItem.rows.length > 0) {
    throw new HttpError(409, "planned_place_cannot_be_deleted");
  }

  await executeStatementsAtomically(db, [
    {
      sql: `
        DELETE FROM trip_routes
        WHERE room_id = ? AND (
          from_item_id IN (SELECT id FROM trip_day_items WHERE place_id = ? AND room_id = ?)
          OR to_item_id IN (SELECT id FROM trip_day_items WHERE place_id = ? AND room_id = ?)
        )
      `,
      args: [roomId, placeId, roomId, placeId, roomId]
    },
    { sql: "DELETE FROM trip_places WHERE id = ? AND room_id = ?", args: [placeId, roomId] },
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
          (id, room_id, day_id, place_id, position)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [
        crypto.randomUUID(),
        roomId,
        dayId,
        placeId,
        position
      ]
    },
    cleanupInvalidTripRouteStatements(roomId),
    touchRoom(roomId)
  ]);
  return getTripSnapshot(db, userId, roomId);
}

export async function bulkUpdateTripDayItems(db: Client, userId: string, roomId: string, payload: TripDayItemBulkInput) {
  await assertTripMember(db, roomId, userId);
  const dayId = optionalText(payload.dayId, 64);
  const placeIds = uniqueTextArray(payload.placeIds, "invalid_bulk_places", 64);
  const itemIds = uniqueTextArray(payload.itemIds, "invalid_bulk_items", 64);
  const removeItemIds = uniqueTextArray(payload.removeItemIds, "invalid_bulk_items", 64);
  const changedItemIds = new Set([...itemIds, ...removeItemIds]);
  if (changedItemIds.size !== itemIds.length + removeItemIds.length) throw new HttpError(400, "invalid_bulk_items");
  if ((placeIds.length > 0 || itemIds.length > 0) && !dayId) throw new HttpError(400, "missing_day");
  if (placeIds.length === 0 && itemIds.length === 0 && removeItemIds.length === 0) {
    throw new HttpError(400, "empty_bulk_items");
  }

  if (dayId) {
    const day = await db.execute({ sql: "SELECT id FROM trip_days WHERE id = ? AND room_id = ?", args: [dayId, roomId] });
    if (day.rows.length === 0) throw new HttpError(400, "invalid_day");
  }

  if (placeIds.length > 0) {
    const places = await db.execute({
      sql: `SELECT id FROM trip_places WHERE room_id = ? AND id IN (${placeIds.map(() => "?").join(", ")})`,
      args: [roomId, ...placeIds]
    });
    if (places.rows.length !== placeIds.length) throw new HttpError(400, "invalid_place");
  }

  const existingScheduledPlaceIds = placeIds.length > 0
    ? await db.execute({
      sql: `SELECT DISTINCT place_id FROM trip_day_items WHERE room_id = ? AND place_id IN (${placeIds.map(() => "?").join(", ")})`,
      args: [roomId, ...placeIds]
    })
    : { rows: [] };
  const scheduledPlaceIds = new Set(existingScheduledPlaceIds.rows.map((row) => String(row.place_id)));
  const placeIdsToCreate = placeIds.filter((placeId) => !scheduledPlaceIds.has(placeId));

  const itemsToChange = changedItemIds.size > 0
    ? await db.execute({
      sql: `SELECT id, day_id FROM trip_day_items WHERE room_id = ? AND id IN (${[...changedItemIds].map(() => "?").join(", ")})`,
      args: [roomId, ...changedItemIds]
    })
    : { rows: [] };
  if (itemsToChange.rows.length !== changedItemIds.size) throw new HttpError(400, "invalid_item");

  const itemsById = new Map(itemsToChange.rows.map((row) => [String(row.id), String(row.day_id)]));
  const itemIdsToMove = dayId ? itemIds.filter((itemId) => itemsById.get(itemId) !== dayId) : [];
  const affectedDayIds = new Set<string>();
  for (const itemId of [...itemIdsToMove, ...removeItemIds]) {
    const sourceDayId = itemsById.get(itemId);
    if (sourceDayId) affectedDayIds.add(sourceDayId);
  }
  if (dayId && (itemIdsToMove.length > 0 || placeIdsToCreate.length > 0)) affectedDayIds.add(dayId);

  const statements: InStatement[] = [];
  if (removeItemIds.length > 0) {
    const placeholders = removeItemIds.map(() => "?").join(", ");
    statements.push(
      {
        sql: `DELETE FROM trip_routes WHERE room_id = ? AND (from_item_id IN (${placeholders}) OR to_item_id IN (${placeholders}))`,
        args: [roomId, ...removeItemIds, ...removeItemIds]
      },
      {
        sql: `DELETE FROM trip_day_items WHERE room_id = ? AND id IN (${placeholders})`,
        args: [roomId, ...removeItemIds]
      }
    );
  }

  let targetPosition = dayId && (itemIdsToMove.length > 0 || placeIdsToCreate.length > 0)
    ? await nextPosition(db, dayId)
    : 0;
  for (const itemId of itemIdsToMove) {
    statements.push({
      sql: "UPDATE trip_day_items SET day_id = ?, position = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND room_id = ?",
      args: [dayId, targetPosition, itemId, roomId]
    });
    targetPosition += 1;
  }
  for (const placeId of placeIdsToCreate) {
    statements.push({
      sql: `
        INSERT INTO trip_day_items
          (id, room_id, day_id, place_id, position)
        VALUES (?, ?, ?, ?, ?)
      `,
      args: [crypto.randomUUID(), roomId, dayId, placeId, targetPosition]
    });
    targetPosition += 1;
  }

  if (statements.length > 0) {
    await executeStatementsAtomically(db, [
      ...statements,
      ...[...affectedDayIds].flatMap((affectedDayId) => normalizeDayPositionsStatements(affectedDayId)),
      cleanupInvalidTripRouteStatements(roomId),
      touchRoom(roomId)
    ]);
  }
  return getTripSnapshot(db, userId, roomId);
}

export async function reorderTripDayItems(
  db: Client,
  userId: string,
  roomId: string,
  dayId: string,
  payload: TripDayItemOrderInput
) {
  await assertTripMember(db, roomId, userId);
  const itemIds = Array.isArray(payload.itemIds) ? payload.itemIds.map((id) => String(id)) : [];
  if (itemIds.length === 0 || new Set(itemIds).size !== itemIds.length) {
    throw new HttpError(400, "invalid_item_order");
  }

  const day = await db.execute({ sql: "SELECT id FROM trip_days WHERE id = ? AND room_id = ?", args: [dayId, roomId] });
  if (day.rows.length === 0) throw new HttpError(400, "invalid_day");

  const current = await db.execute({
    sql: "SELECT id FROM trip_day_items WHERE room_id = ? AND day_id = ? ORDER BY position, id",
    args: [roomId, dayId]
  });
  const currentIds = current.rows.map((row) => String(row.id));
  if (itemIds.length !== currentIds.length || !currentIds.every((id) => itemIds.includes(id))) {
    throw new HttpError(400, "invalid_item_order");
  }

  await executeStatementsAtomically(db, [
    ...itemIds.map((id, position) => ({
      sql: "UPDATE trip_day_items SET position = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP WHERE id = ? AND room_id = ? AND day_id = ?",
      args: [position, id, roomId, dayId]
    })),
    cleanupInvalidTripRouteStatements(roomId),
    touchRoom(roomId)
  ]);
  return getTripSnapshot(db, userId, roomId);
}

export async function moveTripDayItem(db: Client, userId: string, roomId: string, itemId: string, payload: TripDayItemInput) {
  await assertTripMember(db, roomId, userId);
  const targetDayId = requiredText(payload.dayId, "missing_day", 64);
  const itemResult = await db.execute({
    sql: "SELECT version FROM trip_day_items WHERE id = ? AND room_id = ?",
    args: [itemId, roomId]
  });
  const item = itemResult.rows[0];
  if (!item) throw new HttpError(404, "not_found");

  const targetPosition = await nextPosition(db, targetDayId);
  return applyTripMoveOperation(db, userId, roomId, {
    operationId: crypto.randomUUID(),
    type: "move_item",
    entityVersion: Number(item.version),
    itemId,
    targetDayId,
    targetPosition
  });
}

export async function createTripRoute(db: Client, userId: string, roomId: string, payload: TripRouteInput) {
  await assertTripMember(db, roomId, userId);
  const fromItemId = optionalText(payload.fromItemId, 64);
  const fromLodgingId = optionalText(payload.fromLodgingId, 64);
  const toItemId = optionalText(payload.toItemId, 64);
  const toLodgingId = optionalText(payload.toLodgingId, 64);
  if (!!fromItemId === !!fromLodgingId) throw new HttpError(400, "invalid_route_origin");
  if (!!toItemId === !!toLodgingId) throw new HttpError(400, "invalid_route_destination");
  await assertValidTripRoute(db, roomId, fromItemId, fromLodgingId, toItemId, toLodgingId);
  await executeStatementsAtomically(db, [
    {
      sql: `
        INSERT INTO trip_routes
          (id, room_id, from_item_id, from_lodging_id, to_item_id, to_lodging_id,
           transport_mode, duration_minutes)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        crypto.randomUUID(),
        roomId,
        fromItemId,
        fromLodgingId,
        toItemId,
        toLodgingId,
        requiredTransportMode(payload.transportMode),
        integer(payload.durationMinutes, "invalid_route_duration", 1, 1440)
      ]
    },
    touchRoom(roomId)
  ]);
  return getTripSnapshot(db, userId, roomId);
}

export async function updateTripRoute(
  db: Client,
  userId: string,
  roomId: string,
  routeId: string,
  payload: TripRouteInput
) {
  await assertTripMember(db, roomId, userId);
  const existing = await db.execute({
    sql: `
      SELECT from_item_id, from_lodging_id, to_item_id, to_lodging_id
      FROM trip_routes WHERE id = ? AND room_id = ?
    `,
    args: [routeId, roomId]
  });
  const route = existing.rows[0];
  if (!route) throw new HttpError(404, "not_found");
  await assertValidTripRoute(
    db,
    roomId,
    route.from_item_id ? String(route.from_item_id) : null,
    route.from_lodging_id ? String(route.from_lodging_id) : null,
    route.to_item_id ? String(route.to_item_id) : null,
    route.to_lodging_id ? String(route.to_lodging_id) : null
  );
  const version = integer(payload.version, "missing_entity_version", 1, Number.MAX_SAFE_INTEGER);
  const result = await db.execute({
    sql: `
      UPDATE trip_routes SET transport_mode = ?, duration_minutes = ?,
        version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND room_id = ? AND version = ?
    `,
    args: [
      requiredTransportMode(payload.transportMode),
      integer(payload.durationMinutes, "invalid_route_duration", 1, 1440),
      routeId,
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
    {
      sql: "DELETE FROM trip_routes WHERE room_id = ? AND (from_item_id = ? OR to_item_id = ?)",
      args: [roomId, itemId, itemId]
    },
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
        UPDATE trip_day_items SET day_id = ?, position = ?,
          version = version + 1, updated_at = CURRENT_TIMESTAMP
        WHERE id = ? AND room_id = ? AND version = ?
      `,
      args: [operation.targetDayId, targetPosition, operation.itemId, roomId, operation.entityVersion]
    },
    ...positionStatements,
    cleanupInvalidTripRouteStatements(roomId),
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

export async function createTripLodging(db: Client, userId: string, roomId: string, payload: TripLodgingInput) {
  await assertTripMember(db, roomId, userId);
  const checkIn = date(payload.checkInDate, "missing_check_in");
  const checkOut = date(payload.checkOutDate, "missing_check_out");
  const latitude = coordinate(payload.latitude, "invalid_latitude", -90, 90);
  const longitude = coordinate(payload.longitude, "invalid_longitude", -180, 180);
  if (checkOut <= checkIn) throw new HttpError(400, "invalid_date_range");
  await assertLodgingPeriodAvailable(db, roomId, checkIn, checkOut);
  await executeStatementsAtomically(db, [
    {
      sql: `
        INSERT INTO trip_lodgings
          (id, room_id, name, address, check_in_date, check_out_date, notes, latitude, longitude)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `,
      args: [
        crypto.randomUUID(),
        roomId,
        requiredText(payload.name, "missing_lodging_name", 160),
        nullableText(payload.address, 240),
        checkIn,
        checkOut,
        nullableText(payload.notes, 1000),
        latitude,
        longitude
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
  const latitude = coordinate(payload.latitude, "invalid_latitude", -90, 90);
  const longitude = coordinate(payload.longitude, "invalid_longitude", -180, 180);
  if (checkOut <= checkIn) throw new HttpError(400, "invalid_date_range");
  await assertLodgingPeriodAvailable(db, roomId, checkIn, checkOut, lodgingId);

  const result = await db.execute({
    sql: `
      UPDATE trip_lodgings SET name = ?, address = ?, check_in_date = ?, check_out_date = ?,
        notes = ?, latitude = ?, longitude = ?, version = version + 1, updated_at = CURRENT_TIMESTAMP
      WHERE id = ? AND room_id = ? AND version = ?
    `,
    args: [
      requiredText(payload.name, "missing_lodging_name", 160),
      nullableText(payload.address, 240),
      checkIn,
      checkOut,
      nullableText(payload.notes, 1000),
      latitude,
      longitude,
      lodgingId,
      roomId,
      version
    ]
  });
  if (result.rowsAffected === 0) throw new HttpError(409, "entity_version_conflict");
  await db.execute(cleanupInvalidTripRouteStatements(roomId));
  await db.execute(touchRoom(roomId));
  return getTripSnapshot(db, userId, roomId);
}

export async function deleteTripRoute(db: Client, userId: string, roomId: string, routeId: string): Promise<void> {
  await assertTripMember(db, roomId, userId);
  await executeStatementsAtomically(db, [
    { sql: "DELETE FROM trip_routes WHERE id = ? AND room_id = ?", args: [routeId, roomId] },
    touchRoom(roomId)
  ]);
}

export async function deleteTripLodging(db: Client, userId: string, roomId: string, lodgingId: string): Promise<void> {
  await assertTripMember(db, roomId, userId);
  await executeStatementsAtomically(db, [
    {
      sql: "DELETE FROM trip_routes WHERE room_id = ? AND (from_lodging_id = ? OR to_lodging_id = ?)",
      args: [roomId, lodgingId, lodgingId]
    },
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
    publicShareToken: row.public_share_token ? String(row.public_share_token) : null,
    revision: Number(row.revision),
    createdAt: toUtcIsoTimestamp(row.created_at),
    updatedAt: toUtcIsoTimestamp(row.updated_at)
  };
}

function generateTripPublicShareToken(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return [...bytes].map((byte) => byte.toString(16).padStart(2, "0")).join("");
}

function mapTripMember(row: Row) {
  return {
    userId: String(row.user_id),
    role: String(row.role),
    email: String(row.email),
    name: row.name ? String(row.name) : null,
    picture: row.picture ? String(row.picture) : null,
    joinedAt: toUtcIsoTimestamp(String(row.joined_at))
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

function cleanupInvalidTripRouteStatements(roomId: string): InStatement {
  return {
    sql: `
      DELETE FROM trip_routes
      WHERE room_id = ? AND NOT (
        (
          from_item_id IS NOT NULL
          AND to_item_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM trip_day_items origin
            INNER JOIN trip_day_items destination
              ON destination.day_id = origin.day_id
             AND destination.position = origin.position + 1
            WHERE origin.id = trip_routes.from_item_id
              AND destination.id = trip_routes.to_item_id
          )
        )
        OR (
          from_lodging_id IS NOT NULL
          AND to_item_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM trip_lodgings lodging
            INNER JOIN trip_day_items destination
              ON destination.id = trip_routes.to_item_id
             AND destination.position = 0
            INNER JOIN trip_days day
              ON day.id = destination.day_id
             AND day.date >= lodging.check_in_date
             AND day.date <= lodging.check_out_date
            WHERE lodging.id = trip_routes.from_lodging_id
          )
        )
        OR (
          from_item_id IS NOT NULL
          AND to_lodging_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM trip_day_items origin
            INNER JOIN trip_days day
              ON day.id = origin.day_id
            INNER JOIN trip_lodgings lodging
              ON lodging.id = trip_routes.to_lodging_id
             AND lodging.room_id = origin.room_id
             AND lodging.check_in_date = day.date
            WHERE origin.id = trip_routes.from_item_id
              AND origin.room_id = trip_routes.room_id
              AND NOT EXISTS (
                SELECT 1
                FROM trip_day_items later
                WHERE later.day_id = origin.day_id
                  AND later.position > origin.position
              )
          )
        )
        OR (
          from_lodging_id IS NOT NULL
          AND to_lodging_id IS NOT NULL
          AND EXISTS (
            SELECT 1
            FROM trip_lodgings departure
            INNER JOIN trip_lodgings arrival
              ON arrival.id = trip_routes.to_lodging_id
             AND arrival.room_id = departure.room_id
             AND arrival.id <> departure.id
             AND arrival.check_in_date = departure.check_out_date
            INNER JOIN trip_days day
              ON day.room_id = departure.room_id
             AND day.date = arrival.check_in_date
            WHERE departure.id = trip_routes.from_lodging_id
              AND departure.room_id = trip_routes.room_id
              AND NOT EXISTS (
                SELECT 1
                FROM trip_day_items item
                WHERE item.day_id = day.id
              )
          )
        )
      )
    `,
    args: [roomId]
  };
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

async function assertAdjacentItems(
  db: Client,
  roomId: string,
  fromItemId: string,
  toItemId: string
): Promise<void> {
  const result = await db.execute({
    sql: `
      SELECT 1
      FROM trip_day_items origin
      INNER JOIN trip_day_items destination
        ON destination.day_id = origin.day_id
       AND destination.position = origin.position + 1
      WHERE origin.id = ? AND destination.id = ?
        AND origin.room_id = ? AND destination.room_id = ?
      LIMIT 1
    `,
    args: [fromItemId, toItemId, roomId, roomId]
  });
  if (result.rows.length === 0) throw new HttpError(400, "route_items_not_adjacent");
}

async function assertLodgingToFirstItem(
  db: Client,
  roomId: string,
  lodgingId: string,
  toItemId: string
): Promise<void> {
  const result = await db.execute({
    sql: `
      SELECT 1
      FROM trip_lodgings lodging
      INNER JOIN trip_day_items destination
        ON destination.id = ?
       AND destination.room_id = lodging.room_id
       AND destination.position = 0
      INNER JOIN trip_days day
        ON day.id = destination.day_id
       AND day.date >= lodging.check_in_date
       AND day.date <= lodging.check_out_date
      WHERE lodging.id = ? AND lodging.room_id = ?
      LIMIT 1
    `,
    args: [toItemId, lodgingId, roomId]
  });
  if (result.rows.length === 0) throw new HttpError(400, "route_lodging_not_first_stop");
}

async function assertValidTripRoute(
  db: Client,
  roomId: string,
  fromItemId: string | null,
  fromLodgingId: string | null,
  toItemId: string | null,
  toLodgingId: string | null
): Promise<void> {
  if (fromItemId && toItemId) {
    await assertAdjacentItems(db, roomId, fromItemId, toItemId);
    return;
  }
  if (fromLodgingId && toItemId) {
    await assertLodgingToFirstItem(db, roomId, fromLodgingId, toItemId);
    return;
  }
  if (fromItemId && toLodgingId) {
    await assertLastItemToLodging(db, roomId, fromItemId, toLodgingId);
    return;
  }
  if (fromLodgingId && toLodgingId) {
    await assertDirectLodgingTransfer(db, roomId, fromLodgingId, toLodgingId);
    return;
  }
  throw new HttpError(400, "invalid_route_endpoints");
}

async function assertLastItemToLodging(
  db: Client,
  roomId: string,
  fromItemId: string,
  toLodgingId: string
): Promise<void> {
  const result = await db.execute({
    sql: `
      SELECT 1
      FROM trip_day_items origin
      INNER JOIN trip_days day
        ON day.id = origin.day_id
      INNER JOIN trip_lodgings lodging
        ON lodging.id = ?
       AND lodging.room_id = origin.room_id
       AND lodging.check_in_date = day.date
      WHERE origin.id = ? AND origin.room_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM trip_day_items later
          WHERE later.day_id = origin.day_id
            AND later.position > origin.position
        )
      LIMIT 1
    `,
    args: [toLodgingId, fromItemId, roomId]
  });
  if (result.rows.length === 0) throw new HttpError(400, "route_item_not_last_stop");
}

async function assertDirectLodgingTransfer(
  db: Client,
  roomId: string,
  fromLodgingId: string,
  toLodgingId: string
): Promise<void> {
  const result = await db.execute({
    sql: `
      SELECT 1
      FROM trip_lodgings departure
      INNER JOIN trip_lodgings arrival
        ON arrival.id = ?
       AND arrival.room_id = departure.room_id
       AND arrival.id <> departure.id
       AND arrival.check_in_date = departure.check_out_date
      INNER JOIN trip_days day
        ON day.room_id = departure.room_id
       AND day.date = arrival.check_in_date
      WHERE departure.id = ? AND departure.room_id = ?
        AND NOT EXISTS (
          SELECT 1
          FROM trip_day_items item
          WHERE item.day_id = day.id
        )
      LIMIT 1
    `,
    args: [toLodgingId, fromLodgingId, roomId]
  });
  if (result.rows.length === 0) throw new HttpError(400, "route_lodging_transfer_has_stops");
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

function coordinate(value: unknown, error: string, min: number, max: number): number {
  if (typeof value !== "number" || !Number.isFinite(value) || value < min || value > max) {
    throw new HttpError(400, error);
  }
  return value;
}

function category(value: unknown): TripPlaceCategory {
  return ["food", "culture", "nightlife", "nature", "shopping", "other"].includes(String(value))
    ? value as TripPlaceCategory
    : "other";
}

function requiredTransportMode(value: unknown): TripTransportMode {
  if (!["walk", "car", "transit", "other"].includes(String(value))) throw new HttpError(400, "invalid_transport_mode");
  return value as TripTransportMode;
}

function optionalText(value: unknown, max: number): string | null {
  const normalized = typeof value === "string" ? value.trim() : "";
  return normalized ? normalized.slice(0, max) : null;
}

function uniqueTextArray(value: unknown, error: string, max: number): string[] {
  if (value === undefined || value === null) return [];
  if (!Array.isArray(value)) throw new HttpError(400, error);
  const items = value.map((item) => {
    const normalized = typeof item === "string" ? item.trim() : "";
    if (!normalized) throw new HttpError(400, error);
    return normalized.slice(0, max);
  });
  if (new Set(items).size !== items.length) throw new HttpError(400, error);
  return items;
}
