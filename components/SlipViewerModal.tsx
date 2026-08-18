import { ExistingOrderRecap } from "@/components/ExistingOrderRecap";
import { formatEnteredAt } from "@/lib/formatEnteredAt";
import type { ExistingOrderSummary } from "@/lib/duplicateCheck";
import type { PhotoLinkInfo } from "@/lib/photoLog";

// The combined photo + digitised SlipLayout viewer -- shared by every
// screen with a clickable slip number (Sales Report's daily and monthly
// views, Members Billing) so they all render it identically off one hook
// (lib/useSlipViewer.ts) instead of three near-copies drifting apart
// (Kareem, 2026-08-20). No header text, no Close button -- clicking
// anywhere on the overlay dismisses it.
export function SlipViewerModal({
  slipNumber,
  slipDetail,
  slipDetailStatus,
  failedPhotoSlip,
  onFailedPhoto,
  onClose,
  // Used only until slipDetail (which carries its own photo fields) has
  // loaded -- lets a caller that already has a photo link handy (Sales
  // Report's per-day photo map) show it immediately instead of waiting on
  // the /api/slip-detail round trip.
  fallbackPhoto,
}: {
  slipNumber: string;
  slipDetail: ExistingOrderSummary | null;
  slipDetailStatus: "loading" | "ready" | "error";
  failedPhotoSlip: string | null;
  onFailedPhoto: (slipNumber: string) => void;
  onClose: () => void;
  fallbackPhoto?: PhotoLinkInfo;
}) {
  const photo = slipDetail ?? fallbackPhoto;

  return (
    <div
      onClick={onClose}
      style={{
        position: "fixed",
        inset: 0,
        background: "rgba(0,0,0,0.85)",
        zIndex: 1000,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "flex-start",
        overflowY: "auto",
        padding: 16,
        gap: 10,
      }}
    >
      {slipDetailStatus === "loading" && <p style={{ color: "#ccc", fontSize: 13 }}>Loading digitised version…</p>}
      {slipDetailStatus === "error" && (
        <p style={{ color: "#f5a3a3", fontSize: 13 }}>Couldn&apos;t load the digitised version.</p>
      )}
      {slipDetailStatus === "ready" && slipDetail && (
        <div style={{ width: "100%", maxWidth: 600, display: "flex", flexDirection: "column", gap: 4 }}>
          {slipDetail.enteredAt && (
            <p style={{ color: "#ccc", fontSize: 12, margin: 0 }}>
              Digitized{slipDetail.enteredBy ? ` by ${slipDetail.enteredBy}` : ""} ({formatEnteredAt(slipDetail.enteredAt)})
            </p>
          )}
          <ExistingOrderRecap order={slipDetail} />
        </div>
      )}
      {slipDetailStatus === "ready" && !slipDetail && !photo?.photoThumbnailUrl && (
        <div style={{ background: "#fff", borderRadius: 8, padding: 16, display: "flex", flexDirection: "column", gap: 8 }}>
          <p style={{ margin: 0, fontSize: 13 }}>No record found for this slip.</p>
        </div>
      )}

      {photo?.photoThumbnailUrl && failedPhotoSlip !== slipNumber && (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={photo.photoThumbnailUrl}
          alt={`Slip #${slipNumber}`}
          onError={() => onFailedPhoto(slipNumber)}
          style={{ maxWidth: "100%", maxHeight: "60vh", borderRadius: 8 }}
        />
      )}
    </div>
  );
}
