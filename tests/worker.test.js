import assert from 'node:assert/strict';
import { afterEach, test } from 'node:test';
import { readFile } from 'node:fs/promises';
import vm from 'node:vm';
import worker from '../worker/index.js';

const originalFetch = globalThis.fetch;

class TestHTMLRewriter {
  on(selector, handlers) {
    this.selector = selector;
    this.handlers = handlers;
    return this;
  }

  transform(response) {
    return response.text().then(html => {
      if (this.selector === 'script' && this.handlers?.element) {
        html = html.replace(/<script\b([^>]*)>/gi, (tag, sourceAttributes) => {
          const attributes = new Map();
          for (const match of sourceAttributes.matchAll(/([\w-]+)\s*=\s*(["'])(.*?)\2/g)) {
            attributes.set(match[1].toLowerCase(), match[3]);
          }
          this.handlers.element({ setAttribute: (name, value) => attributes.set(name.toLowerCase(), value) });
          const rendered = [...attributes].map(([name, value]) => ` ${name}="${value}"`).join('');
          return `<script${rendered}>`;
        });
      }
      return new Response(html, { status: response.status, statusText: response.statusText, headers: response.headers });
    });
  }
}

globalThis.HTMLRewriter = TestHTMLRewriter;

afterEach(() => { globalThis.fetch = originalFetch; });

function supabaseMock(tables = {}, status = 200) {
  return async input => {
    const url = new URL(input);
    if (url.hostname !== 'ztkopywelwximjiopdci.supabase.co') throw new Error(`Unexpected outbound host: ${url.hostname}`);
    if (status !== 200) return new Response('upstream failure', { status });
    const table = url.pathname.split('/').at(-1);
    const rows = tables[table] || [];
    const offset = Number(url.searchParams.get('offset') || 0);
    const limit = Number(url.searchParams.get('limit') || 1000);
    return new Response(JSON.stringify(rows.slice(offset, offset + limit)), {
      status: 200,
      headers: { 'content-type': 'application/json' }
    });
  };
}

test('all browser inline scripts parse as JavaScript', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const scripts = [...html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)]
    .filter(([, attributes]) => !/\bsrc\s*=/.test(attributes))
    .map(([, , source]) => source.trim())
    .filter(Boolean);
  assert.ok(scripts.length >= 2, 'expected the SDK loader and application scripts');
  scripts.forEach((source, index) => new vm.Script(source, { filename: `index-inline-${index + 1}.js` }));
});

test('separate experience layers share app services and add toolbar actions only once', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /window\.__portalShared=\{featureEnabled,featureMap,notify,openModal/);
  assert.match(html, /items\.filter\(\(\[key,action\]\)=>f\[key\]&&!dock\.querySelector/);
  assert.match(html, /data-action="save-note"/);
  assert.match(html, /function collectionItem\(key\)/);
});

test('PWA manifest includes valid 192 and 512 pixel install icons', async () => {
  const manifest = JSON.parse(await readFile(new URL('../public/manifest.webmanifest', import.meta.url), 'utf8'));
  const icons = manifest.icons || [];
  for (const size of [192, 512]) {
    const icon = icons.find(entry => entry.sizes === `${size}x${size}` && entry.type === 'image/png');
    assert.ok(icon, `expected ${size} pixel PNG icon`);
    assert.match(icon.purpose, /maskable/);
    const image = await readFile(new URL(`../public/icon-${size}.png`, import.meta.url));
    assert.deepEqual([...image.subarray(0, 8)], [137, 80, 78, 71, 13, 10, 26, 10]);
    assert.equal(image.readUInt32BE(16), size);
    assert.equal(image.readUInt32BE(20), size);
  }
  const serviceWorker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  new vm.Script(serviceWorker, { filename: 'public/sw.js' });
});

test('health endpoint reports the Worker without pretending to probe Supabase', async () => {
  const response = await worker.fetch(new Request('https://portal.example/healthz'), { ASSETS: {} });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.ok, true);
  assert.equal(result.dependencies.supabase, 'not_checked');
  assert.equal(response.headers.get('cache-control'), 'no-store');
  assert.ok(response.headers.get('content-security-policy'));
});

test('unsupported methods are rejected before reaching assets or APIs', async () => {
  const response = await worker.fetch(new Request('https://portal.example/sitemap.xml', { method: 'POST' }), { ASSETS: {} });
  assert.equal(response.status, 405);
  assert.equal(response.headers.get('allow'), 'GET, HEAD');
});

test('RSS feed includes recent published articles and escapes XML content', async () => {
  globalThis.fetch = supabaseMock({ articles: [{
    slug: 'hak-ve-ozgurluk',
    title: 'A & <B> Hukuku',
    excerpt: 'Kısa <açıklama> & ayrıntı',
    published_at: '2026-09-01T10:00:00Z'
  }] });
  const response = await worker.fetch(new Request('https://portal.example/feed.xml'), { ASSETS: {} });
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /<rss version="2\.0"/);
  assert.match(body, /A &amp; &lt;B&gt; Hukuku/);
  assert.match(body, /Kısa &lt;açıklama&gt; &amp; ayrıntı/);
  assert.match(body, /https:\/\/portal\.example\/makale\/hak-ve-ozgurluk/);
});

test('sitemap paginates content and tolerates malformed last-modified dates', async () => {
  const articles = Array.from({ length: 1000 }, (_, index) => ({
    slug: `article-${index}`,
    updated_at: index === 0 ? 'not-a-date' : '2026-09-01T10:00:00Z',
    published_at: null
  }));
  globalThis.fetch = supabaseMock({ articles, caselaw: [], glossary_terms: [] });
  const response = await worker.fetch(new Request('https://portal.example/sitemap.xml'), { ASSETS: {} });
  const body = await response.text();
  assert.equal(response.status, 200);
  assert.match(body, /<urlset/);
  assert.match(body, /<loc>https:\/\/portal\.example\/makale\/article-999<\/loc>/);
  assert.equal((body.match(/<url>/g) || []).length, 1007);
  assert.doesNotMatch(body, /Invalid Date|NaN/);
});

test('sitemap returns a retryable error instead of silently presenting incomplete data', async () => {
  globalThis.fetch = supabaseMock({}, 503);
  const originalConsoleError = console.error;
  console.error = () => {};
  let response;
  try {
    response = await worker.fetch(new Request('https://portal.example/sitemap.xml'), { ASSETS: {} });
  } finally {
    console.error = originalConsoleError;
  }
  assert.equal(response.status, 503);
  assert.equal(response.headers.get('retry-after'), '60');
  assert.equal(response.headers.get('cache-control'), 'no-store');
});

test('HTML fallback applies a matching nonce to inline scripts and CSP', async () => {
  const assets = {
    fetch: async request => {
      const path = new URL(request.url).pathname;
      if (path === '/missing-route') return new Response('not found', { status: 404 });
      return new Response('<!doctype html><html><script>window.ready=true</script></html>', {
        status: 200,
        headers: { 'content-type': 'text/html; charset=utf-8' }
      });
    }
  };
  const response = await worker.fetch(new Request('https://portal.example/missing-route'), { ASSETS: assets });
  const html = await response.text();
  const scriptNonce = html.match(/<script[^>]+nonce="([^"]+)"/)?.[1];
  assert.equal(response.status, 200);
  assert.ok(scriptNonce);
  assert.ok(response.headers.get('content-security-policy').includes(`'nonce-${scriptNonce}'`));
  assert.equal(response.headers.get('content-length'), null);
});

test('HEAD returns headers without a response body', async () => {
  const response = await worker.fetch(new Request('https://portal.example/healthz', { method: 'HEAD' }), { ASSETS: {} });
  assert.equal(response.status, 200);
  assert.equal(await response.text(), '');
});

test('scheduled SEO job skips cleanly until its secret is configured', async () => {
  let called = false;
  globalThis.fetch = async () => { called = true; throw new Error('unexpected request'); };
  const pending = [];
  await worker.scheduled({}, {}, { waitUntil: promise => pending.push(promise) });
  await Promise.all(pending);
  assert.equal(called, false);
});
