import { readFileSync } from 'node:fs';
import { createLoginVerifier } from '../../src/verify-login.mjs';
import { requireResourceId, RESOURCE_IDS } from '../../src/resource-id.mjs';

const config = JSON.parse(
  readFileSync(new URL('../../aleph.config.json', import.meta.url), 'utf8'),
);

let verifyLogin;
function getVerifier() {
  verifyLogin ??= createLoginVerifier({
    config,
    supabaseSecretKey: process.env.SUPABASE_SECRET_KEY,
  });
  return verifyLogin;
}

export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');
  if (!requireResourceId(request, response, RESOURCE_IDS.instructorAnnouncements)) return;

  if (request.method !== 'GET') {
    response.setHeader('Allow', 'GET');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const supabaseUrl = process.env.SUPABASE_URL;
  const secretKey = process.env.SUPABASE_SECRET_KEY;

  if (!supabaseUrl || !secretKey) {
    return response.status(500).json({ error: 'SERVER_CONFIGURATION_ERROR' });
  }

  let endpoint;
  try {
    const base = new URL(supabaseUrl);
    if (base.protocol !== 'https:') throw new Error();
    endpoint = new URL('/rest/v1/training_notes', base);
    endpoint.searchParams.set('select', 'id,owner_id,title,content');
    endpoint.searchParams.set('owner_id', 'is.null');
    endpoint.searchParams.set('order', 'id.asc');
  } catch {
    return response.status(500).json({ error: 'SERVER_CONFIGURATION_ERROR' });
  }

  let verify;
  try {
    verify = getVerifier();
  } catch {
    return response.status(500).json({ error: 'SERVER_CONFIGURATION_ERROR' });
  }

  const identity = await verify(request.headers.authorization);
  if (!identity) {
    return response.status(401).json({ error: 'LOGIN_REQUIRED' });
  }

  try {
    const upstream = await fetch(endpoint, {
      headers: {
        apikey: secretKey,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (!upstream.ok) {
      return response.status(502).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
    }

    const rows = await upstream.json();
    if (!Array.isArray(rows) ||
        rows.some(row => !row || row.owner_id !== null ||
                         typeof row.title !== 'string' ||
                         typeof row.content !== 'string')) {
      return response.status(502).json({ error: 'INVALID_NOTES_RESPONSE' });
    }

    return response.status(200).json({
      notes: rows.map(({ title, content }) => ({ title, content })),
    });
  } catch {
    return response.status(502).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
  }
}