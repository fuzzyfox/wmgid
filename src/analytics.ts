export type TrackRequest = {
  header(name: string): string | undefined;
};

export type Tracker = {
  track(eventName: string, request: TrackRequest, path: string): Promise<void>;
};

export type AnalyticsConfig = {
  domain: string | undefined;
  host: string;
  baseUrl: string;
  fetch?: typeof fetch;
};

function deriveClientIp(request: TrackRequest): string {
  const cf = request.header('cf-connecting-ip');
  if (cf) return cf.trim();

  const xff = request.header('x-forwarded-for');
  if (xff) {
    const leftmost = xff.split(',')[0]?.trim();
    if (leftmost) return leftmost;
  }

  const realIp = request.header('x-real-ip');
  if (realIp) return realIp.trim();

  return '0.0.0.0';
}

export function createAnalytics({
  domain,
  host,
  baseUrl,
  fetch: fetchImpl = fetch,
}: AnalyticsConfig): Tracker {
  if (!domain) {
    return { track: async () => {} };
  }

  const endpoint = `https://${host}/api/event`;

  return {
    async track(eventName, request, path) {
      const body = JSON.stringify({
        name: eventName,
        domain,
        url: `${baseUrl}${path}`,
      });

      const headers: Record<string, string> = {
        'Content-Type': 'application/json',
        'X-Forwarded-For': deriveClientIp(request),
      };

      const ua = request.header('user-agent');
      if (ua) headers['User-Agent'] = ua;

      try {
        await fetchImpl(endpoint, { method: 'POST', headers, body });
      } catch (err) {
        console.warn('[wmgid] analytics:', (err as Error).message);
      }
    },
  };
}
