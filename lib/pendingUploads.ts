import { readTab, appendRows, ensureTabExists, deleteDataRowsAt } from "./googleSheets";
import { driveThumbnailUrl } from "./googleDrive";

// A queue of photos uploaded now for OCR + review later (Kareem,
// 2026-08-20: "add a page for staff to upload a bunch of pictures for
// processing later"). A row's mere presence here means "still pending" --
// there's no separate status column, since processing a photo removes its
// row entirely (see removePendingUpload). Kept as its own tab, not Photo
// Log, because these photos don't have a slip number yet -- that's the
// whole point of the queue.
const PENDING_UPLOADS_TAB = "Pending Uploads";
const PENDING_UPLOADS_HEADER = ["Photo Link", "Uploaded At", "Uploaded By", "Device"];

const PHOTO_LINK_COL = 0;
const UPLOADED_AT_COL = 1;
const UPLOADED_BY_COL = 2;
const DEVICE_COL = 3;

// Extracts the file ID out of a Drive webViewLink like
// https://drive.google.com/file/d/FILE_ID/view?usp=drivesdk -- same
// pattern as lib/photoLog.ts.
const DRIVE_FILE_ID_REGEX = /\/d\/([a-zA-Z0-9_-]+)/;

export interface PendingUpload {
  // 1-indexed sheet row -- needed to remove this entry once processed
  // (see removePendingUpload) or to look its photo back up by row rather
  // than trusting a client-supplied file ID.
  rowNumber: number;
  photoLink: string;
  photoThumbnailUrl?: string;
  uploadedAt: string;
  uploadedBy: string;
  device: string;
}

/** Every still-pending photo, oldest first (upload/append order). */
export async function listPendingUploads(): Promise<PendingUpload[]> {
  let rows: string[][];
  try {
    rows = await readTab(PENDING_UPLOADS_TAB);
  } catch {
    return []; // tab doesn't exist yet -- nothing's ever been queued
  }

  const entries: PendingUpload[] = [];
  rows.slice(1).forEach((row, i) => {
    const photoLink = (row[PHOTO_LINK_COL] ?? "").trim();
    if (!photoLink) return;
    const fileId = photoLink.match(DRIVE_FILE_ID_REGEX)?.[1];
    entries.push({
      rowNumber: i + 2,
      photoLink,
      photoThumbnailUrl: fileId ? driveThumbnailUrl(fileId) : undefined,
      uploadedAt: (row[UPLOADED_AT_COL] ?? "").trim(),
      uploadedBy: (row[UPLOADED_BY_COL] ?? "").trim(),
      device: (row[DEVICE_COL] ?? "").trim(),
    });
  });
  return entries;
}

export async function findPendingUpload(rowNumber: number): Promise<PendingUpload | null> {
  const entries = await listPendingUploads();
  return entries.find((e) => e.rowNumber === rowNumber) ?? null;
}

export async function addPendingUpload(params: {
  photoLink: string;
  uploadedBy: string;
  device: string;
}): Promise<void> {
  await ensureTabExists(PENDING_UPLOADS_TAB, PENDING_UPLOADS_HEADER);
  await appendRows(PENDING_UPLOADS_TAB, [
    [params.photoLink, new Date().toISOString(), params.uploadedBy, params.device],
  ]);
}

export async function removePendingUpload(rowNumber: number): Promise<void> {
  await deleteDataRowsAt(PENDING_UPLOADS_TAB, [rowNumber]);
}

export function driveFileIdFromPhotoLink(photoLink: string): string | null {
  return photoLink.match(DRIVE_FILE_ID_REGEX)?.[1] ?? null;
}
