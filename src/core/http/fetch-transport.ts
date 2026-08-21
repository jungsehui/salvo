import type { HttpResponse, ResolvedRequest, Transport } from '../types';

export function createFetchTransport(): Transport {
  return async (req: ResolvedRequest): Promise<HttpResponse> => {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), req.timeoutMs);
    const started = performance.now();
    try {
      const res = await fetch(req.url, {
        method: req.method,
        headers: { 'content-type': 'application/json', ...req.headers },
        body: JSON.stringify(req.body),
        signal: controller.signal,
      });
      const bodyText = await res.text();
      const durationMs = Math.round(performance.now() - started);
      const headers: Record<string, string> = {};
      res.headers.forEach((v, k) => { headers[k.toLowerCase()] = v; });
      let json: unknown;
      try { json = JSON.parse(bodyText); } catch { json = undefined; }
      return { status: res.status, headers, bodyText, json, durationMs };
    } catch (e) {
      if (controller.signal.aborted) throw new Error(`Request timed out after ${req.timeoutMs}ms.`);
      throw e;
    } finally {
      clearTimeout(timer);
    }
  };
}
