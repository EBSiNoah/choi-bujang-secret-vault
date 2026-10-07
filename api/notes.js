import { readFileSync } from 'node:fs';
import { createLoginVerifier } from '../src/verify-login.mjs';

const config = JSON.parse(
  readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'),
);

// 서버 런타임에서 한 번만 만듭니다. 설정이 잘못되면 요청 때 500 으로 답합니다.
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
    endpoint = new URL('/rest/v1/memos', base);
    endpoint.searchParams.set('select', 'title,content');
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

  // 로그인 확인: Authorization 헤더의 토큰만 검사합니다.
  // 요청의 userId·role 같은 값은 읽지 않습니다. 검사 결과(identity)만 믿습니다.
  // 토큰이 없거나 검사에 실패하면 자료를 읽기 전에 거부합니다.
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
        rows.some(row => typeof row.title !== 'string' ||
                         typeof row.content !== 'string')) {
      return response.status(502).json({ error: 'INVALID_NOTES_RESPONSE' });
    }

    return response.status(200).json({
      notes: rows.map(({ title, content }) => ({ title, content })),
    });
  } catch {
    // 키나 Supabase 오류 내용을 응답·로그에 남기지 않습니다.
    return response.status(502).json({ error: 'NOTES_SERVICE_UNAVAILABLE' });
  }
}
