// 로그인 요청을 서버가 대신 처리합니다. 브라우저는 Supabase 에 직접 요청하지 않으므로
// 화면 코드에 공개 키가 필요 없습니다. 키는 서버 환경변수에만 둡니다.
export default async function handler(request, response) {
  response.setHeader('Cache-Control', 'no-store');

  if (request.method !== 'POST') {
    response.setHeader('Allow', 'POST');
    return response.status(405).json({ error: 'METHOD_NOT_ALLOWED' });
  }

  const publishableKey = process.env.SUPABASE_PUBLISHABLE_KEY;
  let endpoint;
  try {
    const base = new URL(process.env.SUPABASE_URL);
    if (base.protocol !== 'https:' || !publishableKey) throw new Error();
    endpoint = new URL('/auth/v1/token', base);
    endpoint.searchParams.set('grant_type', 'password');
  } catch {
    return response.status(500).json({ error: 'SERVER_CONFIGURATION_ERROR' });
  }

  const { email, password } = request.body && typeof request.body === 'object' ? request.body : {};
  if (typeof email !== 'string' || typeof password !== 'string'
      || !email || email.length > 254 || !password || password.length > 200) {
    return response.status(400).json({ error: 'INVALID_LOGIN' });
  }

  try {
    const upstream = await fetch(endpoint, {
      method: 'POST',
      headers: { apikey: publishableKey, 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({ email, password }),
      cache: 'no-store',
      signal: AbortSignal.timeout(8000),
    });
    const result = await upstream.json().catch(() => ({}));

    if (upstream.status === 429) return response.status(429).json({ error: 'TOO_MANY_REQUESTS' });
    if (upstream.status === 400 || upstream.status === 401) {
      return result.error_code === 'email_not_confirmed'
        ? response.status(403).json({ error: 'EMAIL_NOT_CONFIRMED' })
        : response.status(401).json({ error: 'INVALID_CREDENTIALS' });
    }
    if (!upstream.ok || typeof result.access_token !== 'string') {
      return response.status(502).json({ error: 'AUTH_SERVICE_UNAVAILABLE' });
    }
    // 화면에는 접근 토큰과 표시용 이메일만 돌려줍니다. (키·갱신 토큰은 보내지 않습니다)
    return response.status(200).json({
      access_token: result.access_token,
      expires_in: result.expires_in,
      email: typeof result.user?.email === 'string' ? result.user.email : email,
    });
  } catch {
    // 비밀번호와 응답 내용을 로그에 남기지 않습니다.
    return response.status(502).json({ error: 'AUTH_SERVICE_UNAVAILABLE' });
  }
}
