import { createClient } from "https://esm.sh/@supabase/supabase-js@2";

const cfg = {
  supabaseUrl: "https://iqimqknagxggokleptjo.supabase.co",
  supabaseAnonKey: "sb_publishable_EDvaeUF7XopivLt91T4AMw_Rb47gCAs"
};

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
let recoveryMode = false;

function setError(message = "") {
  errorBox.textContent = message;
}

function setMode(next) {
  mode = next;
  const signup = next === "signup";
  loginTab.classList.toggle("active", !signup);
  signupTab.classList.toggle("active", signup);
  nameField.style.display = signup ? "grid" : "none";
  submit.textContent = signup ? "Create Account" : "Sign In";
  document.getElementById("authHeading").textContent = signup
    ? "Create your workspace"
    : "Welcome back";
  document.getElementById("authSubheading").textContent = signup
    ? "Start a private LOVE357 AI business workspace."
    : "Sign in to your private executive workspace.";
  const forgotButton = document.getElementById("forgotPasswordButton");
  if (forgotButton) forgotButton.style.display = signup ? "none" : "block";
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

function ensureAuthEnhancementStyles() {
  if (document.getElementById("love357AuthEnhancementStyles")) return;

  const style = document.createElement("style");
  style.id = "love357AuthEnhancementStyles";
  style.textContent = `
    #forgotPasswordButton {
      display: block;
      width: 100%;
      margin: 10px 0 0;
      padding: 8px 10px;
      border: 0;
      background: transparent;
      color: #9bbcff;
      font: inherit;
      font-weight: 700;
      text-decoration: underline;
      cursor: pointer;
    }
    #forgotPasswordButton:disabled { opacity: .6; cursor: wait; }
    #love357PasswordOverlay {
      position: fixed;
      inset: 0;
      z-index: 999999;
      display: grid;
      place-items: center;
      padding: 20px;
      background: rgba(2, 10, 24, .82);
      backdrop-filter: blur(8px);
    }
    #love357PasswordOverlay[hidden] { display: none; }
    #love357PasswordCard {
      width: min(460px, 100%);
      border: 1px solid rgba(125, 162, 225, .38);
      border-radius: 22px;
      padding: 24px;
      color: #f6f8ff;
      background: linear-gradient(145deg, #11284b, #0b1b34);
      box-shadow: 0 28px 70px rgba(0, 0, 0, .45);
    }
    #love357PasswordCard h2 { margin: 0 0 8px; font-size: 1.55rem; }
    #love357PasswordCard p { margin: 0 0 18px; color: #b9c7df; line-height: 1.45; }
    #love357PasswordCard label { display: grid; gap: 7px; margin-top: 13px; font-weight: 700; }
    #love357PasswordCard input {
      width: 100%;
      box-sizing: border-box;
      border: 1px solid #416a9f;
      border-radius: 12px;
      padding: 13px 14px;
      color: #fff;
      background: #081a31;
      font: inherit;
    }
    #love357PasswordMessage { min-height: 22px; margin-top: 12px; color: #ffb4b4; }
    #love357PasswordActions { display: flex; gap: 10px; justify-content: flex-end; margin-top: 18px; }
    #love357PasswordActions button {
      border: 1px solid #496f9f;
      border-radius: 12px;
      padding: 11px 16px;
      color: #fff;
      background: #17375f;
      font: inherit;
      font-weight: 800;
      cursor: pointer;
    }
    #love357PasswordActions button.primary {
      border-color: transparent;
      background: linear-gradient(135deg, #69a7ff, #8b61ff);
    }
    #love357PasswordActions button:disabled { opacity: .55; cursor: wait; }
    #changePasswordButton { margin-right: 8px; }
  `;
  document.head.appendChild(style);
}

function ensurePasswordDialog() {
  let overlay = document.getElementById("love357PasswordOverlay");
  if (overlay) return overlay;

  overlay = document.createElement("div");
  overlay.id = "love357PasswordOverlay";
  overlay.hidden = true;
  overlay.innerHTML = `
    <section id="love357PasswordCard" role="dialog" aria-modal="true" aria-labelledby="love357PasswordTitle">
      <h2 id="love357PasswordTitle">Set a new password</h2>
      <p id="love357PasswordText">Enter a new password for your LOVE357 AI account.</p>
      <label>
        New password
        <input id="love357NewPassword" type="password" minlength="8" autocomplete="new-password" placeholder="At least 8 characters">
      </label>
      <label>
        Confirm new password
        <input id="love357ConfirmPassword" type="password" minlength="8" autocomplete="new-password" placeholder="Type it again">
      </label>
      <div id="love357PasswordMessage" aria-live="polite"></div>
      <div id="love357PasswordActions">
        <button id="love357PasswordCancel" type="button">Cancel</button>
        <button id="love357PasswordSave" class="primary" type="button">Save New Password</button>
      </div>
    </section>
  `;
  document.body.appendChild(overlay);

  const cancelButton = overlay.querySelector("#love357PasswordCancel");
  const saveButton = overlay.querySelector("#love357PasswordSave");
  const newPassword = overlay.querySelector("#love357NewPassword");
  const confirmPassword = overlay.querySelector("#love357ConfirmPassword");
  const message = overlay.querySelector("#love357PasswordMessage");

  cancelButton.addEventListener("click", () => {
    if (recoveryMode) return;
    overlay.hidden = true;
    newPassword.value = "";
    confirmPassword.value = "";
    message.textContent = "";
  });

  saveButton.addEventListener("click", async () => {
    message.textContent = "";
    const nextPassword = newPassword.value;
    const confirmation = confirmPassword.value;

    if (nextPassword.length < 8) {
      message.textContent = "Use at least 8 characters.";
      return;
    }
    if (nextPassword !== confirmation) {
      message.textContent = "The two passwords do not match.";
      return;
    }
    if (!supabase) {
      message.textContent = "Cloud login is not available.";
      return;
    }

    saveButton.disabled = true;
    cancelButton.disabled = true;
    try {
      const { error } = await supabase.auth.updateUser({ password: nextPassword });
      if (error) throw error;

      message.style.color = "#9ff0b5";
      message.textContent = "Password updated successfully.";
      recoveryMode = false;
      history.replaceState({}, document.title, location.pathname);

      setTimeout(() => {
        overlay.hidden = true;
        newPassword.value = "";
        confirmPassword.value = "";
        message.textContent = "";
        message.style.color = "#ffb4b4";
        cancelButton.hidden = false;
      }, 900);
    } catch (error) {
      message.style.color = "#ffb4b4";
      message.textContent = error.message || "Unable to update the password.";
    } finally {
      saveButton.disabled = false;
      cancelButton.disabled = false;
    }
  });

  confirmPassword.addEventListener("keydown", (event) => {
    if (event.key === "Enter") saveButton.click();
  });

  return overlay;
}

function showPasswordDialog({ recovery = false } = {}) {
  ensureAuthEnhancementStyles();
  const overlay = ensurePasswordDialog();
  recoveryMode = recovery;

  overlay.querySelector("#love357PasswordTitle").textContent = recovery
    ? "Choose your new password"
    : "Change your password";
  overlay.querySelector("#love357PasswordText").textContent = recovery
    ? "Your recovery link is verified. Create a new password to finish restoring access."
    : "Enter and confirm a new password for your LOVE357 AI account.";
  overlay.querySelector("#love357PasswordCancel").hidden = recovery;
  overlay.querySelector("#love357PasswordMessage").textContent = "";
  overlay.hidden = false;
  setTimeout(() => overlay.querySelector("#love357NewPassword").focus(), 0);
}

function installForgotPasswordButton() {
  if (!submit || document.getElementById("forgotPasswordButton")) return;

  const button = document.createElement("button");
  button.id = "forgotPasswordButton";
  button.type = "button";
  button.textContent = "Forgot password?";
  const actionRow = preview?.parentElement || submit.parentElement;
  actionRow.insertAdjacentElement("afterend", button);

  button.addEventListener("click", async () => {
    if (!supabase) {
      setError("Cloud login is not available yet.");
      return;
    }

    const address = email.value.trim();
    if (!address) {
      setError("Enter your email address first, then click Forgot password.");
      email.focus();
      return;
    }

    button.disabled = true;
    setError();
    try {
      const redirectTo = `${window.location.origin}/?password-recovery=1`;
      const { error } = await supabase.auth.resetPasswordForEmail(address, { redirectTo });
      if (error) throw error;
      setError("Password reset email sent. Open the newest email and use the link once.");
    } catch (error) {
      setError(error.message || "Unable to send the password reset email.");
    } finally {
      button.disabled = false;
    }
  });
}

function installSettingsPasswordButton() {
  if (!activeUser || document.getElementById("changePasswordButton")) return;

  const buttons = [...document.querySelectorAll("button")];
  const logoutButton = buttons.find((button) => /logout\s*\/\s*exit program/i.test(button.textContent || ""));
  if (!logoutButton?.parentElement) return;

  const button = document.createElement("button");
  button.id = "changePasswordButton";
  button.type = "button";
  button.className = logoutButton.className;
  button.textContent = "Change Password";
  button.addEventListener("click", () => showPasswordDialog({ recovery: false }));
  logoutButton.parentElement.insertBefore(button, logoutButton);
}

async function pullWorkspace() {
  if (!supabase || !activeUser) return;
  const { data, error } = await supabase
    .from("workspaces")
    .select("app_state")
    .eq("user_id", activeUser.id)
    .maybeSingle();
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
  const { error } = await supabase.from("workspaces").upsert(
    {
      user_id: activeUser.id,
      app_state: appState,
      updated_at: new Date().toISOString()
    },
    { onConflict: "user_id" }
  );
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

async function activateCloudSession(session, { skipWorkspace = false } = {}) {
  if (!session?.user) return;

  const firstLogin = !activeUser;
  activeUser = session.user;
  openApp(activeUser.email, true);
  installSaveSync();
  installSettingsPasswordButton();

  if (!firstLogin || skipWorkspace) return;

  const { data } = await supabase
    .from("workspaces")
    .select("app_state")
    .eq("user_id", activeUser.id)
    .maybeSingle();

  if (data?.app_state && Object.keys(data.app_state).length) {
    const localRaw = localStorage.getItem("love357_v1_beta");
    const local = localRaw ? JSON.parse(localRaw) : null;
    if (!local?.profile?.setupComplete) {
      localStorage.setItem("love357_v1_beta", JSON.stringify(data.app_state));
      location.reload();
    }
  } else {
    await pushWorkspace();
  }
}

loginTab.addEventListener("click", () => setMode("login"));
signupTab.addEventListener("click", () => setMode("signup"));
preview.addEventListener("click", localPreview);
password.addEventListener("keydown", (event) => {
  if (event.key === "Enter") submit.click();
});

ensureAuthEnhancementStyles();

if (!configured) {
  submit.addEventListener("click", () =>
    setError("Cloud login is not activated yet. Add your Supabase URL and anon key to config.js, or use Local Preview.")
  );
  signOut.addEventListener("click", () => {
    sessionStorage.removeItem("love357_local_preview");
    location.reload();
  });
  if (sessionStorage.getItem("love357_local_preview") === "1") localPreview();
} else {
  supabase = createClient(cfg.supabaseUrl, cfg.supabaseAnonKey);
  installForgotPasswordButton();

  submit.addEventListener("click", async () => {
    setError();
    if (!email.value.trim() || password.value.length < 8) {
      return setError("Enter a valid email and a password with at least 8 characters.");
    }

    submit.disabled = true;
    try {
      if (mode === "signup") {
        const { data, error } = await supabase.auth.signUp({
          email: email.value.trim(),
          password: password.value,
          options: { data: { full_name: name.value.trim() } }
        });
        if (error) throw error;
        if (!data.session) {
          setError("Account created. Check your email to confirm your address, then sign in.");
        }
      } else {
        const { error } = await supabase.auth.signInWithPassword({
          email: email.value.trim(),
          password: password.value
        });
        if (error) throw error;
      }
    } catch (error) {
      setError(error.message || "Unable to continue.");
    } finally {
      submit.disabled = false;
    }
  });

  signOut.addEventListener("click", async () => {
    await supabase.auth.signOut();
    sessionStorage.removeItem("love357_local_preview");
    location.reload();
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (event === "PASSWORD_RECOVERY" && session?.user) {
      activateCloudSession(session, { skipWorkspace: true })
        .then(() => showPasswordDialog({ recovery: true }))
        .catch((error) => console.error("Recovery setup failed", error));
      return;
    }

    if (session?.user) {
      activateCloudSession(session).catch((error) => console.error("Session setup failed", error));
    }
  });

  const settingsObserver = new MutationObserver(() => installSettingsPasswordButton());
  settingsObserver.observe(document.body, { childList: true, subtree: true });

  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (session?.user) {
    const recoveryRequested = new URLSearchParams(location.search).get("password-recovery") === "1";
    await activateCloudSession(session, { skipWorkspace: recoveryRequested });
    if (recoveryRequested) showPasswordDialog({ recovery: true });
  } else if (sessionStorage.getItem("love357_local_preview") === "1") {
    localPreview();
  }
}
