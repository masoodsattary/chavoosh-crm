import { createReadStream } from "node:fs";
import {
  mkdir,
  readFile,
  rename,
  rm,
  stat,
  writeFile,
} from "node:fs/promises";
import { createHash, randomUUID } from "node:crypto";
import { dirname, isAbsolute, join, resolve, sep } from "node:path";
import { DatabaseSync, type StatementSync } from "node:sqlite";
import { Readable } from "node:stream";

type BoundValue = string | number | bigint | null | Uint8Array;
type PutOptions = {
  httpMetadata?: { contentType?: string };
  customMetadata?: Record<string, string>;
};

type StoredMetadata = {
  customMetadata?: Record<string, string>;
  httpMetadata?: { contentType?: string };
};

const globalRuntime = globalThis as typeof globalThis & {
  __CHAVOOSH_ENV__?: {
    DB: D1Database;
    BUCKET: R2Bucket;
    RESEND_API_KEY?: string;
    CRM_FROM_EMAIL?: string;
    CRM_BASE_URL?: string;
  };
  __CHAVOOSH_LOCAL_DB__?: DatabaseSync;
};

class LocalStatement {
  private values: BoundValue[] = [];
  private readonly statement: StatementSync;

  constructor(statement: StatementSync) {
    this.statement = statement;
  }

  bind(...values: BoundValue[]) {
    const result = new LocalStatement(this.statement);
    result.values = values;
    return result;
  }

  async first<T = Record<string, unknown>>() {
    const row = this.statement.get(...this.values) as T | undefined;
    return row && typeof row === "object" && !Array.isArray(row)
      ? ({ ...row } as T)
      : row ?? null;
  }

  async all<T = Record<string, unknown>>() {
    const results = (this.statement.all(...this.values) as T[]).map((row) =>
      row && typeof row === "object" && !Array.isArray(row) ? ({ ...row } as T) : row,
    );
    return { success: true, results, meta: { changes: 0 } };
  }

  async run() {
    const result = this.statement.run(...this.values);
    return {
      success: true,
      meta: {
        changes: Number(result.changes),
        last_row_id: Number(result.lastInsertRowid),
      },
    };
  }

  async raw<T = unknown[]>() {
    this.statement.setReturnArrays(true);
    try {
      return this.statement.all(...this.values) as T[];
    } finally {
      this.statement.setReturnArrays(false);
    }
  }
}

class LocalDatabase {
  private readonly database: DatabaseSync;

  constructor(database: DatabaseSync) {
    this.database = database;
  }

  prepare(query: string) {
    return new LocalStatement(this.database.prepare(query));
  }

  async batch(statements: LocalStatement[]) {
    this.database.exec("BEGIN IMMEDIATE");
    try {
      const results = [];
      for (const statement of statements) results.push(await statement.run());
      this.database.exec("COMMIT");
      return results;
    } catch (error) {
      this.database.exec("ROLLBACK");
      throw error;
    }
  }
}

class LocalObject {
  readonly body: ReadableStream;
  private readonly filePath: string;
  readonly size: number;
  readonly customMetadata: Record<string, string> | undefined;
  readonly httpMetadata: { contentType?: string } | undefined;

  constructor(
    filePath: string,
    size: number,
    customMetadata: Record<string, string> | undefined,
    httpMetadata: { contentType?: string } | undefined,
  ) {
    this.filePath = filePath;
    this.size = size;
    this.customMetadata = customMetadata;
    this.httpMetadata = httpMetadata;
    this.body = Readable.toWeb(createReadStream(filePath)) as ReadableStream;
  }

  async arrayBuffer() {
    const value = await readFile(this.filePath);
    return value.buffer.slice(value.byteOffset, value.byteOffset + value.byteLength);
  }

  async text() {
    return readFile(this.filePath, "utf8");
  }

  async json<T>() {
    return JSON.parse(await this.text()) as T;
  }
}

class LocalBucket {
  private readonly metadataRoot: string;
  private readonly root: string;

  constructor(root: string) {
    this.root = root;
    this.metadataRoot = join(root, ".metadata");
  }

  private objectPath(key: string) {
    if (!key || isAbsolute(key) || key.includes("\\") || key.split("/").includes("..")) {
      throw new Error("Invalid storage key");
    }
    const candidate = resolve(this.root, key);
    if (!candidate.startsWith(resolve(this.root) + sep)) throw new Error("Invalid storage key");
    return candidate;
  }

  private metadataPath(key: string) {
    const hash = createHash("sha256").update(key).digest("hex");
    return join(this.metadataRoot, `${hash}.json`);
  }

  private async metadata(key: string): Promise<StoredMetadata> {
    try {
      return JSON.parse(await readFile(this.metadataPath(key), "utf8")) as StoredMetadata;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return {};
      throw error;
    }
  }

  async put(key: string, value: ArrayBuffer | ArrayBufferView | string, options: PutOptions = {}) {
    const filePath = this.objectPath(key);
    await mkdir(dirname(filePath), { recursive: true, mode: 0o750 });
    await mkdir(this.metadataRoot, { recursive: true, mode: 0o750 });
    const temporaryPath = `${filePath}.tmp-${randomUUID()}`;
    const data = typeof value === "string"
      ? value
      : value instanceof ArrayBuffer
        ? new Uint8Array(value)
        : new Uint8Array(value.buffer, value.byteOffset, value.byteLength);
    await writeFile(temporaryPath, data, { mode: 0o640 });
    await rename(temporaryPath, filePath);
    await writeFile(
      this.metadataPath(key),
      JSON.stringify({ customMetadata: options.customMetadata, httpMetadata: options.httpMetadata }),
      { mode: 0o640 },
    );
    return { key };
  }

  async get(key: string) {
    const filePath = this.objectPath(key);
    try {
      const details = await stat(filePath);
      const metadata = await this.metadata(key);
      return new LocalObject(
        filePath,
        details.size,
        metadata.customMetadata,
        metadata.httpMetadata,
      );
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return null;
      throw error;
    }
  }

  async head(key: string) {
    const object = await this.get(key);
    if (!object) return null;
    return {
      size: object.size,
      customMetadata: object.customMetadata,
      httpMetadata: object.httpMetadata,
    };
  }

  async delete(keys: string | string[]) {
    for (const key of Array.isArray(keys) ? keys : [keys]) {
      await rm(this.objectPath(key), { force: true });
      await rm(this.metadataPath(key), { force: true });
    }
  }
}

function requiredAbsolutePath(name: string, fallback: string) {
  const value = process.env[name] || fallback;
  if (!isAbsolute(value)) throw new Error(`${name} must be an absolute path`);
  return value;
}

async function applyMigrations(database: DatabaseSync) {
  database.exec(`
    CREATE TABLE IF NOT EXISTS _crm_migrations (
      name TEXT PRIMARY KEY NOT NULL,
      applied_at TEXT NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  const migrationsDirectory = resolve(process.cwd(), "drizzle");
  const { readdir } = await import("node:fs/promises");
  const files = (await readdir(migrationsDirectory))
    .filter((name) => /^\d+_.*\.sql$/.test(name))
    .sort();
  const applied = database.prepare("SELECT 1 FROM _crm_migrations WHERE name = ?");
  const mark = database.prepare("INSERT INTO _crm_migrations (name) VALUES (?)");
  for (const name of files) {
    if (applied.get(name)) continue;
    const sql = (await readFile(join(migrationsDirectory, name), "utf8"))
      .replaceAll("--> statement-breakpoint", "\n");
    database.exec(sql);
    mark.run(name);
  }
}

export async function initializeLocalRuntime() {
  if (globalRuntime.__CHAVOOSH_ENV__) return globalRuntime.__CHAVOOSH_ENV__;
  const databasePath = requiredAbsolutePath(
    "CRM_DATABASE_PATH",
    resolve(process.cwd(), ".local-data/database/crm.sqlite"),
  );
  const uploadsPath = requiredAbsolutePath(
    "CRM_UPLOADS_PATH",
    resolve(process.cwd(), ".local-data/uploads"),
  );
  await mkdir(dirname(databasePath), { recursive: true, mode: 0o750 });
  await mkdir(uploadsPath, { recursive: true, mode: 0o750 });
  const database = new DatabaseSync(databasePath);
  database.exec("PRAGMA journal_mode=WAL; PRAGMA busy_timeout=5000; PRAGMA foreign_keys=ON;");
  await applyMigrations(database);
  globalRuntime.__CHAVOOSH_LOCAL_DB__ = database;
  globalRuntime.__CHAVOOSH_ENV__ = {
    DB: new LocalDatabase(database) as unknown as D1Database,
    BUCKET: new LocalBucket(uploadsPath) as unknown as R2Bucket,
    RESEND_API_KEY: process.env.RESEND_API_KEY,
    CRM_FROM_EMAIL: process.env.CRM_FROM_EMAIL,
    CRM_BASE_URL: process.env.CRM_BASE_URL || "https://crm.chavoosh.com",
  };
  return globalRuntime.__CHAVOOSH_ENV__;
}

export const localRuntimeTestables = { LocalDatabase, LocalBucket };
