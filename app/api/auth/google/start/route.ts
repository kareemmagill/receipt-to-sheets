import { NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/googleOAuth";

// Visit this once to authorize Drive photo archiving as your own Google
// account (see lib/googleOAuth.ts for why). Not linked from any page --
// a one-time setup step, not a user-facing feature.
export async function GET() {
  const client = getOAuthClient();
  const url = client.generateAuthUrl({
    access_type: "offline",
    // Forces Google to hand back a refresh_token even if you've already
    // consented before -- without this, a repeat consent silently omits
    // it (Google only issues one on first consent by default).
    prompt: "consent",
    scope: ["https://www.googleapis.com/auth/drive.file"],
  });
  return NextResponse.redirect(url);
}
