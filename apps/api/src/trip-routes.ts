import { jwtVerify, SignJWT } from "jose";
import type { Client } from "@libsql/client/web";
import { dispatchRoute, route, routeParam, type HttpRoute, type RouteContext } from "./http-router";
import type { AuthUser, Env } from "./shared";
import { HttpError, requiredEnv } from "./shared";
import {
  acceptTripRoom,
  assertTripMember,
  createTripDayItem,
  createTripLodging,
  createTripPlace,
  createTripRoute,
  createTripRoom,
  deleteTripDayItem,
  deleteTripLodging,
  deleteTripPlace,
  deleteTripRoute,
  deleteTripRoom,
  ensureTripPublicShareToken,
  getPublicTripSnapshot,
  getTripSnapshot,
  listTripRooms,
  moveTripDayItem,
  reorderTripDayItems,
  updateTripLodging,
  updateTripPlace,
  updateTripRoute,
  updateTripRoom,
  type TripDayItemOrderInput,
  type TripDayItemInput,
  type TripLodgingInput,
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

interface TripRouteContext extends RouteContext {
  env: Env;
  db: Client;
  user: AuthUser;
  corsHeaders: Headers;
}

interface PublicTripRouteContext extends RouteContext {
  db: Client;
  corsHeaders: Headers;
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
  return dispatchRoute(tripRoutes, {
    request,
    url: new URL(request.url),
    env,
    db,
    user,
    corsHeaders
  });
}

export async function handlePublicTripRequest(
  request: Request,
  db: Client,
  corsHeaders: Headers
): Promise<Response | null> {
  return dispatchRoute(publicTripRoutes, {
    request,
    url: new URL(request.url),
    db,
    corsHeaders
  });
}

const publicTripRoutes: HttpRoute<PublicTripRouteContext>[] = [
  route("GET", /^\/tools\/trips\/public\/(?<shareToken>[^/]+)$/, async ({ db, corsHeaders, params }) =>
    json(await getPublicTripSnapshot(db, routeParam(params, "shareToken")), 200, corsHeaders)
  )
];

const tripRoutes: HttpRoute<TripRouteContext>[] = [
  route("GET", /^\/tools\/trips$/, async ({ db, user, corsHeaders }) =>
    json(await listTripRooms(db, user.uid), 200, corsHeaders)
  ),
  route("POST", /^\/tools\/trips$/, async ({ request, env, db, user, corsHeaders }) => {
    const snapshot = await createTripRoom(db, user, await readJson<TripRoomInput>(request));
    await notifyRoom(env, snapshot.room.id, snapshot, user.uid);
    return json(snapshot, 201, corsHeaders);
  }),
  route("GET", /^\/tools\/trips\/(?<roomId>[^/]+)$/, async ({ url, env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    const accepting = url.searchParams.get("accept") === "1";
    const snapshot = accepting
      ? await acceptTripRoom(db, user.uid, roomId)
      : await getTripSnapshot(db, user.uid, roomId);
    if (accepting) await notifyRoom(env, roomId, snapshot, user.uid);
    return json(snapshot, 200, corsHeaders);
  }),
  route("PATCH", /^\/tools\/trips\/(?<roomId>[^/]+)$/, async ({ request, env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    const snapshot = await updateTripRoom(db, user.uid, roomId, await readJson<TripRoomInput>(request));
    await notifyRoom(env, roomId, snapshot, user.uid);
    return json(snapshot, 200, corsHeaders);
  }),
  route("DELETE", /^\/tools\/trips\/(?<roomId>[^/]+)$/, async ({ db, user, corsHeaders, params }) => {
    await deleteTripRoom(db, user.uid, routeParam(params, "roomId"));
    return empty(204, corsHeaders);
  }),
  route("POST", /^\/tools\/trips\/(?<roomId>[^/]+)\/realtime-ticket$/, async ({ env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
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
  }),
  route("POST", /^\/tools\/trips\/(?<roomId>[^/]+)\/public-share-token$/, async ({ db, user, corsHeaders, params }) =>
    json(await ensureTripPublicShareToken(db, user.uid, routeParam(params, "roomId")), 200, corsHeaders)
  ),
  route("POST", /^\/tools\/trips\/(?<roomId>[^/]+)\/places$/, async ({ request, env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    return snapshotResponse(env, roomId, user.uid, await createTripPlace(db, user.uid, roomId, await readJson<TripPlaceInput>(request)), 201, corsHeaders);
  }),
  route("PATCH", /^\/tools\/trips\/(?<roomId>[^/]+)\/places\/(?<placeId>[^/]+)$/, async ({ request, env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    return snapshotResponse(
      env,
      roomId,
      user.uid,
      await updateTripPlace(db, user.uid, roomId, routeParam(params, "placeId"), await readJson<TripPlaceInput>(request)),
      200,
      corsHeaders
    );
  }),
  route("DELETE", /^\/tools\/trips\/(?<roomId>[^/]+)\/places\/(?<placeId>[^/]+)$/, async ({ env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    await deleteTripPlace(db, user.uid, roomId, routeParam(params, "placeId"));
    await notifyRoom(env, roomId, await getTripSnapshot(db, user.uid, roomId), user.uid);
    return empty(204, corsHeaders);
  }),
  route("POST", /^\/tools\/trips\/(?<roomId>[^/]+)\/items$/, async ({ request, env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    return snapshotResponse(env, roomId, user.uid, await createTripDayItem(db, user.uid, roomId, await readJson<TripDayItemInput>(request)), 201, corsHeaders);
  }),
  route("PATCH", /^\/tools\/trips\/(?<roomId>[^/]+)\/items\/(?<itemId>[^/]+)$/, async ({ request, env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    return snapshotResponse(env, roomId, user.uid, await moveTripDayItem(db, user.uid, roomId, routeParam(params, "itemId"), await readJson<TripDayItemInput>(request)), 200, corsHeaders);
  }),
  route("DELETE", /^\/tools\/trips\/(?<roomId>[^/]+)\/items\/(?<itemId>[^/]+)$/, async ({ env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    await deleteTripDayItem(db, user.uid, roomId, routeParam(params, "itemId"));
    await notifyRoom(env, roomId, await getTripSnapshot(db, user.uid, roomId), user.uid);
    return empty(204, corsHeaders);
  }),
  route("PATCH", /^\/tools\/trips\/(?<roomId>[^/]+)\/days\/(?<dayId>[^/]+)\/items\/order$/, async ({ request, env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    return snapshotResponse(
      env,
      roomId,
      user.uid,
      await reorderTripDayItems(db, user.uid, roomId, routeParam(params, "dayId"), await readJson<TripDayItemOrderInput>(request)),
      200,
      corsHeaders
    );
  }),
  route("POST", /^\/tools\/trips\/(?<roomId>[^/]+)\/routes$/, async ({ request, env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    return snapshotResponse(env, roomId, user.uid, await createTripRoute(db, user.uid, roomId, await readJson<TripRouteInput>(request)), 201, corsHeaders);
  }),
  route("PATCH", /^\/tools\/trips\/(?<roomId>[^/]+)\/routes\/(?<routeId>[^/]+)$/, async ({ request, env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    return snapshotResponse(env, roomId, user.uid, await updateTripRoute(db, user.uid, roomId, routeParam(params, "routeId"), await readJson<TripRouteInput>(request)), 200, corsHeaders);
  }),
  route("DELETE", /^\/tools\/trips\/(?<roomId>[^/]+)\/routes\/(?<routeId>[^/]+)$/, async ({ env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    await deleteTripRoute(db, user.uid, roomId, routeParam(params, "routeId"));
    await notifyRoom(env, roomId, await getTripSnapshot(db, user.uid, roomId), user.uid);
    return empty(204, corsHeaders);
  }),
  route("POST", /^\/tools\/trips\/(?<roomId>[^/]+)\/lodgings$/, async ({ request, env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    return snapshotResponse(env, roomId, user.uid, await createTripLodging(db, user.uid, roomId, await readJson<TripLodgingInput>(request)), 201, corsHeaders);
  }),
  route("PATCH", /^\/tools\/trips\/(?<roomId>[^/]+)\/lodgings\/(?<lodgingId>[^/]+)$/, async ({ request, env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    return snapshotResponse(env, roomId, user.uid, await updateTripLodging(db, user.uid, roomId, routeParam(params, "lodgingId"), await readJson<TripLodgingInput>(request)), 200, corsHeaders);
  }),
  route("DELETE", /^\/tools\/trips\/(?<roomId>[^/]+)\/lodgings\/(?<lodgingId>[^/]+)$/, async ({ env, db, user, corsHeaders, params }) => {
    const roomId = routeParam(params, "roomId");
    await deleteTripLodging(db, user.uid, roomId, routeParam(params, "lodgingId"));
    await notifyRoom(env, roomId, await getTripSnapshot(db, user.uid, roomId), user.uid);
    return empty(204, corsHeaders);
  })
];

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

function empty(status: number, headers: Headers): Response {
  return new Response(null, { status, headers });
}

export async function validateTripRealtimeTicketForTests(token: string, env: Env): Promise<RealtimeClaims> {
  const { payload } = await jwtVerify(token, realtimeSecret(env), {
    issuer: "isumi-playground-api",
    audience: "trip-realtime"
  });
  return payload as unknown as RealtimeClaims;
}
