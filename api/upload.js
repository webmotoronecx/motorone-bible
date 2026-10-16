// POST /api/upload
//  • JSON body  → Vercel Blob "client upload" handshake (browser uploads straight to Blob, no size cap from this function).
//                 The browser sends the admin password as clientPayload; it is checked before a token is issued.
//  • Raw body   → fallback upload through this function (Vercel limits request bodies to 4.5 MB).
//                 Requires header x-admin-key = ADMIN_PASSWORD and ?filename=.
import { put } from '@vercel/blob';
import { handleUpload } from '@vercel/blob/client';

const ALLOWED = [
  'image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/svg+xml',
  'application/pdf', 'video/mp4', 'video/webm',
  'font/woff2', 'font/woff', 'font/ttf', 'font/otf',
];
const MAX_BYTES = 200 * 1024 * 1024;

const json = (data, status = 200) =>
  new Response(JSON.stringify(data), { status, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });

const secret = () => process.env.ADMIN_PASSWORD || '';
const hasBlob = () => !!process.env.BLOB_READ_WRITE_TOKEN;

export async function POST(request) {
  if (!hasBlob()) return json({ error: 'blob_not_configured' }, 503);
  const ct = request.headers.get('content-type') || '';

  if (ct.includes('application/json')) {
    let body;
    try { body = await request.json(); } catch { return json({ error: 'bad_json' }, 400); }
    try {
      const result = await handleUpload({
        body,
        request,
        onBeforeGenerateToken: async (pathname, clientPayload) => {
          if (!secret() || clientPayload !== secret()) throw new Error('Unauthorized: wrong admin password');
          if (!pathname.startsWith('motorone-bible/uploads/')) throw new Error('Unexpected upload path');
          return { allowedContentTypes: ALLOWED, maximumSizeInBytes: MAX_BYTES, addRandomSuffix: true, tokenPayload: '' };
        },
        onUploadCompleted: async () => {},
      });
      return json(result);
    } catch (e) {
      return json({ error: e && e.message ? e.message : 'upload_failed' }, /unauthori/i.test(String(e && e.message)) ? 401 : 400);
    }
  }

  if (!secret() || request.headers.get('x-admin-key') !== secret()) return json({ error: 'unauthorized' }, 401);
  const name = (new URL(request.url).searchParams.get('filename') || 'file').replace(/[^\w.\-]+/g, '_');
  const type = ct.split(';')[0].trim();
  if (!ALLOWED.includes(type)) return json({ error: 'unsupported_type', type }, 415);
  const bytes = await request.arrayBuffer();
  if (!bytes.byteLength) return json({ error: 'empty' }, 400);
  const blob = await put('motorone-bible/uploads/' + name, bytes, { access: 'public', contentType: type, addRandomSuffix: true });
  return json({ url: blob.url, pathname: blob.pathname, contentType: type, size: bytes.byteLength });
}
