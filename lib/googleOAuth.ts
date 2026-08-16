import { google } from "googleapis";

// Used only for Drive photo archiving (lib/googleDrive.ts) -- Sheets access
// stays on the service account (lib/googleSheets.ts), which works fine
// there since editing a spreadsheet the account's been granted access to
// isn't a storage operation. Drive uploads are different: a service
// account has no storage quota of its own on a regular (non-Workspace)
// Drive, so those must happen as a real user via OAuth instead -- see
// app/api/auth/google/start and /callback for the one-time consent flow
// that produces the refresh token this reads.
// Module-level cache: a fresh OAuth2 client has no access token yet, so the
// first API call made with it always pays a round trip to Google's token
// endpoint to exchange the refresh token -- even though that access token
// is reusable. Building a new client per call (the previous behavior)
// meant paying that exchange twice per save (once for the Drive folder
// lookup, once for the upload) instead of once ever per warm instance.
let cachedClient: InstanceType<typeof google.auth.OAuth2> | null = null;

export function getOAuthClient() {
  if (cachedClient) return cachedClient;

  const clientId = process.env.GOOGLE_OAUTH_CLIENT_ID;
  const clientSecret = process.env.GOOGLE_OAUTH_CLIENT_SECRET;
  const redirectUri = process.env.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !clientSecret || !redirectUri) {
    throw new Error(
      "Missing GOOGLE_OAUTH_CLIENT_ID/GOOGLE_OAUTH_CLIENT_SECRET/GOOGLE_OAUTH_REDIRECT_URI env vars"
    );
  }

  cachedClient = new google.auth.OAuth2(clientId, clientSecret, redirectUri);
  return cachedClient;
}
