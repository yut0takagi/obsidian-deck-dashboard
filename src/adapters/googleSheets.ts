import { requestUrl } from "obsidian";
import type { GoogleOAuth } from "../auth/googleOAuth";

const SHEETS_API = "https://sheets.googleapis.com/v4/spreadsheets";

export interface SpreadsheetInfo {
  spreadsheetId: string;
  spreadsheetUrl: string;
  sheets: Array<{ sheetId: number; title: string }>;
}

async function authed(
  oauth: GoogleOAuth,
  url: string,
  init: { method: "GET" | "POST" | "PUT"; body?: unknown } = { method: "GET" }
): Promise<any> {
  const token = await oauth.getAccessToken();
  const res = await requestUrl({
    url,
    method: init.method,
    headers: {
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: init.body ? JSON.stringify(init.body) : undefined,
  });
  if (res.status >= 400) {
    throw new Error(`Sheets API HTTP ${res.status}: ${res.text}`);
  }
  return res.json;
}

export async function createSpreadsheet(
  oauth: GoogleOAuth,
  title: string,
  sheetTitle = "tasks"
): Promise<SpreadsheetInfo> {
  const body = {
    properties: { title },
    sheets: [{ properties: { title: sheetTitle } }],
  };
  const json = await authed(oauth, SHEETS_API, { method: "POST", body });
  return {
    spreadsheetId: json.spreadsheetId,
    spreadsheetUrl: json.spreadsheetUrl,
    sheets: (json.sheets ?? []).map((s: any) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
    })),
  };
}

export async function getSpreadsheet(
  oauth: GoogleOAuth,
  spreadsheetId: string
): Promise<SpreadsheetInfo> {
  const json = await authed(oauth, `${SHEETS_API}/${spreadsheetId}`);
  return {
    spreadsheetId: json.spreadsheetId,
    spreadsheetUrl: json.spreadsheetUrl,
    sheets: (json.sheets ?? []).map((s: any) => ({
      sheetId: s.properties.sheetId,
      title: s.properties.title,
    })),
  };
}

export async function readRange(
  oauth: GoogleOAuth,
  spreadsheetId: string,
  range: string
): Promise<string[][]> {
  const json = await authed(
    oauth,
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueRenderOption=UNFORMATTED_VALUE`
  );
  return (json.values ?? []) as string[][];
}

export async function writeRange(
  oauth: GoogleOAuth,
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][]
): Promise<void> {
  await authed(
    oauth,
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}?valueInputOption=RAW`,
    { method: "PUT", body: { values } }
  );
}

/**
 * Batch multiple range writes into a single API call. Critical for staying
 * within Sheets per-minute quota when syncing many rows at once.
 */
export async function valuesBatchUpdate(
  oauth: GoogleOAuth,
  spreadsheetId: string,
  data: { range: string; values: (string | number | null)[][] }[]
): Promise<void> {
  if (data.length === 0) return;
  await authed(
    oauth,
    `${SHEETS_API}/${spreadsheetId}/values:batchUpdate`,
    {
      method: "POST",
      body: { valueInputOption: "RAW", data },
    }
  );
}

export async function appendRows(
  oauth: GoogleOAuth,
  spreadsheetId: string,
  range: string,
  values: (string | number | null)[][]
): Promise<{ updatedRange: string; updatedRows: number }> {
  const json = await authed(
    oauth,
    `${SHEETS_API}/${spreadsheetId}/values/${encodeURIComponent(range)}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    { method: "POST", body: { values } }
  );
  return {
    updatedRange: json.updates?.updatedRange ?? "",
    updatedRows: json.updates?.updatedRows ?? 0,
  };
}

export interface BatchUpdateRequest {
  requests: unknown[];
}

export async function batchUpdate(
  oauth: GoogleOAuth,
  spreadsheetId: string,
  body: BatchUpdateRequest
): Promise<any> {
  return await authed(oauth, `${SHEETS_API}/${spreadsheetId}:batchUpdate`, {
    method: "POST",
    body,
  });
}

/**
 * Convert 0-indexed column number to A1 letter ("A", "B", ..., "AA").
 */
export function columnLetter(index: number): string {
  let n = index;
  let s = "";
  do {
    s = String.fromCharCode(65 + (n % 26)) + s;
    n = Math.floor(n / 26) - 1;
  } while (n >= 0);
  return s;
}
