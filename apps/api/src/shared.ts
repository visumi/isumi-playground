import { createClient, type Client, type InStatement } from "@libsql/client/web";

export interface Env {
  TURSO_URL: string;
  TURSO_AUTH_TOKEN: string;
  FIREBASE_PROJECT_ID: string;
  OWNER_EMAIL: string;
  REALTIME_TICKET_SECRET: string;
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

  throw new HttpError(500, "database_batch_not_available");
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

export type DbRow = Record<string, unknown>;

export function mapDbRows<T>(rows: Iterable<unknown>, mapper: (row: DbRow) => T): T[] {
  return [...rows].map((row) => mapper(asDbRow(row)));
}

export function mapOptionalDbRow<T>(row: unknown, mapper: (row: DbRow) => T): T | null {
  return row === undefined ? null : mapper(asDbRow(row));
}

export function readDbString(row: DbRow, key: string): string {
  const value = row[key];
  if (typeof value !== "string") {
    throw new HttpError(500, `invalid_db_${key}`);
  }
  return value;
}

export function readDbNullableString(row: DbRow, key: string): string | null {
  const value = row[key];
  if (value === null) return null;
  if (typeof value !== "string") {
    throw new HttpError(500, `invalid_db_${key}`);
  }
  return value;
}

export function readDbNumber(row: DbRow, key: string): number {
  const value = row[key];
  if (typeof value !== "number") {
    throw new HttpError(500, `invalid_db_${key}`);
  }
  return value;
}

function asDbRow(value: unknown): DbRow {
  if (typeof value !== "object" || value === null || Array.isArray(value)) {
    throw new HttpError(500, "invalid_db_row");
  }
  return value as DbRow;
}

export class HttpError extends Error {
  constructor(readonly status: number, message: string) {
    super(message);
  }
}
