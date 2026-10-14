const OWNER = /^[A-Za-z0-9](?:[A-Za-z0-9-]{0,37}[A-Za-z0-9])?$/u;
const REPO = /^[A-Za-z0-9._-]{1,100}$/u;
const SHA = /^[a-f0-9]{40}$/iu;
const HOST = /^[a-z0-9](?:[a-z0-9-]*[a-z0-9])?\.vercel\.app$/iu;

// 5단계: 원본 자료 주소. 설정에 없으면(null) 기록하지 않고, 적혀 있으면 형식을 검사합니다.
// 쿼리·#·계정 정보가 없는 https 주소만 허용합니다. 비밀값은 넣지 않습니다.
function checkedOriginalApiUrl(value) {
  if (value === null || value === undefined) return null;
  let url = null;
  if (typeof value === 'string') {
    try { url = new URL(value); } catch { url = null; }
  }
  if (!url || url.protocol !== 'https:' || url.username || url.password
      || url.search || url.hash || value.includes('?') || value.includes('#')
      || url.href !== value) {
    throw new Error('originalApiUrl 은 쿼리·#·계정 정보가 없는 https 주소여야 합니다. (앞뒤 공백도 넣지 마세요)');
  }
  return value;
}

// 5단계: 서버가 받는 요청 경로. 설정에 있으면 형식을 검사해 그대로 기록합니다.
// 항목은 "/api/notes" 또는 { method, path } 형태이고, 경로에는 쿼리·#·주소 전체를 쓰지 않습니다.
const ROUTE_PATH = /^\/[A-Za-z0-9._~/:-]*$/u;
const ROUTE_METHODS = new Set(['GET', 'POST', 'PUT', 'DELETE']);
function validRoute(route) {
  if (typeof route === 'string') return ROUTE_PATH.test(route);
  return route !== null && typeof route === 'object'
    && ROUTE_METHODS.has(route.method) && typeof route.path === 'string'
    && ROUTE_PATH.test(route.path);
}
function checkedAllowedRoutes(value) {
  if (value === null || value === undefined) return null;
  if (!Array.isArray(value) || value.length > 50 || !value.every(validRoute)) {
    throw new Error('allowedRoutes 는 "/경로" 또는 { method, path } 항목의 배열이어야 합니다.');
  }
  return value;
}

export function deploymentIdentity(env, config) {
  const owner = env.VERCEL_GIT_REPO_OWNER;
  const repo = env.VERCEL_GIT_REPO_SLUG;
  const commit = env.VERCEL_GIT_COMMIT_SHA;
  const host = env.VERCEL_URL;
  if (env.VERCEL_GIT_PROVIDER !== 'github' || !OWNER.test(owner || '')
      || !REPO.test(repo || '') || repo === '.' || repo === '..'
      || repo.toLowerCase().endsWith('.git') || !SHA.test(commit || '')
      || !HOST.test(host || '') || config?.step !== 1
      || typeof config.judgeIssuer !== 'string'
      || !/^https:\/\/[a-z0-9-]+\.up\.railway\.app\/defense\/judge$/iu.test(config.judgeIssuer)
      || typeof config.sampleMarker !== 'string'
      || !/^[A-Z0-9_]{1,80}$/u.test(config.sampleMarker)) {
    throw new Error('배포 식별 정보를 확인할 수 없습니다. Vercel 시스템 환경변수와 1단계 시작 틀을 확인하세요.');
  }
  const originalApiUrl = checkedOriginalApiUrl(config.originalApiUrl);
  const allowedRoutes = checkedAllowedRoutes(config.allowedRoutes);
  return {
    schema: 'aleph.defense.deployment.v1',
    step: 1,
    repoUrl: `https://github.com/${owner.toLowerCase()}/${repo.toLowerCase()}`,
    commit: commit.toLowerCase(),
    publicAppUrl: `https://${host.toLowerCase()}`,
    judgeIssuer: config.judgeIssuer,
    ...(originalApiUrl ? { originalApiUrl } : {}),
    ...(allowedRoutes ? { allowedRoutes } : {}),
  };
}
