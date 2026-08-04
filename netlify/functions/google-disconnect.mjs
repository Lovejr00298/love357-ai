import {
  getGoogleClient,
  getSupabaseAdmin,
  handleError,
  json,
  loadGoogleAuth,
  requireMethod,
  requireSupabaseUser
} from "../lib/google-common.mjs";

export async function handler(event) {
  try {
    requireMethod(event, ["POST"]);
    const user = await requireSupabaseUser(event);
    const supabase = getSupabaseAdmin();

    try {
      const auth = await loadGoogleAuth(user.id);
      const token =
        auth.credentials.refresh_token ||
        auth.credentials.access_token;
      if (token) {
        const revokeClient = getGoogleClient();
        await revokeClient.revokeToken(token);
      }
    } catch (revokeError) {
      console.warn("Google token revocation was not completed", revokeError);
    }

    const { error: tokenError } = await supabase
      .from("google_oauth_tokens")
      .delete()
      .eq("user_id", user.id);
    if (tokenError) throw tokenError;

    const { error: statusError } = await supabase
      .from("google_connection_status")
      .delete()
      .eq("user_id", user.id);
    if (statusError) throw statusError;

    return json(200, { ok: true });
  } catch (error) {
    return handleError(error);
  }
}
