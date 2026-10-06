// Checks what a visitor without credentials can read from the public app.
// Never include note bodies, tokens, or private keys in the result.
export async function runAttackChecks(config) {
  if (config.step !== 1 && config.step !== 2) {
    throw new Error('이 단계의 공격 점검을 확인해 주세요.');
  }

  let app;
  try {
    app = new URL(config.publicAppUrl);
  } catch {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }

  if (
    app.protocol !== 'https:' ||
    app.username ||
    app.password ||
    app.search ||
    app.hash ||
    app.pathname !== '/' ||
    app.hostname.endsWith('.example')
  ) {
    throw new Error('aleph.config.json의 실제 배포 주소를 먼저 넣어 주세요.');
  }

  const response = await fetch(new URL('/api/notes', app), {
    redirect: 'error',
    signal: AbortSignal.timeout(10000),
  });

  let noteCount = 0;

  if (response.ok) {
    try {
      const data = await response.json();

      if (
        Array.isArray(data?.notes) &&
        data.notes.every(
          note =>
            note &&
            typeof note.title === 'string' &&
            typeof note.content === 'string'
        )
      ) {
        noteCount = data.notes.length;
      }
    } catch {
      // A non-JSON response is a failed check.
    }
  }

  const readable = response.ok && noteCount > 0;

  return [
    {
      attackId: 'anonymous_note_read',
      expected: '비로그인 요청으로 공개 API가 반환하는 가상 메모를 확인',
      observed: readable
        ? `비로그인 요청에서 API가 메모 ${noteCount}건을 반환함`
        : `비로그인 요청에서 메모를 확인하지 못함 (HTTP ${response.status})`,
    },
  ];
}
