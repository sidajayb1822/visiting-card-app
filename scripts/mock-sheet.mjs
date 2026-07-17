/**
 * A stand-in for the Apps Script web app, for local development before (or
 * without) a real Sheet deployment. Run it with `npm run mock:sheet` and point
 * APPS_SCRIPT_URL at http://127.0.0.1:4555/exec.
 *
 * It imitates the two Apps Script behaviours that actually affect our code:
 *   1. POST /exec runs the handler and CONSUMES the body, then 302s to another
 *      host, which serves the result over GET. (A client following the redirect
 *      turns it into a GET and drops the body — fine, the work already happened.)
 *   2. Rejections come back 200 with {ok:false}, never an error status.
 *
 * Rows are printed to the console and kept in memory only.
 */
import { createServer } from "node:http";

const SECRET = process.env.APPS_SCRIPT_SECRET ?? "dev-secret";
const EXEC_PORT = 4555;
const RESULT_PORT = 4556;

const results = new Map();
const rows = [];
let seq = 0;

// Stands in for googleusercontent.com: serves the stored result over GET.
createServer((req, res) => {
  const id = new URL(req.url, "http://x").searchParams.get("id");
  res.setHeader("Content-Type", "application/json");
  res.end(results.get(id) ?? JSON.stringify({ ok: false, error: "expired" }));
}).listen(RESULT_PORT);

// Stands in for /exec: runs the "doPost", stores the result, redirects to it.
createServer((req, res) => {
  let body = "";
  req.on("data", (chunk) => (body += chunk));
  req.on("end", () => {
    const id = String(++seq);
    let result;

    try {
      const payload = JSON.parse(body);
      if (payload.secret !== SECRET) {
        console.log("REJECTED: bad secret");
        result = { ok: false, error: "Unauthorized." };
      } else {
        rows.push(payload);
        console.log(
          `ROW ${rows.length}:`,
          [payload.full_name, payload.company, payload.email, payload.phone]
            .filter(Boolean)
            .join(" | "),
        );
        result = { ok: true };
      }
    } catch {
      console.log("REJECTED: unparseable body");
      result = { ok: false, error: "Bad JSON" };
    }

    results.set(id, JSON.stringify(result));
    res.writeHead(302, { Location: `http://127.0.0.1:${RESULT_PORT}/result?id=${id}` });
    res.end();
  });
}).listen(EXEC_PORT, () => {
  console.log(`Mock sheet listening on http://127.0.0.1:${EXEC_PORT}/exec`);
  console.log(`Expecting secret: ${SECRET}`);
  console.log("Saved cards print here. Nothing is written to a real Sheet.\n");
});
