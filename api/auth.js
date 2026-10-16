// GET /api/auth → { ok, configured, storage }
// ok: the x-admin-key header matches ADMIN_PASSWORD · configured: ADMIN_PASSWORD is set · storage: a Blob store is connected
export async function GET(request) {
  const secret = process.env.ADMIN_PASSWORD || '';
  const body = {
    configured: !!secret,
    ok: !!secret && request.headers.get('x-admin-key') === secret,
    storage: !!process.env.BLOB_READ_WRITE_TOKEN,
  };
  return new Response(JSON.stringify(body), { status: 200, headers: { 'content-type': 'application/json', 'cache-control': 'no-store' } });
}
