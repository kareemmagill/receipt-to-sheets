import { NextResponse, type NextRequest } from "next/server";

// Gates the whole app (pages and API routes alike) behind one shared
// password -- there's no per-user account system, and this holds real
// sales/customer data plus destructive dev-only endpoints, so it can't sit
// on the public internet with nothing in front of it. A single shared
// password (given to staff the same informal way as the partner invite
// links) is the right amount of access control for a handful of club
// staff, not a full login system.
//
// If APP_BASIC_AUTH_USER/PASSWORD aren't set (e.g. local dev), the app
// stays open rather than locking developers out with no way to unlock it.
const REALM = "PGYC Receipts";

export function middleware(req: NextRequest) {
  const user = process.env.APP_BASIC_AUTH_USER;
  const pass = process.env.APP_BASIC_AUTH_PASSWORD;
  if (!user || !pass) return NextResponse.next();

  const auth = req.headers.get("authorization");
  if (auth?.startsWith("Basic ")) {
    const decoded = Buffer.from(auth.slice("Basic ".length), "base64").toString();
    const separatorIndex = decoded.indexOf(":");
    const reqUser = decoded.slice(0, separatorIndex);
    const reqPass = decoded.slice(separatorIndex + 1);
    if (reqUser === user && reqPass === pass) {
      return NextResponse.next();
    }
  }

  return new NextResponse("Authentication required", {
    status: 401,
    headers: { "WWW-Authenticate": `Basic realm="${REALM}"` },
  });
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"],
};
