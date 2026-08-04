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
    const gmail = google.gmail({ version: "v1", auth });

    const list = await gmail.users.messages.list({
      userId: "me",
      maxResults: 10,
      q: "newer_than:7d -category:promotions -category:social"
    });

    const details = await Promise.all(
      (list.data.messages || []).slice(0, 10).map(async (item) => {
        const detail = await gmail.users.messages.get({
          userId: "me",
          id: item.id,
          format: "metadata",
          metadataHeaders: ["From", "Subject", "Date"]
        });
        const headers = Object.fromEntries(
          (detail.data.payload?.headers || []).map((header) => [
            header.name,
            header.value
          ])
        );
        return {
          id: item.id,
          threadId: item.threadId,
          from: headers.From || "",
          subject: headers.Subject || "",
          date: headers.Date || "",
          snippet: detail.data.snippet || ""
        };
      })
    );

    await persistGoogleCredentials(user.id, auth);
    await markSync(user.id);
    return json(200, { messages: details });
  } catch (error) {
    if (user?.id) await markGoogleError(user.id, error.message);
    return handleError(error);
  }
}
