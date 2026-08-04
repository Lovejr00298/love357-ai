import {
  getSupabaseAdmin,
  handleError,
  json,
  requireMethod,
  requireSupabaseUser
} from "../lib/google-common.mjs";

export async function handler(event) {
  try {
    requireMethod(event, ["GET"]);
    const user = await requireSupabaseUser(event);
    const supabase = getSupabaseAdmin();

    const { data, error } = await supabase
      .from("google_connection_status")
      .select("google_email,status,scopes,connected_at,last_sync_at,last_error")
      .eq("user_id", user.id)
      .maybeSingle();

    if (error) throw error;

    return json(200, {
      connected: data?.status === "connected",
      connection: data || null
    });
  } catch (error) {
    return handleError(error);
  }
}
