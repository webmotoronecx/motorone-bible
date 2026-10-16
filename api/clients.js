// GET  /api/clients  → { clients: [...] }  (null when nothing has been saved yet → page falls back to data/clients.json)
// PUT  /api/clients  → saves the full client list. Requires header x-admin-key = ADMIN_PASSWORD.
import { put, list } from '@vercel/blob';

const PATH = 'motorone-bible/clients.json';

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const authed = (request) => !!process.env.ADMIN_PASSWORD && request.headers.get('x-admin-key') === process.env.ADMIN_PASSWORD;
const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export async function GET() {
  if (!hasBlob()) return json({ error: 'blob_not_configured', clients: null }, 503);
  const { blobs } = await list({ prefix: PATH, limit: 5 });
  const b = blobs.find((x) => x.pathname === PATH);
  if (!b) return json({ clients: null });
  const r = await fetch(b.url + '?t=' + Date.now(), { cache: 'no-store' });
  if (!r.ok) return json({ error: 'read_failed', clients: null }, 502);
  return json({ clients: await r.json(), updatedAt: b.uploadedAt });
}

export async function PUT(request) {
  if (!authed(request)) return json({ error: 'unauthorized' }, 401);
  if (!hasBlob()) return json({ error: 'blob_not_configured' }, 503);
  let body;
  try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
  if (!body || !Array.isArray(body.clients)) return json({ error: 'bad_request' }, 400);
  await put(PATH, JSON.stringify(body.clients), {
    access: 'public',
    contentType: 'application/json',
    addRandomSuffix: false,
    allowOverwrite: true,
    cacheControlMaxAge: 60,
  });
  return json({ ok: true, count: body.clients.length });
}
