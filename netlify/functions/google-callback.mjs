import { google } from "googleapis";
import {
  getAppUrl,
  getGoogleClient,
  redirect,
  saveGoogleTokens,
  verifyOAuthState
} from "../lib/google-common.mjs";

export async function handler(event) {
  const appUrl = getAppUrl();
  try {
    const params = event.queryStringParameters || {};
    if (params.error) {
      return redirect(`${appUrl}/?google=denied`);
    }

    const { userId } = verifyOAuthState(params.state);
    if (!params.code) {
      return redirect(`${appUrl}/?google=missing_code`);
    }

    const auth = getGoogleClient();
    const { tokens } = await auth.getToken(params.code);
    auth.setCredentials(tokens);

    let googleEmail = null;
    try {
      const gmail = google.gmail({ version: "v1", auth });
      const profile = await gmail.users.getProfile({ userId: "me" });
      googleEmail = profile.data.emailAddress || null;
    } catch (profileError) {
      console.warn("Unable to read Google profile email", profileError);
    }

    await saveGoogleTokens({
      userId,
      credentials: tokens,
      googleEmail
    });

    return redirect(`${appUrl}/?google=connected`);
  } catch (error) {
    console.error(error);
    return redirect(`${appUrl}/?google=error`);
  }
}
