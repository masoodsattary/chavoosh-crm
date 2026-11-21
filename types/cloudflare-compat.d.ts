type D1Value = string | number | bigint | boolean | null | ArrayBuffer | ArrayBufferView;

interface D1Result<T = Record<string, unknown>> {
  success: boolean;
  results: T[];
  meta: { changes?: number; last_row_id?: number; [key: string]: unknown };
}

interface D1PreparedStatement {
  bind(...values: unknown[]): D1PreparedStatement;
  first<T = Record<string, unknown>>(): Promise<T | null>;
  all<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  run<T = Record<string, unknown>>(): Promise<D1Result<T>>;
  raw<T = unknown[]>(): Promise<T[]>;
}

interface D1Database {
  prepare(query: string): D1PreparedStatement;
  batch<T = Record<string, unknown>>(statements: D1PreparedStatement[]): Promise<D1Result<T>[]>;
}

interface R2ObjectBody {
  body: ReadableStream;
  size: number;
  customMetadata?: Record<string, string>;
  httpMetadata?: { contentType?: string };
  arrayBuffer(): Promise<ArrayBuffer>;
  text(): Promise<string>;
  json<T = unknown>(): Promise<T>;
}

interface R2Bucket {
  put(key: string, value: ArrayBuffer | ArrayBufferView | string, options?: {
    httpMetadata?: { contentType?: string };
    customMetadata?: Record<string, string>;
  }): Promise<unknown>;
  get(key: string): Promise<R2ObjectBody | null>;
  head(key: string): Promise<Pick<R2ObjectBody, "size" | "customMetadata" | "httpMetadata"> | null>;
  delete(keys: string | string[]): Promise<void>;
}

interface Fetcher {
  fetch(request: Request): Promise<Response>;
}
