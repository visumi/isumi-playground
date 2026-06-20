import { describe, expect, it } from "vitest";
import { handleRequest, isEmailAllowed, normalizeEmail, resolveAccessDecision, type Env } from "../src/index";

const env: Env = {
  TURSO_URL: "libsql://example.turso.io",
  TURSO_AUTH_TOKEN: "secret",
  FIREBASE_PROJECT_ID: "demo",
  OWNER_EMAIL: "owner@example.com",
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

  it("handles CORS preflight for the production http origin", async () => {
    const response = await handleRequest(
      new Request("http://api.local/me", {
        method: "OPTIONS",
        headers: { Origin: "http://playground.isumi.com.br" }
      }),
      env
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("http://playground.isumi.com.br");
  });

  it("handles comma separated configured CORS origins", async () => {
    const response = await handleRequest(
      new Request("http://api.local/me", {
        method: "OPTIONS",
        headers: { Origin: "https://preview.example.com" }
      }),
      {
        ...env,
        ALLOWED_ORIGIN: "http://localhost:4200, https://preview.example.com"
      }
    );

    expect(response.status).toBe(204);
    expect(response.headers.get("Access-Control-Allow-Origin")).toBe("https://preview.example.com");
  });
});

describe("email allowlist", () => {
  it("accepts comma, whitespace and semicolon separated emails", () => {
    const allowedEmails = "owner@example.com\nfriend@example.com; outro@example.com,mais@example.com";

    expect(isEmailAllowed("FRIEND@example.com", allowedEmails)).toBe(true);
    expect(isEmailAllowed("outro@example.com", allowedEmails)).toBe(true);
    expect(isEmailAllowed("missing@example.com", allowedEmails)).toBe(false);
  });

  it("normalizes emails before comparisons", () => {
    expect(normalizeEmail("  Pessoa@Example.COM ")).toBe("pessoa@example.com");
  });

  it("always allows the configured owner email", () => {
    expect(resolveAccessDecision("OWNER@example.com", null, env)).toEqual({
      allowed: true,
      role: "owner"
    });
  });

  it("allows active access grants and blocks inactive or missing grants", () => {
    expect(resolveAccessDecision("member@example.com", { role: "member", active: 1 }, env)).toEqual({
      allowed: true,
      role: "member"
    });
    expect(resolveAccessDecision("member@example.com", { role: "member", active: 0 }, env)).toEqual({
      allowed: false,
      role: null
    });
    expect(resolveAccessDecision("missing@example.com", null, env)).toEqual({
      allowed: false,
      role: null
    });
  });

  it("does not grant owner privileges from a database row alone", () => {
    expect(resolveAccessDecision("member@example.com", { role: "owner", active: 1 }, env)).toEqual({
      allowed: true,
      role: "member"
    });
  });
});
