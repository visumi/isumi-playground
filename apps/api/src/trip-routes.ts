import { jwtVerify, SignJWT } from "jose";
import type { Client } from "@libsql/client/web";
import type { AuthUser, Env } from "./shared";
import { createDatabaseClient, HttpError, requiredEnv } from "./shared";
import {
  acceptTripRoom,
  assertTripMember,
  createTripDayItem,
  createTripFlight,
  createTripLodging,
  createTripPlace,
  createTripRoute,
  createTripRoom,
  deleteTripDayItem,
  deleteTripFlight,
  deleteTripLodging,
  deleteTripPlace,
  deleteTripRoute,
  deleteTripRoom,
  getTripSnapshot,
  listTripRooms,
  updateTripFlight,
  updateTripLodging,
  updateTripPlace,
  updateTripPlaceCoordinates,
  updateTripRoute,
  updateTripRoom,
  type TripDayItemInput,
  type TripFlightInput,
  type TripLodgingInput,
  type TripPlaceCoordinatesInput,
  type TripPlaceInput,
  type TripRouteInput,
  type TripRoomInput
} from "./trips";

interface RealtimeClaims {
  roomId: string;
  userId: string;
  name: string;
  picture: string | null;
}

export async function handleTripRealtimeUpgrade(request: Request, env: Env): Promise<Response | null> {
  const url = new URL(request.url);
  const match = url.pathname.match(/^\/tools\/trips\/([^/]+)\/realtime$/);
  if (!match) return null;
  if (request.headers.get("Upgrade") !== "websocket") return new Response("Upgrade required", { status: 426 });

  const token = url.searchParams.get("ticket");
  if (!token) return new Response("Unauthorized", { status: 401 });

  try {
    const { payload } = await jwtVerify(token, realtimeSecret(env), {
      issuer: "isumi-playground-api",
      audience: "trip-realtime"
    });
    const claims = payload as unknown as RealtimeClaims;
    if (claims.roomId !== match[1] || !claims.userId || !claims.name) {
      return new Response("Unauthorized", { status: 401 });
    }

    const headers = new Headers(request.headers);
    headers.set("X-Trip-Room", claims.roomId);
    headers.set("X-Trip-User", claims.userId);
    headers.set("X-Trip-Name", claims.name);
    if (claims.picture) headers.set("X-Trip-Picture", claims.picture);
    return env.TRIP_ROOM.getByName(claims.roomId).fetch(new Request(request, { headers }));
  } catch {
    return new Response("Unauthorized", { status: 401 });
  }
}

export async function handleTripRequest(
  request: Request,
  env: Env,
  db: Client,
  user: AuthUser,
  corsHeaders: Headers
): Promise<Response | null> {
  const url = new URL(request.url);

  if (url.pathname === "/tools/trips") {
    if (request.method === "GET") return json(await listTripRooms(db, user.uid), 200, corsHeaders);
    if (request.method === "POST") {
      const snapshot = await createTripRoom(db, user, await readJson<TripRoomInput>(request));
      await notifyRoom(env, snapshot.room.id, snapshot, user.uid);
      return json(snapshot, 201, corsHeaders);
    }
  }

  const roomMatch = url.pathname.match(/^\/tools\/trips\/([^/]+)$/);
  if (roomMatch) {
    const roomId = roomMatch[1];
    if (request.method === "GET") {
      const accepting = url.searchParams.get("accept") === "1";
      const snapshot = accepting
        ? await acceptTripRoom(db, user.uid, roomId)
        : await getTripSnapshot(db, user.uid, roomId);
      if (accepting) await notifyRoom(env, roomId, snapshot, user.uid);
      return json(snapshot, 200, corsHeaders);
    }
    if (request.method === "PATCH") {
      const snapshot = await updateTripRoom(db, user.uid, roomId, await readJson<TripRoomInput>(request));
      await notifyRoom(env, roomId, snapshot, user.uid);
      return json(snapshot, 200, corsHeaders);
    }
    if (request.method === "DELETE") {
      await deleteTripRoom(db, user.uid, roomId);
      return new Response(null, { status: 204, headers: corsHeaders });
    }
  }

  const realtimeTicketMatch = url.pathname.match(/^\/tools\/trips\/([^/]+)\/realtime-ticket$/);
  if (realtimeTicketMatch && request.method === "POST") {
    const roomId = realtimeTicketMatch[1];
    await assertTripMember(db, roomId, user.uid);
    const token = await new SignJWT({
      roomId,
      userId: user.uid,
      name: user.name || user.email,
      picture: user.picture
    })
      .setProtectedHeader({ alg: "HS256" })
      .setIssuer("isumi-playground-api")
      .setAudience("trip-realtime")
      .setIssuedAt()
      .setExpirationTime("60s")
      .setJti(crypto.randomUUID())
      .sign(realtimeSecret(env));
    return json({ token, expiresInSeconds: 60 }, 201, corsHeaders);
  }

  const placeMatch = url.pathname.match(/^\/tools\/trips\/([^/]+)\/places(?:\/([^/]+))?$/);
  if (placeMatch) {
    const [, roomId, placeId] = placeMatch;
    if (request.method === "POST" && !placeId) {
      return snapshotResponse(
        env,
        roomId,
        user.uid,
        await createTripPlace(db, user.uid, roomId, await readJson<TripPlaceInput>(request), tripGeocoder(env)),
        201,
        corsHeaders
      );
    }
    if (request.method === "PATCH" && placeId) {
      return snapshotResponse(
        env,
        roomId,
        user.uid,
        await updateTripPlace(db, user.uid, roomId, placeId, await readJson<TripPlaceInput>(request), tripGeocoder(env)),
        200,
        corsHeaders
      );
    }
    if (request.method === "DELETE" && placeId) {
      await deleteTripPlace(db, user.uid, roomId, placeId);
      await notifyRoom(env, roomId, await getTripSnapshot(db, user.uid, roomId), user.uid);
      return new Response(null, { status: 204, headers: corsHeaders });
    }
  }

  const placeCoordinatesMatch = url.pathname.match(/^\/tools\/trips\/([^/]+)\/places\/([^/]+)\/coordinates$/);
  if (placeCoordinatesMatch && request.method === "PATCH") {
    const [, roomId, placeId] = placeCoordinatesMatch;
    return snapshotResponse(
      env,
      roomId,
      user.uid,
      await updateTripPlaceCoordinates(
        db,
        user.uid,
        roomId,
        placeId,
        await readJson<TripPlaceCoordinatesInput>(request)
      ),
      200,
      corsHeaders
    );
  }

  const itemMatch = url.pathname.match(/^\/tools\/trips\/([^/]+)\/items(?:\/([^/]+))?$/);
  if (itemMatch) {
    const [, roomId, itemId] = itemMatch;
    if (request.method === "POST" && !itemId) {
      return snapshotResponse(env, roomId, user.uid, await createTripDayItem(db, user.uid, roomId, await readJson<TripDayItemInput>(request)), 201, corsHeaders);
    }
    if (request.method === "DELETE" && itemId) {
      await deleteTripDayItem(db, user.uid, roomId, itemId);
      const snapshot = await getTripSnapshot(db, user.uid, roomId);
      await notifyRoom(env, roomId, snapshot, user.uid);
      return new Response(null, { status: 204, headers: corsHeaders });
    }
  }

  const routeMatch = url.pathname.match(/^\/tools\/trips\/([^/]+)\/routes(?:\/([^/]+))?$/);
  if (routeMatch) {
    const [, roomId, routeId] = routeMatch;
    if (request.method === "POST" && !routeId) {
      return snapshotResponse(env, roomId, user.uid, await createTripRoute(db, user.uid, roomId, await readJson<TripRouteInput>(request)), 201, corsHeaders);
    }
    if (request.method === "PATCH" && routeId) {
      return snapshotResponse(env, roomId, user.uid, await updateTripRoute(db, user.uid, roomId, routeId, await readJson<TripRouteInput>(request)), 200, corsHeaders);
    }
    if (request.method === "DELETE" && routeId) {
      await deleteTripRoute(db, user.uid, roomId, routeId);
      const snapshot = await getTripSnapshot(db, user.uid, roomId);
      await notifyRoom(env, roomId, snapshot, user.uid);
      return new Response(null, { status: 204, headers: corsHeaders });
    }
  }

  const flightMatch = url.pathname.match(/^\/tools\/trips\/([^/]+)\/flights(?:\/([^/]+))?$/);
  if (flightMatch) {
    const [, roomId, flightId] = flightMatch;
    if (request.method === "POST" && !flightId) {
      return snapshotResponse(env, roomId, user.uid, await createTripFlight(db, user.uid, roomId, await readJson<TripFlightInput>(request)), 201, corsHeaders);
    }
    if (request.method === "PATCH" && flightId) {
      return snapshotResponse(env, roomId, user.uid, await updateTripFlight(db, user.uid, roomId, flightId, await readJson<TripFlightInput>(request)), 200, corsHeaders);
    }
    if (request.method === "DELETE" && flightId) {
      await deleteTripFlight(db, user.uid, roomId, flightId);
      const snapshot = await getTripSnapshot(db, user.uid, roomId);
      await notifyRoom(env, roomId, snapshot, user.uid);
      return new Response(null, { status: 204, headers: corsHeaders });
    }
  }

  const lodgingMatch = url.pathname.match(/^\/tools\/trips\/([^/]+)\/lodgings(?:\/([^/]+))?$/);
  if (lodgingMatch) {
    const [, roomId, lodgingId] = lodgingMatch;
    if (request.method === "POST" && !lodgingId) {
      return snapshotResponse(env, roomId, user.uid, await createTripLodging(db, user.uid, roomId, await readJson<TripLodgingInput>(request)), 201, corsHeaders);
    }
    if (request.method === "PATCH" && lodgingId) {
      return snapshotResponse(env, roomId, user.uid, await updateTripLodging(db, user.uid, roomId, lodgingId, await readJson<TripLodgingInput>(request)), 200, corsHeaders);
    }
    if (request.method === "DELETE" && lodgingId) {
      await deleteTripLodging(db, user.uid, roomId, lodgingId);
      const snapshot = await getTripSnapshot(db, user.uid, roomId);
      await notifyRoom(env, roomId, snapshot, user.uid);
      return new Response(null, { status: 204, headers: corsHeaders });
    }
  }

  return null;
}

async function snapshotResponse(
  env: Env,
  roomId: string,
  userId: string,
  snapshot: Awaited<ReturnType<typeof getTripSnapshot>>,
  status: number,
  corsHeaders: Headers
): Promise<Response> {
  await notifyRoom(env, roomId, snapshot, userId);
  return json(snapshot, status, corsHeaders);
}

async function notifyRoom(env: Env, roomId: string, snapshot: unknown, actorUserId: string): Promise<void> {
  await env.TRIP_ROOM.getByName(roomId).broadcastSnapshot(snapshot, actorUserId);
}

function realtimeSecret(env: Env): Uint8Array {
  return new TextEncoder().encode(requiredEnv(env.REALTIME_TICKET_SECRET, "REALTIME_TICKET_SECRET"));
}

function tripGeocoder(env: Env) {
  return {
    userAgent: env.GEOCODER_USER_AGENT,
    email: env.GEOCODER_EMAIL
  };
}

async function readJson<T>(request: Request): Promise<T> {
  try {
    return await request.json() as T;
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}

function json(body: unknown, status: number, headers: Headers): Response {
  const responseHeaders = new Headers(headers);
  responseHeaders.set("Content-Type", "application/json; charset=utf-8");
  return new Response(JSON.stringify(body), { status, headers: responseHeaders });
}

export async function validateTripRealtimeTicketForTests(token: string, env: Env): Promise<RealtimeClaims> {
  const { payload } = await jwtVerify(token, realtimeSecret(env), {
    issuer: "isumi-playground-api",
    audience: "trip-realtime"
  });
  return payload as unknown as RealtimeClaims;
}
