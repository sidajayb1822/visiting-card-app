# Card Scanner

Point your phone at a business card; the details land in a Google Sheet.

It's a PWA, so it installs straight from its URL — no App Store, no Play Store, no Apple
Developer account. Works the same on iPhone and Android.

**Photo → Gemini reads it → you check it → row appended to your Sheet.**

---

## Setup

Four things, in this order. Budget about 15 minutes.

### 1. Get a Gemini API key

Create one at [aistudio.google.com/apikey](https://aistudio.google.com/apikey).

> **If this project reached you with a key already pasted somewhere — revoke it and make a
> new one.** A key that has been in a chat window, a commit, or a screenshot is public, and
> it bills to you until you kill it. The new key only ever gets pasted into Vercel's
> environment variables.

### 2. Set up the Google Sheet

1. Create a Sheet. The name doesn't matter; the script creates a `Cards` tab with headers
   by itself.
2. **Extensions → Apps Script**.
3. Delete the placeholder code and paste in all of [`apps-script/Code.gs`](apps-script/Code.gs).
4. **Project Settings** (gear icon) **→ Script Properties → Add script property**:
   - Property: `SHARED_SECRET`
   - Value: a long random string (`openssl rand -hex 24`). **Keep it** — it goes into Vercel
     in step 3 as `APPS_SCRIPT_SECRET`, and the two must match exactly.
5. **Deploy → New deployment → Web app**:
   - Execute as: **Me**
   - Who has access: **Anyone**
   - Deploy, then approve the permissions prompt.
6. Copy the **Web app URL** (it ends in `/exec`).

Paste that URL into a browser. You should see:
`{"ok":true,"message":"Card scanner endpoint is live."}`

> **Why "Anyone"?** Apps Script can't authenticate a POST from a server without a full OAuth
> dance. "Anyone" means anyone who knows the URL can reach the endpoint — which is exactly
> what `SHARED_SECRET` is for. Requests without it are rejected.

> **Every time you edit the script, deploy again**: **Deploy → Manage deployments → edit
> (pencil) → Version: New version**. Saving alone changes nothing that's live. This is the
> most common way to lose an hour here.

### 3. Deploy to Vercel

```bash
npx vercel          # preview deploy, links the project
npx vercel --prod   # production
```

Set the environment variables in **Vercel → your project → Settings → Environment
Variables**:

| Variable | Value |
|---|---|
| `GEMINI_API_KEY` | Your key from step 1 |
| `APPS_SCRIPT_URL` | The `/exec` URL from step 2 |
| `APPS_SCRIPT_SECRET` | The same string you set as `SHARED_SECRET` |
| `APP_PASSCODE` | Whatever you want to type to unlock the app |
| `SESSION_SECRET` | `openssl rand -hex 32` |

Or via CLI:

```bash
printf 'your-key-here' | npx vercel env add GEMINI_API_KEY production
```

**Redeploy after adding them** (`npx vercel --prod`) — env vars only apply to builds made
after they're set.

None of these carry a `NEXT_PUBLIC_` prefix, and none ever should. That prefix inlines a
value into the JavaScript bundle, which would publish your Gemini key to every visitor.

### 4. Install on your phone

Open the production URL on the phone and enter your passcode.

- **iPhone — must be Safari.** Share → *Add to Home Screen*. (Chrome on iOS can't do this;
  it's an Apple restriction, not a bug here.)
- **Android — Chrome** offers an *Install app* prompt, or ⋮ → *Add to Home screen*.

Launch it from the new icon: no address bar, and the camera behaves properly.

---

## Local development

```bash
cp .env.example .env.local   # then fill it in
npm install
npm run dev
```

The live camera preview needs a secure context. `localhost` counts, so your desktop works —
but a phone hitting `http://192.168.x.x:3000` does not, and will quietly fall back to the
file picker. **To test the real camera path, use a Vercel preview deploy**; it's the fastest
route to an HTTPS URL your phone trusts.

| Command | |
|---|---|
| `npm run dev` | Dev server |
| `npm run build` | Production build |
| `npm run typecheck` | Types only |
| `npm run lint` | ESLint |
| `npm run icons` | Regenerate the PWA icons in `public/` |

---

## How it fits together

```
Phone (PWA)                    Vercel                        Google
───────────                    ──────                        ──────
passcode  ───────────────────► /api/unlock
                               └─ signed httpOnly cookie

camera → canvas
  downscale 1600px, JPEG
  └─ base64 ───────────────► /api/scan ───────────────────► Gemini 3.5 Flash
                               └─ GEMINI_API_KEY               (vision + JSON schema)
                          ◄──── fields ◄────────────────────┘

review / edit
  └─ confirmed ────────────► /api/submit ─────────────────► Apps Script
                               └─ APPS_SCRIPT_SECRET           └─ appendRow → Sheet
```

Both Google calls are proxied through Vercel rather than made from the phone, for two
reasons: secrets stay server-side, and Apps Script answers with a cross-origin redirect that
a browser `fetch` refuses on CORS but a server-side call follows without complaint.

`proxy.ts` gates `/api/scan` and `/api/submit` on the session cookie, so someone who finds
the URL can't spend your Gemini quota or write rows.

### Layout

| Path | |
|---|---|
| `app/page.tsx` | Checks the cookie server-side, renders the scanner |
| `components/Scanner.tsx` | The flow: locked → capture → reading → review → saved |
| `components/CameraCapture.tsx` | Live preview, shutter, native-camera fallback |
| `lib/schema.ts` | Fields, the JSON Schema for Gemini, and the prompt — one source of truth |
| `lib/normalize.ts` | Tidies phone numbers, websites, emails |
| `lib/session.ts` | Signs and verifies the cookie (Web Crypto, so it runs on Edge and Node) |
| `apps-script/Code.gs` | The Sheet side. Not deployed by Vercel — paste it in yourself |

---

## Notes and limits

**Nothing works offline.** A scan needs the network. If you'll be somewhere with dead wifi,
this needs a local queue and retry — worth building deliberately rather than discovering at
the venue.

**The free Gemini tier is rate-limited.** Fine for normal use; a conference day of
back-to-back scanning may need billing enabled on the Google Cloud project.

**Check the fields before saving.** OCR is very good, not perfect. The prompt tells the model
to leave a field blank rather than guess, so blanks are honest — fill them in yourself.

**The passcode is one shared secret**, not per-user accounts. It stops drive-by abuse of a
public URL. If several people need access and you care who did what, that wants real auth.

**Formatting is done in code, not by the model.** `lib/normalize.ts` strips the spaces out of
phone numbers and the `www.` off websites. Asking the model to do it in the prompt was tried
and it didn't comply reliably — deterministic work belongs in deterministic code.

**Changing the fields** means editing two files in step: `lib/schema.ts` (the zod schema,
`CARD_FIELD_ORDER`, `CARD_JSON_SCHEMA`) and `apps-script/Code.gs` (`HEADERS` and `FIELDS`,
which must stay in the same order). Redeploy the Apps Script afterwards.

---

## Troubleshooting

**"Couldn't read that card."** — Gemini rejected the request. Check the function logs
(`npx vercel logs`). Usually an invalid `GEMINI_API_KEY` or exhausted quota.

**"The sheet script rejected the write."** — `APPS_SCRIPT_SECRET` in Vercel doesn't match
`SHARED_SECRET` in Script Properties.

**"The sheet script returned an unexpected response."** — The Apps Script deployment is
serving something other than JSON, usually a Google login page. Redeploy with *Who has
access: **Anyone***.

**Saves succeed but no rows appear.** — You're probably looking at a different spreadsheet
from the one the script is bound to. The script writes to the sheet it lives inside.

**No install prompt on Android.** — Needs production over HTTPS (the service worker is off in
dev). Check DevTools → Application → Manifest.

**Camera is a black rectangle, or falls back unexpectedly.** — Needs HTTPS. On iOS it must be
launched from the Home Screen icon or Safari proper. If permission was denied once, iOS
remembers: Settings → Safari → Camera.
