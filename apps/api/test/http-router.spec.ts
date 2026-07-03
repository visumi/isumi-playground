import { describe, expect, it } from "vitest";
import { dispatchRoute, route, routeParam, type RouteContext } from "../src/http-router";

describe("http router", () => {
  function context(method: string, pathname: string): RouteContext {
    const request = new Request(`http://api.local${pathname}`, { method });
    return {
      request,
      url: new URL(request.url)
    };
  }

  it("dispatches by method and named route params", async () => {
    const response = await dispatchRoute([
      route("GET", /^\/tools\/trips\/(?<roomId>[^/]+)$/, ({ params }) =>
        Response.json({ roomId: routeParam(params, "roomId") })
      )
    ], context("GET", "/tools/trips/room-1"));

    expect(await response?.json()).toEqual({ roomId: "room-1" });
  });

  it("does not match the same path with a different method", async () => {
    const response = await dispatchRoute([
      route("POST", /^\/tools\/trips\/(?<roomId>[^/]+)$/, () =>
        Response.json({ matched: true })
      )
    ], context("GET", "/tools/trips/room-1"));

    expect(response).toBeNull();
  });

  it("returns null when no route matches", async () => {
    await expect(dispatchRoute([], context("GET", "/missing"))).resolves.toBeNull();
  });
});
