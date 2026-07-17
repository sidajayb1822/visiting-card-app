/**
 * Card Scanner -> Google Sheet
 *
 * Paste this into the Apps Script editor of the target spreadsheet
 * (Extensions -> Apps Script). Setup instructions are in the project README.
 *
 * Deployed as a Web App with "Execute as: Me" and "Who has access: Anyone".
 * "Anyone" is unavoidable for an unauthenticated POST, so every write must
 * carry SHARED_SECRET, set under Project Settings -> Script Properties.
 */

const SHEET_NAME = "Cards";

const HEADERS = [
  "Timestamp",
  "Name",
  "Title",
  "Company",
  "Email",
  "Phone",
  "Mobile",
  "Website",
  "Address",
];

/** Field order must match HEADERS (after Timestamp) and lib/schema.ts. */
const FIELDS = [
  "full_name",
  "job_title",
  "company",
  "email",
  "phone",
  "mobile",
  "website",
  "address",
];

function jsonResponse(payload) {
  return ContentService.createTextOutput(
    JSON.stringify(payload)
  ).setMimeType(ContentService.MimeType.JSON);
}

/** Returns the target sheet, creating it with a frozen header row if needed. */
function getSheet() {
  const spreadsheet = SpreadsheetApp.getActiveSpreadsheet();
  let sheet = spreadsheet.getSheetByName(SHEET_NAME);

  if (!sheet) {
    sheet = spreadsheet.insertSheet(SHEET_NAME);
  }

  if (sheet.getLastRow() === 0) {
    sheet.appendRow(HEADERS);
    sheet.getRange(1, 1, 1, HEADERS.length).setFontWeight("bold");
    sheet.setFrozenRows(1);
  }

  return sheet;
}

/** Health check: visit the deployment URL in a browser to confirm it is live. */
function doGet() {
  return jsonResponse({ ok: true, message: "Card scanner endpoint is live." });
}

function doPost(e) {
  try {
    if (!e || !e.postData || !e.postData.contents) {
      return jsonResponse({ ok: false, error: "Empty request body." });
    }

    const body = JSON.parse(e.postData.contents);

    const secret =
      PropertiesService.getScriptProperties().getProperty("SHARED_SECRET");
    if (!secret) {
      return jsonResponse({
        ok: false,
        error: "SHARED_SECRET script property is not set.",
      });
    }
    if (body.secret !== secret) {
      return jsonResponse({ ok: false, error: "Unauthorized." });
    }

    // Two phones saving at once would otherwise race for the same row.
    const lock = LockService.getScriptLock();
    lock.waitLock(20000);
    try {
      const row = [new Date()];
      for (const field of FIELDS) {
        // Leading apostrophe stops Sheets auto-formatting "+91..." as a formula
        // or mangling a number into scientific notation.
        const value = body[field] == null ? "" : String(body[field]);
        row.push(value.charAt(0) === "+" ? "'" + value : value);
      }
      getSheet().appendRow(row);
    } finally {
      lock.releaseLock();
    }

    return jsonResponse({ ok: true });
  } catch (err) {
    return jsonResponse({ ok: false, error: String(err) });
  }
}
