// Client-only. Downscales an image data URL so its longest edge is at most
// maxDimension, preserving aspect ratio. Claude's vision API prices images
// by pixel dimensions (not file size) and auto-downsamples anything above
// ~1568px on the long edge internally -- so sending a full-resolution phone
// photo (often 3000-4000px+) spends tokens on detail the model never uses.
// Only used for the copy sent to /api/extract -- the original, full-
// resolution data URL is kept in state for display and for the photo
// archived to Google Drive on save, so this never degrades the permanent
// record, only what's billed for reading it.
//
// Images already at or under the cap are returned unchanged (no upscaling,
// no re-compressing an already-small photo). Falls back to the original on
// any failure (unsupported canvas, decode error) rather than blocking the
// scan.
export async function resizeForVisionApi(dataUrl: string, maxDimension = 1568): Promise<string> {
  try {
    const img = await loadImage(dataUrl);
    if (img.width <= maxDimension && img.height <= maxDimension) {
      return dataUrl;
    }

    const scale = maxDimension / Math.max(img.width, img.height);
    const width = Math.round(img.width * scale);
    const height = Math.round(img.height * scale);

    const canvas = document.createElement("canvas");
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return dataUrl;

    ctx.drawImage(img, 0, 0, width, height);
    return canvas.toDataURL("image/jpeg", 0.9);
  } catch {
    return dataUrl;
  }
}

function loadImage(dataUrl: string): Promise<HTMLImageElement> {
  return new Promise((resolve, reject) => {
    const img = new Image();
    img.onload = () => resolve(img);
    img.onerror = () => reject(new Error("Failed to decode image"));
    img.src = dataUrl;
  });
}
