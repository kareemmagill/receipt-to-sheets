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
// Cached alongside the OAuth2 client itself (lib/googleOAuth.ts) -- reused
// across both call sites within a single upload (folder lookup + the
// upload itself used to each build their own client, doubling the token
// exchange) and across requests within a warm serverless instance.
let cachedDrive: ReturnType<typeof google.drive> | null = null;

function getDriveClient() {
  if (cachedDrive) return cachedDrive;

  const refreshToken = process.env.GOOGLE_OAUTH_REFRESH_TOKEN;
  if (!refreshToken) {
    throw new Error("Missing GOOGLE_OAUTH_REFRESH_TOKEN env var -- visit /api/auth/google/start to authorize");
  }

  const client = getOAuthClient();
  client.setCredentials({ refresh_token: refreshToken });
  cachedDrive = google.drive({ version: "v3", auth: client });
  return cachedDrive;
}

let cachedFolderId: string | null = null;

async function getOrCreateFolder(): Promise<string> {
  // Skips a real Drive API round trip (files.list) on every single save --
  // cachedFolderId only helps warm instances, and this app's traffic is
  // low enough that cold starts (no cache) are common. The folder never
  // changes, so once known, its ID can just be hardcoded via env var.
  const knownFolderId = process.env.GOOGLE_DRIVE_FOLDER_ID;
  if (knownFolderId) return knownFolderId;

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

  // "Anyone with the link" (not publicly searchable/indexed) -- lets the
  // photo embed inline in the app as a plain <img> for any staff member,
  // not just whoever's Google account the upload happened to run as.
  // Without this, "View photo" opened Drive in a new tab and only worked
  // for whoever was signed into that same account (Kareem, 2026-08-17).
  try {
    await drive.permissions.create({
      fileId,
      requestBody: { role: "reader", type: "anyone" },
    });
  } catch {
    // Best-effort -- the file still saved and webViewLink still works for
    // the uploading account even if this fails.
  }

  return { fileId, webViewLink };
}

// Drive's thumbnail endpoint serves the actual image bytes directly (no
// Google sign-in prompt, unlike webViewLink's own viewer page), so it's
// what the app uses to embed a saved chit's photo inline instead of
// linking out to Drive. Needs the file to be link-shareable (see the
// permissions.create call above) -- photos uploaded before that was added
// won't embed until re-shared.
export function driveThumbnailUrl(fileId: string, sizePx = 1200): string {
  return `https://drive.google.com/thumbnail?id=${fileId}&sz=w${sizePx}`;
}

/**
 * Reads a Drive file's bytes back out as a data URL -- used to re-feed a
 * queued-for-later photo (see lib/pendingUploads.ts) into the same
 * /api/extract flow a live camera capture uses, without the client ever
 * needing to fetch cross-origin Drive URLs itself (Kareem, 2026-08-20:
 * "upload a bunch of pictures for processing later"). Server-side only --
 * goes through the same authorized Drive client as the upload, so no
 * CORS/sign-in concerns the way a client-side fetch of a Drive URL would
 * have.
 */
export async function downloadFileAsDataUrl(fileId: string): Promise<string> {
  const drive = getDriveClient();

  const [meta, media] = await Promise.all([
    drive.files.get({ fileId, fields: "mimeType" }),
    drive.files.get({ fileId, alt: "media" }, { responseType: "arraybuffer" }),
  ]);

  const mimeType = meta.data.mimeType || "image/jpeg";
  const base64 = Buffer.from(media.data as ArrayBuffer).toString("base64");
  return `data:${mimeType};base64,${base64}`;
}

/**
 * Permanently deletes a file from Drive -- used to clean up a Pending
 * Uploads photo once its queue row is removed, whether that's because it
 * was successfully processed (a separate archival copy is saved at that
 * point, so the pending one is redundant) or deleted from the
 * Development page (Kareem, 2026-08-20: "view and delete/delete all
 * these uploaded pictures").
 */
export async function deleteFile(fileId: string): Promise<void> {
  const drive = getDriveClient();
  await drive.files.delete({ fileId });
}
