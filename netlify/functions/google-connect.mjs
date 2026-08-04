import {
  GOOGLE_SCOPES,
  createOAuthState,
  getGoogleClient,
  handleError,
  json,
  requireMethod,
  requireSupabaseUser
} from "../lib/google-common.mjs";

export async function handler(event) {
  try {
    requireMethod(event, ["POST"]);
    const user = await requireSupabaseUser(event);
    const state = createOAuthState(user.id);
    const client = getGoogleClient();

    const url = client.generateAuthUrl({
      access_type: "offline",
      prompt: "consent",
      include_granted_scopes: true,
      scope: GOOGLE_SCOPES,
      state
    });

    return json(200, { url });
  } catch (error) {
    return handleError(error);
  }
}
