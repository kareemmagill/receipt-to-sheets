import { readTab } from "./googleSheets";
import { driveThumbnailUrl } from "./googleDrive";

// Photo Log columns -- see PHOTO_LOG_HEADER in app/api/save/route.ts.
const LOG_SLIP_COL = 1;
const LOG_PHOTO_LINK_COL = 4;

// Extracts the file ID out of a Drive webViewLink like
// https://drive.google.com/file/d/FILE_ID/view?usp=drivesdk
const DRIVE_FILE_ID_REGEX = /\/d\/([a-zA-Z0-9_-]+)/;

export interface PhotoLinkInfo {
  photoLink: string;
  // Embeddable version (see lib/googleDrive.ts's driveThumbnailUrl) --
  // absent if the file ID couldn't be parsed out of photoLink.
  photoThumbnailUrl?: string;
}

/**
 * Every slip number that's ever had a photo archived, mapped to its most
 * recent photo (an "Update Record" re-save archives a new one under the
 * same slip number, so a slip can be logged more than once -- forward
 * iteration + Map.set naturally keeps whichever was appended last, since
 * Photo Log rows are always appended in save order). Empty map, not a
 * throw, if the tab doesn't exist yet.
 */
export async function photoLinksBySlipNumber(): Promise<Map<string, PhotoLinkInfo>> {
  const map = new Map<string, PhotoLinkInfo>();
  try {
    const logRows = await readTab("Photo Log");
    for (const row of logRows.slice(1)) {
      const slipNumber = (row[LOG_SLIP_COL] ?? "").trim();
      const photoLink = (row[LOG_PHOTO_LINK_COL] ?? "").trim();
      if (!slipNumber || !photoLink) continue;
      const fileId = photoLink.match(DRIVE_FILE_ID_REGEX)?.[1];
      map.set(slipNumber, { photoLink, photoThumbnailUrl: fileId ? driveThumbnailUrl(fileId) : undefined });
    }
  } catch {
    // No Photo Log tab yet -- fine, empty map.
  }
  return map;
}
