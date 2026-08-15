import { google } from "googleapis";
import { Readable } from "stream";
import { getOAuthClient } from "./googleOAuth";

const FOLDER_NAME = "PGYC Order Slip Photos";

// Uploads happen as Kareem's own Google account (via OAuth refresh token),
// not the service account -- a service account has no storage quota of its
// own on a regular (non-Workspace) Drive, so file uploads fail with
// "Service Accounts do not have storage quota" no matter what's shared with
// them. See lib/googleOAuth.ts and app/api/auth/google/start for how the
// refresh token this needs gets set up.
function getDriveClient() {
  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("Missing GOOGLE_OAUTH_REFRESH_TOKEN env var -- visit /api/auth/google/start to authorize");
  }

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  return google.drive({ version: "v3", auth: client });
}

let cachedFolderId: string | null = null;

async function getOrCreateFolder(): Promise<string> {
  if (cachedFolderId) return cachedFolderId;

  const drive = getDriveClient();

  const existing = await drive.files.list({
    q: `name='${FOLDER_NAME}' and mimeType='application/vnd.google-apps.folder' and trashed=false`,
    fields: "files(id, name)",
    spaces: "drive",
  });

  const found = existing.data.files?.[0]?.id;
  if (found) {
    cachedFolderId = found;
    return found;
  }

  const folder = await drive.files.create({
    requestBody: { name: FOLDER_NAME, mimeType: "application/vnd.google-apps.folder" },
    fields: "id",
  });

  const folderId = folder.data.id;
  if (!folderId) throw new Error("Failed to create Drive folder");

  cachedFolderId = folderId;
  return folderId;
}

export async function uploadOrderPhoto(params: {
  imageDataUrl: string;
  fileName: string;
}): Promise<{ fileId: string; webViewLink: string }> {
  const match = params.imageDataUrl.match(/^data:(image\/[a-zA-Z0-9.+-]+);base64,(.+)$/);
  if (!match) throw new Error("Invalid image data URL");
  const [, mediaType, base64Data] = match;

  const folderId = await getOrCreateFolder();
  const drive = getDriveClient();

  const res = await drive.files.create({
    requestBody: { name: params.fileName, parents: [folderId] },
    media: { mimeType: mediaType, body: Readable.from(Buffer.from(base64Data, "base64")) },
    fields: "id, webViewLink",
  });

  const fileId = res.data.id;
  const webViewLink = res.data.webViewLink;
  if (!fileId || !webViewLink) throw new Error("Drive upload did not return a file link");

  return { fileId, webViewLink };
}
