import { google } from "googleapis";
import {
  HttpError,
  handleError,
  json,
  loadGoogleAuth,
  markGoogleError,
  markSync,
  parseJsonBody,
  persistGoogleCredentials,
  requireMethod,
  requireSupabaseUser
} from "../lib/google-common.mjs";

export async function handler(event) {
  let user;
  try {
    requireMethod(event, ["POST"]);
    user = await requireSupabaseUser(event);
    const { to, subject, body } = parseJsonBody(event);

    if (!to || !subject || !body) {
      throw new HttpError(400, "to_subject_body_required");
    }

    const auth = await loadGoogleAuth(user.id);
    const gmail = google.gmail({ version: "v1", auth });
    const raw = Buffer.from(
      `To: ${to}\r\nSubject: ${subject}\r\nContent-Type: text/plain; charset=utf-8\r\n\r\n${body}`
    ).toString("base64url");

    const draft = await gmail.users.drafts.create({
      userId: "me",
      requestBody: { message: { raw } }
    });

    await persistGoogleCredentials(user.id, auth);
    await markSync(user.id);
    return json(200, { id: draft.data.id });
  } catch (error) {
    if (user?.id) await markGoogleError(user.id, error.message);
    return handleError(error);
  }
}
