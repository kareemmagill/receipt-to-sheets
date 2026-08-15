import { google } from "googleapis";

// Used only for Drive photo archiving (lib/googleDrive.ts) -- Sheets access
// stays on the service account (lib/googleSheets.ts), which works fine
// there since editing a spreadsheet the account's been granted access to
// isn't a storage operation. Drive uploads are different: a service
// account has no storage quota of its own on a regular (non-Workspace)
// Drive, so those must happen as a real user via OAuth instead -- see
// app/api/auth/google/start and /callback for the one-time consent flow
// that produces the refresh token this reads.
export function getOAuthClient() {
  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET/GOOGLE_OAUTH_REDIRECT_URI env vars"
    );
  }

  return new google.auth.OAuth2(clientId, clientSecret, redirectUri);
}
