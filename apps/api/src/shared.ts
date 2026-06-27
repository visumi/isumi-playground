import { createClient, type Client, type InStatement } from "@libsql/client/web";

export interface Env {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
  FIREBASE_PROJECT_ID: string;
  OWNER_EMAIL: string;
  REALTIME_TICKET_SECRET: string;
  GEOCODER_USER_AGENT?: string;
  GEOCODER_EMAIL?: string;
  ALLOWED_ORIGIN?: string;
  TRIP_ROOM: DurableObjectNamespace<import("./trip-room").TripRoom>;
}

export type AccessRole = "owner" | "member";

export interface AuthUser {
  uid: string;
  email: string;
  name: string | null;
  picture: string | null;
  allowed: boolean;
  role: AccessRole | null;
}

type ExecuteDb = Pick<Client, "execute">;
type AtomicDb = ExecuteDb & Partial<Pick<Client, "batch">>;

export function createDatabaseClient(env: Env): Client {
  return createClient({
    url: requiredEnv(env.TURSO_URL, "TURSO_URL"),
    authToken: requiredEnv(env.TURSO_AUTH_TOKEN, "TURSO_AUTH_TOKEN")
  });
}

export async function executeStatementsAtomically(db: AtomicDb, statements: InStatement[]): Promise<void> {
  if (statements.length === 0) {
    return;
  }

  if (typeof db.batch === "function") {
    await db.batch(statements, "write");
    return;
  }

  for (const statement of statements) {
    await db.execute(statement);
  }
}

export function toUtcIsoTimestamp(value: string): string {
  const normalized = value.includes("T") ? value : value.replace(" ", "T");
  return /(?:Z|[+-]\d{2}:?\d{2})$/.test(normalized) ? normalized : `${normalized}Z`;
}

export function requiredEnv(value: string | undefined, name: string): string {
  if (!value) {
    throw new HttpError(500, `${name}_not_configured`);
  }

  return value;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
