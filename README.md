# MotorOne Proofing Bible — Vercel deploy

The client library for MotorOne CX: contact details, brand kits (fonts, hex colours, brand files), SharePoint links, past-campaign tiles and proofing rules, with a password-protected Settings back end.

No build step. Static page + three serverless functions. Files and the saved client list live in **Vercel Blob**.

## Deploy in 5 minutes

1. **Import the project.** Push this folder to a Git repo and import it at vercel.com/new (Framework preset: *Other*), or run `npx vercel` inside the folder.
2. **Add a Blob store.** Project → **Storage** → **Create Database** → **Blob** → connect it to the project. This adds `BLOB_READ_WRITE_TOKEN` automatically.
3. **Set the admin password.** Project → **Settings** → **Environment Variables** → add `ADMIN_PASSWORD` (any strong string). This is what unlocks Settings in the browser.
4. **Redeploy** (Deployments → ⋯ → Redeploy) so the new variables apply.
5. Open the site, click **Unlock editing** (bottom-right), enter the password, and use **Settings** to upload logos, fonts, brand files and campaign tiles.

Until steps 2–4 are done the site still works in read-only mode from the bundled `data/clients.json` (the nine Tier 1 clients). The first save in Settings copies that list into Blob storage, and from then on the Blob copy is the live one.

## What's where

| Path | Purpose |
|---|---|
| `index.html` | The whole portal (dark UI, Inter, campaigns grid, client pages, Settings). |
| `runtime.js` | Browser runtime: talks to the API routes, handles unlock/lock, downloads. |
| `data/clients.json` | Seed data — used only until the first save. |
| `assets/` | Seeded logos and dealership photos referenced by the seed data. |
| `api/clients.js` | `GET` the client list / `PUT` the full list (needs `x-admin-key`). Stored at `motorone-bible/clients.json` in Blob. |
| `api/upload.js` | File uploads to Blob — direct browser uploads (any size up to 200 MB) with a fallback through the function (4.5 MB cap). |
| `api/auth.js` | Checks the password; reports whether storage is connected. |

## Notes

- **Access:** anyone with the URL can view. Only people who enter `ADMIN_PASSWORD` can edit. To restrict viewing too, enable **Vercel Authentication** (Project → Settings → Deployment Protection) or put it behind your SSO.
- **Propagation:** Blob serves `clients.json` through a CDN with a 60-second cache, so another person may need up to a minute to see a save. The editor who saved sees it immediately.
- **File types:** PNG, JPG, GIF, WebP, SVG, PDF, MP4, WebM, WOFF2, WOFF, TTF, OTF.
- **Backups:** the live list is the `motorone-bible/clients.json` blob in your store — download it from the Vercel Storage tab any time, or replace `data/clients.json` with it to re-seed a fresh deployment.
- **Local preview:** `npx vercel dev` (needs the env vars pulled with `npx vercel env pull`). Opening `index.html` directly from disk also works in read-only mode.
