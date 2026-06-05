import { describe, expect, it } from "vitest";
import { handleRequest, type Env } from "../src/index";

const env: Env = {
  TURSO_URL: "libsql://example.turso.io",
  TURSO_AUTH_TOKEN: "secret",
  FIREBASE_PROJECT_ID: "demo",
  ALLOWED_EMAILS: "allowed@example.com",
  ALLOWED_ORIGIN: "http://localhost:4200"
};

describe("API health", () => {
  it("returns public health without authentication", async () => {
    const response = await handleRequest(new Request("http://api.local/health"), env);
    const body = await response.json<{ ok: boolean }>();

    expect(response.status).toBe(200);
    expect(body.ok).toBe(true);
  });

  it("rejects private routes without a bearer token", async () => {
    const response = await handleRequest(new Request("http://api.local/me"), env);
    const body = await response.json<{ error: string }>();

    expect(response.status).toBe(401);
    expect(body.error).toBe("missing_token");
  });

  it("handles CORS preflight for the configured local origin", async () => {
    const response = await handleRequest(
      new Request("http://api.local/tools/expenses/rooms", {
        method: "OPTIONS",
        headers: { Origin: "http://localhost:4200" }
      }),
      env
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://localhost:4200");
  });
});
