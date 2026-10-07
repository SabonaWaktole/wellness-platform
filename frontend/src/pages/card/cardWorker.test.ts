import { describe, it, expect, beforeEach } from 'vitest';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import { join, resolve, relative, sep } from 'node:path';

/**
 * M4 Slice 12 (FR-CRD-06, FR-CRD-10, D14): the card's service worker run against a fake cache and a fake network.
 */
const source = readFileSync(resolve(process.cwd(), 'public/m/sw.js'), 'utf8');
const TOKEN = 'T'.repeat(43);
const ORIGIN = 'https://wellness.test';
const API = `https://api.wellness.test/api/public/cards/${TOKEN}`;
const DOC = `${ORIGIN}/m/${TOKEN}`;

type Handler = (event: any) => void;

const makeWorker = () => {
  const stored = new Map<string, Response>();
  const handlers: Record<string, Handler> = {};
  const network: { online: boolean; answers: Map<string, () => Response> } = { online: true, answers: new Map() };
  const cache = {
    match: async (url: string) => stored.get(url)?.clone(),
    put: async (url: string, response: Response) => void stored.set(url, response),
    delete: async (key: { url: string } | string) => stored.delete(typeof key === 'string' ? key : key.url),
    keys: async () => [...stored.keys()].map((url) => ({ url })),
  };
  const fakeFetch = async (input: any) => {
    const url = typeof input === 'string' ? input : input.url;
    if (!network.online) throw new TypeError('Failed to fetch');
    const answer = network.answers.get(url);
    return answer ? answer() : new Response('', { status: 404 });
  };
  const self = {
    location: { origin: ORIGIN },
    addEventListener: (name: string, handler: Handler) => void (handlers[name] = handler),
    skipWaiting: async () => undefined,
    clients: { claim: async () => undefined },
  };
  new Function('self', 'caches', 'fetch', 'Response', 'Headers', 'URL', source)(
    self,
    { open: async () => cache, keys: async () => ['wellness-card-v1', 'old-cache'], delete: async () => true },
    fakeFetch,
    Response,
    Headers,
    URL
  );
  const request = (url: string, mode: string = 'cors') => ({ url, method: 'GET', mode });
  const fetchEvent = async (req: ReturnType<typeof request>) => {
    let responded: Promise<Response> | undefined;
    const pending: Promise<unknown>[] = [];
    handlers.fetch({ request: req, respondWith: (p: Promise<Response>) => void (responded = p), waitUntil: (p: Promise<unknown>) => void pending.push(p) });
    const response = responded ? await responded : undefined;
    await Promise.all(pending);
    return response;
  };
  return { stored, network, fetchEvent, request, handlers };
};

const card = JSON.stringify({ data: { name: 'Ana Hoxha', qrSvg: '<svg/>' } });

describe('The card service worker (M4 Slice 12)', () => {
  let w: ReturnType<typeof makeWorker>;
  beforeEach(() => {
    w = makeWorker();
  });

  it('FR-CRD-06 with the network off it answers the stored card and marks it with when it was stored', async () => {
    w.network.answers.set(API, () => new Response(card, { status: 200 }));
    const online = await w.fetchEvent(w.request(API));
    expect(online?.headers.get('X-From-Cache')).toBeNull();

    w.network.online = false;
    const offline = await w.fetchEvent(w.request(API));
    expect(offline?.status).toBe(200);
    expect(offline?.headers.get('X-From-Cache')).toBe('1');
    expect(Number.isNaN(Date.parse(offline?.headers.get('X-Cached-At') ?? ''))).toBe(false);
    expect(await offline?.text()).toBe(card);
  });

  it('FR-CRD-06 the card document and its assets open offline too', async () => {
    w.network.answers.set(DOC, () => new Response('<html>card</html>', { status: 200 }));
    w.network.answers.set(`${ORIGIN}/assets/card-abc.js`, () => new Response('js', { status: 200 }));
    await w.fetchEvent(w.request(DOC, 'navigate'));
    await w.fetchEvent(w.request(`${ORIGIN}/assets/card-abc.js`, 'no-cors'));

    w.network.online = false;
    expect(await (await w.fetchEvent(w.request(DOC, 'navigate')))?.text()).toBe('<html>card</html>');
    expect(await (await w.fetchEvent(w.request(`${ORIGIN}/assets/card-abc.js`, 'no-cors')))?.text()).toBe('js');
  });

  it.each([410, 404])('FR-CRD-06, FR-CRD-10 a %i answer deletes every stored copy of that card and passes the answer on', async (status) => {
    w.network.answers.set(API, () => new Response(card, { status: 200 }));
    w.network.answers.set(DOC, () => new Response('<html/>', { status: 200 }));
    await w.fetchEvent(w.request(API));
    await w.fetchEvent(w.request(DOC, 'navigate'));
    w.network.answers.set(`${ORIGIN}/assets/card-abc.js`, () => new Response('js', { status: 200 }));
    await w.fetchEvent(w.request(`${ORIGIN}/assets/card-abc.js`, 'no-cors'));
    expect(w.stored.size).toBe(3);

    w.network.answers.set(API, () => new Response('{}', { status }));
    const answer = await w.fetchEvent(w.request(API));
    expect(answer?.status).toBe(status);
    expect([...w.stored.keys()]).toEqual([`${ORIGIN}/assets/card-abc.js`]);

    w.network.online = false;
    expect((await w.fetchEvent(w.request(API)))?.type).toBe('error');
  });

  it('D14 it leaves everything outside the card alone: the manifest, other routes, other origins and writes', async () => {
    for (const req of [
      w.request(`${API}/manifest.webmanifest`),
      w.request(`${ORIGIN}/acme/clients`, 'navigate'),
      w.request(`${ORIGIN}/api/acme/quotations`),
      w.request('https://elsewhere.test/assets/x.js', 'no-cors'),
      w.request(`${ORIGIN}/m/sw.js`, 'navigate'),
      { ...w.request(API), method: 'POST' },
    ]) {
      expect(await w.fetchEvent(req)).toBeUndefined();
    }
  });

  it('the first visit: the page hands the worker its document, its assets and the answer, and nothing else is stored', async () => {
    w.network.answers.set(DOC, () => new Response('<html/>', { status: 200 }));
    w.network.answers.set(API, () => new Response(card, { status: 200 }));
    w.network.answers.set(`${ORIGIN}/assets/a.js`, () => new Response('js', { status: 200 }));
    w.network.answers.set(`${ORIGIN}/acme/clients`, () => new Response('private', { status: 200 }));
    const pending: Promise<unknown>[] = [];
    w.handlers.message({
      data: { type: 'store', urls: [DOC, API, `${ORIGIN}/assets/a.js`, `${ORIGIN}/acme/clients`, 'https://elsewhere.test/assets/x.js'] },
      waitUntil: (p: Promise<unknown>) => pending.push(p),
    });
    await Promise.all(pending);
    expect([...w.stored.keys()].sort()).toEqual([API, DOC, `${ORIGIN}/assets/a.js`].sort());
    expect(w.stored.get(API)?.headers.get('X-Cached-At')).toBeTruthy();
  });
});

describe('Service worker registration (D14)', () => {
  it('the staff application never registers a worker: navigator.serviceWorker.register appears only in the card entry', () => {
    const root = resolve(process.cwd(), 'src');
    const found: string[] = [];
    const walk = (dir: string) => {
      for (const name of readdirSync(dir)) {
        const path = join(dir, name);
        if (statSync(path).isDirectory()) walk(path);
        else if (/\.(ts|tsx|js|jsx)$/.test(name) && !/\.test\./.test(name) && /serviceWorker\s*\n?\s*\.register\(/.test(readFileSync(path, 'utf8'))) found.push(relative(root, path).split(sep).join('/'));
      }
    };
    walk(root);
    expect(found).toEqual(['pages/card/cardInstall.ts']);
  });
});
