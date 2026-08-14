// crypto.randomUUID() requires a secure context (HTTPS or localhost) and is
// unavailable when testing over plain HTTP on a phone via LAN IP.
let nextId = 0;
export function makeId(prefix = "id"): string {
  nextId += 1;
  return `${prefix}-${Date.now()}-${nextId}`;
}
