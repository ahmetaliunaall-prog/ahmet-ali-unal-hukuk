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
  assert.match(html, /\['citation_scan','Atıf bulucu'/);
  assert.match(html, /\['print_download','Yazdır \/ PDF'/);
  assert.match(html, /Object\.keys\(featureMap\(\)\)\.length>=FEATURE_CATALOG\.length/);
});

test('admin live test safely probes a real Supabase contact insert and cleanup', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /async function insertContactMessage\(client,data\)/);
  assert.match(html, /İletişim formu Supabase testi/);
  assert.match(html, /anonymousClient\.from\(CONFIG\.TABLES\.contact\)\.select\('id'\)/);
  assert.match(html, /else if\(item\.filters&&Object\.keys\(item\.filters\)\.length\)/);
  assert.match(html, /JSON\.stringify\(x\.filters\|\|\{\}\)/);
  assert.match(html, /anonymousClient\.from\(CONFIG\.TABLES\.articles\)\.insert\(probe\)/);
});

test('live SEO check uses the public page and integrations are probed without side effects', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  assert.match(html, /setMeta\(\{title:'SEO kontrolü'/);
  assert.match(html, /jsonLd:baseJsonLd\(\)/);
  assert.match(html, /JSON\.parse\(jsonld\.textContent\)/);
  assert.match(html, /fetch\('\/healthz\/integrations'/);
  assert.match(html, /telegram-notify endpointi erişilebilir/);
  assert.match(html, /ai-assistant endpointi erişilebilir/);
  assert.match(html, /Gemini kotası kullanabilir/);
  assert.match(html, /Telegram onayı tek gerçek test mesajı yollar/);
  assert.match(html, /Telegram bağlantısını gerçekten denetlemek/);
  assert.match(html, /Gemini bağlantısını gerçekten denetlemek/);
  assert.match(html, /sb\.functions\.invoke\(CONFIG\.TELEGRAM_FUNCTION/);
  assert.match(html, /sb\.functions\.invoke\(CONFIG\.AI_FUNCTION/);
  assert.doesNotMatch(html, /skip\('Telegram gerçek mesaj gönderimi'/);
  assert.doesNotMatch(html, /skip\('Gemini gerçek çağrısı'/);
});

test('legal citation finder identifies Turkish statute and decision references', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const serviceWorker = await readFile(new URL('../public/sw.js', import.meta.url), 'utf8');
  const start = html.indexOf('function citationCandidates(source){');
  const end = html.indexOf('function scanCitations(){', start);
  assert.ok(start >= 0 && end > start, 'expected the pure citation matcher');
  const context = {};
  vm.runInNewContext(`${html.slice(start, end)};globalThis.scan=citationCandidates`, context);
  const result = context.scan('6098 sayılı Türk Borçlar Kanunu\'nun 344. maddesi ve TBK m. 138 uygulanır. Yargıtay 3. Hukuk Dairesi, E. 2022/123, K. 2023/456. Ayrıca §§ 1, 2.');
  const citations = result.map(item => item.citation);
  assert.ok(citations.some(item => /6098 sayılı Türk Borçlar Kanunu/.test(item)));
  assert.ok(citations.some(item => /TBK m\. 138/.test(item)));
  assert.ok(citations.some(item => /Yargıtay.*E\. 2022\/123.*K\. 2023\/456/.test(item)));
  assert.ok(citations.some(item => /§§ 1, 2/.test(item)));
  assert.match(html, /data-action="scan-citations"/);
  assert.match(html, /data-action="print-article"/);
  assert.match(html, /https:\/\/karararama\.yargitay\.gov\.tr\/index/);
  assert.match(html, /Resmî Yargıtay karar aramasını aç/);
  assert.match(html, /let initInFlight=false,initRunId=0/);
  assert.match(html, /Site verileri zamanında yanıt vermedi/);
  assert.match(serviceWorker, /const CACHE_NAME = `\$\{CACHE_PREFIX\}2026-09-23-v3`/);
  assert.match(html, /@media print/);
  assert.match(html, /c\?\.court,c\?\.chamber,c\?\.decision_number/);
  assert.match(html, /dateLabel\(c\?\.decision_date\)/);
});

test('Yargıtay citation action opens the official case-search portal', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const matcherStart = html.indexOf('function citationCandidates(source){');
  const start = html.indexOf('function scanCitations(){');
  const end = html.indexOf('function preferredSource(){', start);
  assert.ok(matcherStart >= 0 && start > matcherStart && end > start, 'expected the citation matcher and renderer');
  const context = {
    document: { querySelector: () => ({ innerText: 'Yargıtay 3. Hukuk Dairesi E. 2022/123 K. 2023/456' }) },
    esc: value => String(value), openModal: value => { context.modal = value; }, window: {}
  };
  vm.runInNewContext(`${html.slice(matcherStart, end)};scanCitations()`, context);
  assert.match(context.modal, /https:\/\/karararama\.yargitay\.gov\.tr\/index/);
  assert.match(context.modal, /Resmî Yargıtay karar aramasını aç/);
  assert.match(context.modal, /Yukarıdaki atfı kopyalayıp arama alanına yapıştırın/);
});

test('bulk article generation reserves unique slugs before insert', async () => {
  const html = await readFile(new URL('../public/index.html', import.meta.url), 'utf8');
  const start = html.indexOf('async function reserveUniqueArticleSlugs(rows){');
  const end = html.indexOf('\nasync function runBulkAI(){', start);
  assert.ok(start >= 0 && end > start, 'expected article slug reservation helper');
  const context = {
    CONFIG: { TABLES: { articles: 'articles' } },
    sb: { from: () => ({ select: async () => ({ data: [{ slug: 'kira-hukuku' }, { slug: 'kira-hukuku-2' }], error: null }) }) },
    text: value => String(value || ''), slugify: value => String(value).toLocaleLowerCase('tr-TR').replaceAll(' ', '-')
  };
  const result = await vm.runInNewContext(`${html.slice(start, end)};reserveUniqueArticleSlugs([{title:'Kira hukuku',slug:'kira-hukuku'},{title:'Kira hukuku',slug:'kira-hukuku'}])`, context);
  assert.deepEqual(Array.from(result, row => row.slug), ['kira-hukuku-3', 'kira-hukuku-4']);
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

test('GitHub automatically runs the test suite on pushes and pull requests', async () => {
  const workflow = await readFile(new URL('../.github/workflows/test.yml', import.meta.url), 'utf8');
  const runner = await readFile(new URL('../TESTI-CALISTIR.bat', import.meta.url), 'utf8');
  assert.match(workflow, /push:/);
  assert.match(workflow, /pull_request:/);
  assert.match(workflow, /run: npm test/);
  assert.match(runner, /call npm test/i);
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

test('integration health endpoint probes Edge Function OPTIONS without invoking providers', async () => {
  const methods = [];
  globalThis.fetch = async (input, init) => {
    const url = new URL(input);
    assert.equal(url.hostname, 'ztkopywelwximjiopdci.supabase.co');
    methods.push([url.pathname, init.method]);
    return new Response(null, { status: 204 });
  };
  const response = await worker.fetch(new Request('https://portal.example/healthz/integrations'), { ASSETS: {} });
  const result = await response.json();
  assert.equal(response.status, 200);
  assert.equal(result.integrations.telegram.reachable, true);
  assert.equal(result.integrations.ai.reachable, true);
  assert.deepEqual(methods.map(([path]) => path).sort(), [
    '/functions/v1/ai-assistant', '/functions/v1/telegram-notify'
  ]);
  assert.ok(methods.every(([, method]) => method === 'OPTIONS'));
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
