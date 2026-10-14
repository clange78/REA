// Opaque keyset cursor. It records the request it belongs to so a cursor
// can't be replayed against a different query and silently skip results.

export function encodeCursor(request, last) {
  const payload = { v: 1, request, last };
  return Buffer.from(JSON.stringify(payload)).toString('base64url');
}

export function decodeCursor(cursor, request) {
  let payload;
  try {
    payload = JSON.parse(Buffer.from(cursor, 'base64url').toString('utf8'));
  } catch {
    throw new Error('Invalid cursor');
  }
  if (payload?.v !== 1 || !payload.last) throw new Error('Invalid cursor');
  if (JSON.stringify(payload.request) !== JSON.stringify(request)) {
    throw new Error('Cursor does not match this search; start again without a cursor');
  }
  return payload.last;
}
