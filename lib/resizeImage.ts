// Client-only. Downscales an image data URL so its longest edge is at most
// maxDimension, preserving aspect ratio. Two callers, two different caps:
// the copy sent to /api/extract uses the default 1568px, matching Claude's
// vision API internal downsampling (pricing is by pixel dimensions, so a
// full-res phone photo of 3000-4000px+ just spends tokens on detail the
// model never uses); the copy sent to /api/save for Drive archiving uses a
// larger cap (see call sites) -- full-resolution originals (often 4-8MB+ as
// base64) were silently failing that save with a platform-level "Request
// Entity Too Large" response the client couldn't even parse as JSON (found
// 2026-08-16, in real use). The on-screen preview still shows the true
// original, held separately in state -- only the two network payloads are
// downsized.
//
// Images already at or under the cap are returned unchanged (no upscaling,
// no re-compressing an already-small photo). Falls back to the original on
// any failure (unsupported canvas, decode error) rather than blocking the
// scan -- callers should still expect the odd oversized upload to fail.
export async function resizeImage(dataUrl: string, maxDimension = 1568): Promise<string> {
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
