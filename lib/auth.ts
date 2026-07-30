import { getChatGPTUser } from "@/app/chatgpt-auth";
import { headers } from "next/headers";
import { ApiError, type AppUser, runtime } from "./server";

const SESSION_COOKIE = "chavoosh_crm_session";
const SESSION_DAYS = 30;
// The Sites Web Crypto runtime currently accepts at most 100,000 PBKDF2 rounds.
const PASSWORD_ITERATIONS = 100_000;

type AuthenticatedUser = {
  user: AppUser;
  method: "session" | "legacy_chatgpt";
};

export async function getAuthenticatedUser(
  allowLegacyChatGPT = true,
): Promise<AuthenticatedUser | null> {
  const token = await readCookie(SESSION_COOKIE);
  if (token) {
    const tokenHash = await sha256(token);
    const user = await runtime().DB
      .prepare(
        `SELECT u.id, u.email, u.full_name AS fullName, u.mobile, u.role,
                u.timezone, u.is_active AS isActive,
                CASE WHEN u.password_hash IS NULL THEN 0 ELSE 1 END AS hasPassword
         FROM auth_sessions s
         JOIN users u ON u.id = s.user_id
         WHERE s.token_hash = ? AND s.expires_at > CURRENT_TIMESTAMP
           AND u.is_active = 1 AND u.archived_at IS NULL`,
      )
      .bind(tokenHash)
      .first<AppUser>();
    if (user) {
      await runtime().DB
        .prepare("UPDATE auth_sessions SET last_seen_at = CURRENT_TIMESTAMP WHERE token_hash = ?")
        .bind(tokenHash)
        .run();
      return { user, method: "session" };
    }
  }

  if (!allowLegacyChatGPT) return null;
  const identity = await getChatGPTUser();
  if (!identity) return null;
  const email = identity.email.trim().toLowerCase();
  let user = await runtime().DB
    .prepare(
      `SELECT id, email, full_name AS fullName, mobile, role, timezone,
              is_active AS isActive, 0 AS hasPassword
       FROM users
       WHERE lower(email) = ? AND password_hash IS NULL AND archived_at IS NULL`,
    )
    .bind(email)
    .first<AppUser>();
  if (!user) {
    const count = await runtime().DB
      .prepare("SELECT COUNT(*) AS count FROM users WHERE archived_at IS NULL")
      .first<{ count: number }>();
    if ((count?.count ?? 0) !== 0) return null;
    const result = await runtime().DB
      .prepare(
        `INSERT INTO users
         (email, full_name, mobile, role, timezone, is_active, last_login_at)
         VALUES (?, ?, '', 'admin', 'Asia/Tehran', 1, CURRENT_TIMESTAMP)`,
      )
      .bind(email, identity.fullName ?? identity.displayName)
      .run();
    user = {
      id: Number(result.meta.last_row_id),
      email,
      fullName: identity.fullName ?? identity.displayName,
      mobile: "",
      role: "admin",
      timezone: "Asia/Tehran",
      isActive: 1,
      hasPassword: 0,
    };
  }
  if (!user.isActive) return null;
  return { user, method: "legacy_chatgpt" };
}

export async function requireAuthenticatedUser() {
  const auth = await getAuthenticatedUser(true);
  if (!auth) throw new ApiError(401, "برای ادامه با ایمیل و رمز عبور وارد شوید.");
  return auth;
}

export async function hashPassword(password: string, salt = randomToken(16)) {
  validatePassword(password);
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: fromBase64Url(salt),
      iterations: PASSWORD_ITERATIONS,
    },
    key,
    256,
  );
  return {
    hash: toBase64Url(new Uint8Array(bits)),
    salt,
    iterations: PASSWORD_ITERATIONS,
  };
}

export async function verifyPassword(
  password: string,
  stored: { hash: string; salt: string; iterations: number },
) {
  const key = await crypto.subtle.importKey(
    "raw",
    new TextEncoder().encode(password),
    "PBKDF2",
    false,
    ["deriveBits"],
  );
  const bits = await crypto.subtle.deriveBits(
    {
      name: "PBKDF2",
      hash: "SHA-256",
      salt: fromBase64Url(stored.salt),
      iterations: stored.iterations,
    },
    key,
    256,
  );
  return timingSafeEqual(
    new Uint8Array(bits),
    fromBase64Url(stored.hash),
  );
}

export async function createSession(userId: number) {
  const token = randomToken(32);
  const tokenHash = await sha256(token);
  const expires = new Date(Date.now() + SESSION_DAYS * 86_400_000);
  await runtime().DB
    .prepare(
      `INSERT INTO auth_sessions (user_id, token_hash, expires_at)
       VALUES (?, ?, ?)`,
    )
    .bind(userId, tokenHash, expires.toISOString())
    .run();
  return sessionCookie(token, expires);
}

export async function deleteCurrentSession() {
  const token = await readCookie(SESSION_COOKIE);
  if (token) {
    await runtime().DB
      .prepare("DELETE FROM auth_sessions WHERE token_hash = ?")
      .bind(await sha256(token))
      .run();
  }
}

export function clearSessionCookie() {
  return `${SESSION_COOKIE}=; Path=/; HttpOnly; Secure; SameSite=Lax; Max-Age=0`;
}

export function randomToken(bytes = 32) {
  const value = new Uint8Array(bytes);
  crypto.getRandomValues(value);
  return toBase64Url(value);
}

export async function sha256(value: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(value));
  return toBase64Url(new Uint8Array(digest));
}

export function validatePassword(password: string) {
  if (password.length < 10) {
    throw new ApiError(400, "رمز عبور باید حداقل ۱۰ نویسه باشد.");
  }
  if (!/[A-Za-z]/.test(password) || !/\d/.test(password)) {
    throw new ApiError(400, "رمز عبور باید شامل حداقل یک حرف انگلیسی و یک عدد باشد.");
  }
}

async function readCookie(name: string) {
  const cookie = (await headers()).get("cookie") || "";
  const item = cookie
    .split(";")
    .map((part) => part.trim())
    .find((part) => part.startsWith(`${name}=`));
  return item ? decodeURIComponent(item.slice(name.length + 1)) : "";
}

function sessionCookie(token: string, expires: Date) {
  return `${SESSION_COOKIE}=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Lax; Expires=${expires.toUTCString()}`;
}

function timingSafeEqual(left: Uint8Array, right: Uint8Array) {
  if (left.length !== right.length) return false;
  let result = 0;
  for (let index = 0; index < left.length; index += 1) result |= left[index] ^ right[index];
  return result === 0;
}

function toBase64Url(value: Uint8Array) {
  let binary = "";
  for (const byte of value) binary += String.fromCharCode(byte);
  return btoa(binary).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/g, "");
}

function fromBase64Url(value: string) {
  const padded = value.replace(/-/g, "+").replace(/_/g, "/").padEnd(Math.ceil(value.length / 4) * 4, "=");
  const binary = atob(padded);
  return Uint8Array.from(binary, (char) => char.charCodeAt(0));
}
