// Sample order-slip photos shown on the home page so testers can try the
// full scan -> verify -> save flow without needing an actual physical
// slip (Kareem, 2026-08-17). Files live in public/sample-slips/ -- drop a
// photo there and add a matching entry here to add it to the gallery. The
// gallery silently disables itself (renders nothing) while this list is
// empty, so it's safe to ship ahead of having real sample photos.
export interface SampleSlip {
  file: string; // path under public/, e.g. "/sample-slips/bar-1.jpg"
  label: string;
}

export const SAMPLE_SLIPS: SampleSlip[] = [
  { file: "/sample-slips/bar-34897-ryan.jpg", label: "Bar slip #34897" },
  { file: "/sample-slips/bar-34908-steve-payne.jpg", label: "Bar slip #34908" },
  { file: "/sample-slips/bar-34898-rob.jpg", label: "Bar slip #34898" },
  { file: "/sample-slips/bar-34899-jenny.jpg", label: "Bar slip #34899" },
];
