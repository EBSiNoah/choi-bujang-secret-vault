import { randomUUID } from 'node:crypto';
import { readFileSync } from 'node:fs';
import { createLoginVerifier } from './verify-login.mjs';

const config = JSON.parse(
  readFileSync(new URL('../aleph.config.json', import.meta.url), 'utf8'),
);
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/iu;

let verifyLogin;

export const isUuid = (value) => typeof value === 'string' && UUID.test(value);
export const newId = () => randomUUID();

// 제목·내용만 꺼냅니다. owner_id, userId, role 같은 값은 body 에 있어도 무시합니다.
export function parseMemo(body) {
  if (!body || typeof body !== 'object') return null;
  const title = typeof body.title === 'string' ? body.title.trim() : '';
  const text = body.body;
  if (!title || title.length > 200) return null;
  if (typeof text !== 'string' || text.length > 5000) return null;
  return { title, body: text };
}

// 메서드·설정·로그인을 확인합니다. 통과하면 { userId, rest } 를 돌려주고,
// 거부할 때는 응답을 이미 보낸 뒤 null 을 돌려줍니다.
export async function memosContext(request, response, methods) {
  response.setHeader('Cache-Control', 'no-store');

  if (!methods.includes(request.method)) {
    response.setHeader('Allow', methods.join(', '));
    response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
    return null;
  }

  const secretKey = process.env.SUPABASE_SECRET_KEY;
  let base;
  let verify;
  try {
    base = new URL(process.env.SUPABASE_URL);
    if (base.protocol !== 'https:' || !secretKey) throw new Error();
    verifyLogin ??= createLoginVerifier({ config, supabaseSecretKey: secretKey });
    verify = verifyLogin;
  } catch {
    response.status(500).json({ error: 'SERVER_CONFIGURATION_ERROR' });
    return null;
  }

  // 사용자 ID 는 검사를 통과한 토큰에서만 얻습니다. 브라우저가 보낸 값은 믿지 않습니다.
  const identity = await verify(request.headers.authorization);
  if (!identity) {
    response.status(401).json({ error: 'LOGIN_REQUIRED' });
    return null;
  }

  const rest = (path, init = {}) => fetch(new URL(`/rest/v1/${path}`, base), {
    ...init,
    headers: { apikey: secretKey, Accept: 'application/json', ...init.headers },
    cache: 'no-store',
    signal: AbortSignal.timeout(8000),
  });
  return { userId: identity.userId, rest };
}
