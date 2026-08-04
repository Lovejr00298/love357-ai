import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = window.LOVE357_CONFIG || {};
const supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);

async function sessionToken() {
  const { data: { session }, error } = await supabase.auth.getSession();
  if (error || !session?.access_token) {
    throw new Error("Please sign in before connecting Google.");
  }
  return session.access_token;
}

async function googleFetch(functionName, options = {}) {
  const token = await sessionToken();
  const response = await fetch(`/.netlify/functions/${functionName}`, {
    ...options,
    headers: {
      "content-type": "application/json",
      ...(options.headers || {}),
      authorization: `Bearer ${token}`
    }
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data.error || "Google request failed.");
  return data;
}

async function connect() {
  const { url } = await googleFetch("google-connect", { method: "POST" });
  window.location.assign(url);
}

async function status() {
  return googleFetch("google-status");
}

async function gmailBrief() {
  return googleFetch("gmail-brief");
}

async function calendarToday() {
  return googleFetch("calendar-today");
}

async function createDraft({ to, subject, body }) {
  return googleFetch("gmail-draft", {
    method: "POST",
    body: JSON.stringify({ to, subject, body })
  });
}

async function disconnect() {
  return googleFetch("google-disconnect", { method: "POST" });
}

window.LOVE357_GOOGLE = {
  connect,
  status,
  gmailBrief,
  calendarToday,
  createDraft,
  disconnect
};

window.dispatchEvent(new CustomEvent("love357:google-ready"));
