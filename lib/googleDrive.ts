import { google } from "googleapis";
import { Readable } from "stream";

const FOLDER_NAME = "PGYC Order Slip Photos";
// Shared with Kareem's own Google account so the folder shows up in his
// normal Drive, not just the service account's own (very limited) storage.
const SHARE_WITH_EMAIL = "kareem.magill@gmail.com";

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !privateKey) {
    throw new Error("Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY env vars");
  }

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/drive"],
  });
}

function getDriveClient() {
  return google.drive({ version: "v3", auth: getAuth() });
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

  try {
    await drive.permissions.create({
      fileId: folderId,
      requestBody: { type: "user", role: "writer", emailAddress: SHARE_WITH_EMAIL },
      sendNotificationEmail: false,
    });
  } catch {
    // Non-fatal — uploads still work even if sharing failed for some reason.
  }

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
