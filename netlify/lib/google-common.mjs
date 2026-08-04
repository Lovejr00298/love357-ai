import crypto from "node:crypto";
import { google } from "googleapis";
import { createClient } from "@supabase/supabase-js";

export const GOOGLE_SCOPES = [
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/gmail.compose",
  "https://www.googleapis.com/auth/calendar.readonly"
];

export class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireEnv(name) {
  const value = process.env[name];
  if (!value) throw new Error(`Missing required environment variable: ${name}`);
  return value;
}

export function getAppUrl() {
  return (process.env.APP_URL || process.env.URL || "").replace(/\/+$/, "");
}

export function getRedirectUri() {
  return process.env.GOOGLE_REDIRECT_URI ||
    `${getAppUrl()}/.netlify/functions/google-callback`;
}

export function getGoogleClient() {
  return new google.auth.OAuth2(
    requireEnv("GOOGLE_CLIENT_ID"),
    requireEnv("GOOGLE_CLIENT_SECRET"),
    getRedirectUri()
  );
}

let adminClient;
export function getSupabaseAdmin() {
  if (!adminClient) {
    const secretKey =
      process.env.SUPABASE_SECRET_KEY ||
      process.env.SUPABASE_SERVICE_ROLE_KEY;
    if (!secretKey) {
      throw new Error(
        "Missing SUPABASE_SECRET_KEY or SUPABASE_SERVICE_ROLE_KEY"
      );
    }
    adminClient = createClient(requireEnv("SUPABASE_URL"), secretKey, {
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false
      }
    });
  }
  return adminClient;
}

function getBearerToken(event) {
  const header =
    event.headers?.authorization ||
    event.headers?.Authorization ||
    "";
  const match = header.match(/^Bearer\s+(.+)$/i);
  return match?.[1] || "";
}

export async function requireSupabaseUser(event) {
  const accessToken = getBearerToken(event);
  if (!accessToken) throw new HttpError(401, "sign_in_required");

  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase.auth.getUser(accessToken);
  if (error || !data?.user) throw new HttpError(401, "invalid_session");
  return data.user;
}

function stateSecret() {
  return requireEnv("OAUTH_STATE_SECRET");
}

export function createOAuthState(userId) {
  const payload = Buffer.from(JSON.stringify({
    userId,
    nonce: crypto.randomBytes(18).toString("base64url"),
    expiresAt: Date.now() + 10 * 60 * 1000
  })).toString("base64url");

  const signature = crypto
    .createHmac("sha256", stateSecret())
    .update(payload)
    .digest("base64url");

  return `${payload}.${signature}`;
}

export function verifyOAuthState(state) {
  if (!state || !state.includes(".")) {
    throw new HttpError(400, "invalid_oauth_state");
  }

  const [payload, signature] = state.split(".");
  const expected = crypto
    .createHmac("sha256", stateSecret())
    .update(payload)
    .digest();

  let supplied;
  try {
    supplied = Buffer.from(signature, "base64url");
  } catch {
    throw new HttpError(400, "invalid_oauth_state");
  }

  if (
    supplied.length !== expected.length ||
    !crypto.timingSafeEqual(supplied, expected)
  ) {
    throw new HttpError(400, "invalid_oauth_state");
  }

  let parsed;
  try {
    parsed = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
  } catch {
    throw new HttpError(400, "invalid_oauth_state");
  }

  if (!parsed.userId || !parsed.expiresAt || Date.now() > parsed.expiresAt) {
    throw new HttpError(400, "expired_oauth_state");
  }
  return parsed;
}

function encryptionKey() {
  const value = requireEnv("GOOGLE_TOKEN_ENCRYPTION_KEY");
  let key;

  if (/^[a-f0-9]{64}$/i.test(value)) {
    key = Buffer.from(value, "hex");
  } else {
    key = Buffer.from(value, "base64");
  }

  if (key.length !== 32) {
    throw new Error(
      "GOOGLE_TOKEN_ENCRYPTION_KEY must be exactly 32 bytes in base64 or 64 hex characters"
    );
  }
  return key;
}

export function encryptSecret(plainText) {
  if (!plainText) return null;
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv("aes-256-gcm", encryptionKey(), iv);
  const encrypted = Buffer.concat([
    cipher.update(String(plainText), "utf8"),
    cipher.final()
  ]);
  const tag = cipher.getAuthTag();
  return [
    "v1",
    iv.toString("base64url"),
    tag.toString("base64url"),
    encrypted.toString("base64url")
  ].join(".");
}

export function decryptSecret(storedValue) {
  if (!storedValue) return null;
  const [version, iv, tag, encrypted] = String(storedValue).split(".");
  if (version !== "v1" || !iv || !tag || !encrypted) {
    throw new Error("Unsupported encrypted token format");
  }

  const decipher = crypto.createDecipheriv(
    "aes-256-gcm",
    encryptionKey(),
    Buffer.from(iv, "base64url")
  );
  decipher.setAuthTag(Buffer.from(tag, "base64url"));
  return Buffer.concat([
    decipher.update(Buffer.from(encrypted, "base64url")),
    decipher.final()
  ]).toString("utf8");
}

export async function saveGoogleTokens({
  userId,
  credentials,
  googleEmail = null,
  scopes = GOOGLE_SCOPES
}) {
  const supabase = getSupabaseAdmin();

  const { data: existing } = await supabase
    .from("google_oauth_tokens")
    .select("encrypted_access_token,encrypted_refresh_token")
    .eq("user_id", userId)
    .maybeSingle();

  const encryptedAccessToken = credentials.access_token
    ? encryptSecret(credentials.access_token)
    : existing?.encrypted_access_token || null;

  const encryptedRefreshToken = credentials.refresh_token
    ? encryptSecret(credentials.refresh_token)
    : existing?.encrypted_refresh_token || null;

  if (!encryptedRefreshToken) {
    throw new Error(
      "Google did not return a refresh token. Reconnect with consent enabled."
    );
  }

  const expiresAt = credentials.expiry_date
    ? new Date(credentials.expiry_date).toISOString()
    : null;

  const tokenScopes = credentials.scope
    ? String(credentials.scope).split(/\s+/).filter(Boolean)
    : scopes;

  const { error: tokenError } = await supabase
    .from("google_oauth_tokens")
    .upsert({
      user_id: userId,
      encrypted_access_token: encryptedAccessToken,
      encrypted_refresh_token: encryptedRefreshToken,
      access_token_expires_at: expiresAt,
      token_type: credentials.token_type || "Bearer",
      scopes: tokenScopes,
      updated_at: new Date().toISOString()
    }, { onConflict: "user_id" });

  if (tokenError) throw tokenError;

  const now = new Date().toISOString();
  const { error: statusError } = await supabase
    .from("google_connection_status")
    .upsert({
      user_id: userId,
      google_email: googleEmail,
      status: "connected",
      scopes: tokenScopes,
      connected_at: now,
      last_error: null,
      updated_at: now
    }, { onConflict: "user_id" });

  if (statusError) throw statusError;
}

export async function loadGoogleAuth(userId) {
  const supabase = getSupabaseAdmin();
  const { data, error } = await supabase
    .from("google_oauth_tokens")
    .select("*")
    .eq("user_id", userId)
    .maybeSingle();

  if (error) throw error;
  if (!data?.encrypted_refresh_token) {
    throw new HttpError(401, "google_not_connected");
  }

  const client = getGoogleClient();
  client.setCredentials({
    access_token: decryptSecret(data.encrypted_access_token),
    refresh_token: decryptSecret(data.encrypted_refresh_token),
    expiry_date: data.access_token_expires_at
      ? new Date(data.access_token_expires_at).getTime()
      : undefined,
    token_type: data.token_type || "Bearer",
    scope: Array.isArray(data.scopes) ? data.scopes.join(" ") : undefined
  });

  return client;
}

export async function persistGoogleCredentials(userId, authClient) {
  await saveGoogleTokens({
    userId,
    credentials: authClient.credentials
  });
}

export async function markSync(userId) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("google_connection_status")
    .update({
      status: "connected",
      last_sync_at: new Date().toISOString(),
      last_error: null,
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId);
}

export async function markGoogleError(userId, message) {
  const supabase = getSupabaseAdmin();
  await supabase
    .from("google_connection_status")
    .update({
      status: "error",
      last_error: String(message || "google_request_failed").slice(0, 500),
      updated_at: new Date().toISOString()
    })
    .eq("user_id", userId);
}

export function json(statusCode, body, extraHeaders = {}) {
  return {
    statusCode,
    headers: {
      "content-type": "application/json; charset=utf-8",
      "cache-control": "no-store",
      ...extraHeaders
    },
    body: JSON.stringify(body)
  };
}

export function redirect(location) {
  return {
    statusCode: 302,
    headers: {
      location,
      "cache-control": "no-store"
    },
    body: ""
  };
}

export function handleError(error) {
  console.error(error);
  const statusCode =
    error instanceof HttpError ? error.status : 500;
  const message =
    error instanceof HttpError ? error.message : "server_error";
  return json(statusCode, { error: message });
}

export function requireMethod(event, allowed) {
  if (!allowed.includes(event.httpMethod)) {
    throw new HttpError(405, "method_not_allowed");
  }
}

export function parseJsonBody(event) {
  try {
    return event.body ? JSON.parse(event.body) : {};
  } catch {
    throw new HttpError(400, "invalid_json");
  }
}
