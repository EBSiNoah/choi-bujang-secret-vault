// 9단계 연습 사건은 at, method, identity.sub만 사용합니다.
const WINDOW_MS = 10 * 60 * 1000;
const BURST_LIMIT = 120;

export function detect(events) {
  if (!Array.isArray(events)) throw new TypeError('invalid_detection_events');

  const readsBySubject = new Map();
  for (const event of events) {
    if (!event || typeof event !== 'object' || Array.isArray(event)) {
      throw new TypeError('invalid_detection_event');
    }

    const { at, method, identity } = event;
    if (typeof at !== 'string' || !Number.isFinite(Date.parse(at))
      || typeof method !== 'string' || method.length === 0
      || !identity || typeof identity !== 'object' || Array.isArray(identity)
      || typeof identity.sub !== 'string' || identity.sub.length === 0) {
      throw new TypeError('invalid_detection_event');
    }

    if (method !== 'GET') continue;
    const times = readsBySubject.get(identity.sub) ?? [];
    times.push(Date.parse(at));
    readsBySubject.set(identity.sub, times);
  }

  for (const [subject, times] of readsBySubject) {
    times.sort((a, b) => a - b);
    let firstInWindow = 0;
    for (let lastInWindow = 0; lastInWindow < times.length; lastInWindow += 1) {
      while (times[lastInWindow] - times[firstInWindow] >= WINDOW_MS) {
        firstInWindow += 1;
      }
      if (lastInWindow - firstInWindow + 1 > BURST_LIMIT) {
        return { action: 'propose_revocation', reasonCode: 'burst_read', subject };
      }
    }
  }

  return { action: 'observe' };
}
