import { NextResponse } from "next/server";
import { getOAuthClient } from "@/lib/googleOAuth";

export async function GET(req: Request) {
  const code = new URL(req.url).searchParams.get("code");
  if (!code) {
    return new NextResponse("Missing ?code param -- did you navigate here directly? Start at /api/auth/google/start instead.", {
      status: 400,
    });
  }

  try {
    const client = getOAuthClient();
    const { tokens } = await client.getToken(code);

    if (!tokens.refresh_token) {
      return new NextResponse(
        "Google didn't return a refresh token -- this usually means this app already has your consent on file. " +
          "Revoke it at https://myaccount.google.com/permissions (find this app, remove access) and try /api/auth/google/start again.",
        { status: 400 }
      );
    }

    return new NextResponse(
      `Success! Add this to .env.local (and your Vercel env vars once deployed), then restart the dev server:\n\n` +
        `GOOGLE_OAUTH_REFRESH_TOKEN=${tokens.refresh_token}\n`,
      { headers: { "Content-Type": "text/plain" } }
    );
  } catch (err) {
    return new NextResponse(`Token exchange failed: ${err instanceof Error ? err.message : String(err)}`, {
      status: 500,
    });
  }
}
