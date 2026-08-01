import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
if (!window.LOVE357_CONFIG) {
  await import("./config.js?v=20260731");
}
const cfg = window.LOVE357_CONFIG || {};
const configured = Boolean(cfg.supabaseUrl && cfg.supabaseAnonKey);
const gate = document.getElementById("authGate");
const email = document.getElementById("authEmail");
const password = document.getElementById("authPassword");
const name = document.getElementById("authName");
const nameField = document.getElementById("nameField");
const errorBox = document.getElementById("authError");
const submit = document.getElementById("authSubmit");
const loginTab = document.getElementById("loginTab");
const signupTab = document.getElementById("signupTab");
const preview = document.getElementById("previewButton");
const signOut = document.getElementById("signOutButton");
const cloudStatus = document.getElementById("cloudStatus");
let mode = "login";
let supabase = null;
let activeUser = null;
let syncTimer = null;

function setError(message = "") { errorBox.textContent = message; }
function setMode(next) {
  mode = next;
  const signup = next === "signup";
  loginTab.classList.toggle("active", !signup);
  signupTab.classList.toggle("active", signup);
  nameField.style.display = signup ? "grid" : "none";
  submit.textContent = signup ? "Create Account" : "Sign In";
  document.getElementById("authHeading").textContent = signup ? "Create your workspace" : "Welcome back";
  document.getElementById("authSubheading").textContent = signup ? "Start a private LOVE357 AI business workspace." : "Sign in to your private executive workspace.";
  setError();
}
function openApp(label, live = false) {
  gate.classList.add("hidden");
  cloudStatus.textContent = live ? `● Cloud Sync • ${label}` : "● Local Preview";
  cloudStatus.classList.toggle("live", live);
  cloudStatus.classList.toggle("local", !live);
}
function localPreview() {
  sessionStorage.setItem("love357_local_preview", "1");
  openApp("Local Preview", false);
}

loginTab.addEventListener("click", () => setMode("login"));
signupTab.addEventListener("click", () => setMode("signup"));
preview.addEventListener("click", localPreview);
password.addEventListener("keydown", (event) => { if (event.key === "Enter") submit.click(); });

async function pullWorkspace() {
  if (!supabase || !activeUser) return;
  const { data, error } = await supabase.from("workspaces").select("app_state").eq("user_id", activeUser.id).maybeSingle();
  if (error) throw error;
  if (data?.app_state && Object.keys(data.app_state).length) {
    localStorage.setItem("love357_v1_beta", JSON.stringify(data.app_state));
    location.reload();
  }
}
async function pushWorkspace() {
  if (!supabase || !activeUser) return;
  const raw = localStorage.getItem("love357_v1_beta");
  if (!raw) return;
  const appState = JSON.parse(raw);
  const { error } = await supabase.from("workspaces").upsert({
    user_id: activeUser.id,
    app_state: appState,
    updated_at: new Date().toISOString()
  }, { onConflict: "user_id" });
  if (error) console.error("Cloud sync failed", error);
}
function installSaveSync() {
  const originalSave = window.save;
  if (typeof originalSave !== "function" || originalSave.__cloudWrapped) return;
  const wrapped = function (...args) {
    const result = originalSave.apply(this, args);
    clearTimeout(syncTimer);
    syncTimer = setTimeout(pushWorkspace, 450);
    return result;
  };
  wrapped.__cloudWrapped = true;
  window.save = wrapped;
}

if (!configured) {
  submit.addEventListener("click", () => setError("Cloud login is not activated yet. Add your Supabase URL and anon key to config.js, or use Local Preview."));
  signOut.addEventListener("click", () => { sessionStorage.removeItem("love357_local_preview"); location.reload(); });
  if (sessionStorage.getItem("love357_local_preview") === "1") localPreview();
} else {
  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  submit.addEventListener("click", async () => {
    setError();
    if (!email.value.trim() || password.value.length < 8) return setError("Enter a valid email and a password with at least 8 characters.");
    submit.disabled = true;
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.value.trim(), password: password.value,
          options: { data: { full_name: name.value.trim() } }
        });
        if (error) throw error;
        if (!data.session) setError("Account created. Check your email to confirm your address, then sign in.");
      } else {
        const { error } = await supabase.auth.signInWithPassword({ email: email.value.trim(), password: password.value });
        if (error) throw error;
      }
    } catch (error) { setError(error.message || "Unable to continue."); }
    finally { submit.disabled = false; }
  });
  signOut.addEventListener("click", async () => { await supabase.auth.signOut(); sessionStorage.removeItem("love357_local_preview"); location.reload(); });
  supabase.auth.onAuthStateChange(async (_event, session) => {
    if (!session?.user) return;
    const firstLogin = !activeUser;
    activeUser = session.user;
    openApp(activeUser.email, true);
    installSaveSync();
    if (firstLogin) {
      const { data } = await supabase.from("workspaces").select("app_state").eq("user_id", activeUser.id).maybeSingle();
      if (data?.app_state && Object.keys(data.app_state).length) {
        const localRaw = localStorage.getItem("love357_v1_beta");
        const local = localRaw ? JSON.parse(localRaw) : null;
        if (!local?.profile?.setupComplete) {
          localStorage.setItem("love357_v1_beta", JSON.stringify(data.app_state));
          location.reload();
        }
      } else await pushWorkspace();
    }
  });
  const { data: { session } } = await supabase.auth.getSession();
  if (session?.user) {
    activeUser = session.user;
    openApp(activeUser.email, true);
    installSaveSync();
  } else if (sessionStorage.getItem("love357_local_preview") === "1") localPreview();
}
