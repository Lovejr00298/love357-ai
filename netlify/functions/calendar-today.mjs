import { google } from "googleapis";
import {
  handleError,
  json,
  loadGoogleAuth,
  markGoogleError,
  markSync,
  persistGoogleCredentials,
  requireMethod,
  requireSupabaseUser
} from "../lib/google-common.mjs";

export async function handler(event) {
  let user;
  try {
    requireMethod(event, ["GET"]);
    user = await requireSupabaseUser(event);
    const auth = await loadGoogleAuth(user.id);
    const calendar = google.calendar({ version: "v3", auth });

    const now = new Date();
    const max = new Date(now.getTime() + 24 * 60 * 60 * 1000);
    const result = await calendar.events.list({
      calendarId: "primary",
      timeMin: now.toISOString(),
      timeMax: max.toISOString(),
      singleEvents: true,
      orderBy: "startTime",
      maxResults: 20
    });

    const events = (result.data.items || []).map((eventItem) => ({
      id: eventItem.id,
      summary: eventItem.summary || "",
      start: eventItem.start?.dateTime || eventItem.start?.date || "",
      end: eventItem.end?.dateTime || eventItem.end?.date || "",
      location: eventItem.location || ""
    }));

    await persistGoogleCredentials(user.id, auth);
    await markSync(user.id);
    return json(200, { events });
  } catch (error) {
    if (user?.id) await markGoogleError(user.id, error.message);
    return handleError(error);
  }
}
