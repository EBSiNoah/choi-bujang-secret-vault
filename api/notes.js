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
  let userEndpoint;
  try {
    const base = new URL(supabaseUrl);
    if (base.protocol !== 'https:') throw new Error();
    endpoint = new URL('/rest/v1/training_notes', base);
    endpoint.searchParams.set('select', 'title,content');
    endpoint.searchParams.set('order', 'id.asc');
    userEndpoint = new URL('/auth/v1/user', base);
  } catch {
    return response.status(500).json({ error: 'SERVER_CONFIGURATION_ERROR' });
  }

  // 로그인 확인: 브라우저가 보낸 Bearer 토큰을 Supabase Auth 에 물어 검증합니다.
  // 토큰이 없거나 틀리거나 만료되면 자료를 읽기 전에 여기서 끝냅니다.
  const match = /^Bearer\s+(\S+)$/i.exec(request.headers.authorization || '');
  if (!match) {
    return response.status(401).json({ error: 'LOGIN_REQUIRED' });
  }

  try {
    const authResponse = await fetch(userEndpoint, {
      headers: {
        apikey: secretKey,
        Authorization: `Bearer ${match[1]}`,
        Accept: 'application/json',
      },
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });

    if (authResponse.status === 401 || authResponse.status === 403) {
      return response.status(401).json({ error: 'LOGIN_REQUIRED' });
    }
    if (!authResponse.ok) {
      return response.status(502).json({ error: 'AUTH_SERVICE_UNAVAILABLE' });
    }

    const user = await authResponse.json();
    if (!user || typeof user.id !== 'string') {
      return response.status(401).json({ error: 'LOGIN_REQUIRED' });
    }
  } catch {
    return response.status(502).json({ error: 'AUTH_SERVICE_UNAVAILABLE' });
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
