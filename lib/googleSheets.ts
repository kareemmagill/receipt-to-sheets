import { google } from "googleapis";

const SHEET_ID = process.env.GOOGLE_SHEET_ID;

function getAuth() {
  const email = process.env.GOOGLE_SERVICE_ACCOUNT_EMAIL;
  const privateKey = process.env.GOOGLE_PRIVATE_KEY?.replace(/\\n/g, "\n");

  if (!email || !privateKey) {
    throw new Error(
      "Missing GOOGLE_SERVICE_ACCOUNT_EMAIL or GOOGLE_PRIVATE_KEY env vars"
    );
  }

  return new google.auth.JWT({
    email,
    key: privateKey,
    scopes: ["https://www.googleapis.com/auth/spreadsheets"],
  });
}

function getSheetsClient() {
  return google.sheets({ version: "v4", auth: getAuth() });
}

function quoteTabName(tabName: string) {
  return `'${tabName.replace(/'/g, "''")}'`;
}

// Tab titles in the actual spreadsheet can have inconsistent casing or stray
// leading/trailing spaces (e.g. "SALES ORDERS " with a trailing space). Resolve
// a logical name like "Sales Orders" to whatever the real title is, so the rest
// of the app can use clean names without breaking if the sheet is edited.
let tabTitleCache: string[] | null = null;

async function resolveTabTitle(tabName: string) {
  if (!SHEET_ID) throw new Error("Missing GOOGLE_SHEET_ID env var");

  if (!tabTitleCache) {
    const sheets = getSheetsClient();
    const res = await sheets.spreadsheets.get({ spreadsheetId: SHEET_ID });
    tabTitleCache = (res.data.sheets ?? [])
      .map((s) => s.properties?.title)
      .filter((t): t is string => Boolean(t));
  }

  const match = tabTitleCache.find(
    (t) => t.trim().toLowerCase() === tabName.trim().toLowerCase()
  );

  if (!match) {
    throw new Error(
      `No tab found matching "${tabName}". Available tabs: ${tabTitleCache.join(", ")}`
    );
  }

  return match;
}

export async function readTab(tabName: string) {
  if (!SHEET_ID) throw new Error("Missing GOOGLE_SHEET_ID env var");

  const realTitle = await resolveTabTitle(tabName);
  const sheets = getSheetsClient();
  const res = await sheets.spreadsheets.values.get({
    spreadsheetId: SHEET_ID,
    range: quoteTabName(realTitle),
  });

  return res.data.values ?? [];
}

export async function appendRows(tabName: string, rows: (string | number)[][]) {
  if (!SHEET_ID) throw new Error("Missing GOOGLE_SHEET_ID env var");

  const realTitle = await resolveTabTitle(tabName);
  const sheets = getSheetsClient();
  await sheets.spreadsheets.values.append({
    spreadsheetId: SHEET_ID,
    range: quoteTabName(realTitle),
    valueInputOption: "USER_ENTERED",
    insertDataOption: "INSERT_ROWS",
    requestBody: { values: rows },
  });
}
