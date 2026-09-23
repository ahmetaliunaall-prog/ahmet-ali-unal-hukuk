const SUPABASE_URL = 'https://ztkopywelwximjiopdci.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_mkA2Q3ivb3uhxSb9QxF6cg_MxcfZGJ-';
const REST_PAGE_SIZE = 1000;
const MAX_SITEMAP_URLS = 50_000;
const UPSTREAM_TIMEOUT_MS = 8_000;
const XML_HEADERS = {
  'content-type': 'application/xml; charset=UTF-8',
  'cache-control': 'public, max-age=300, s-maxage=300, stale-while-revalidate=600'
};

function xmlEscape(value = '') {
  return String(value).replace(/[&<>"']/g, character => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;'
  })[character]);
}

function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/g, '');
}

function securityHeaders(value) {
  return {
    'X-Content-Type-Options': 'nosniff',
    'X-Frame-Options': 'DENY',
    'Referrer-Policy': 'strict-origin-when-cross-origin',
    'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    'Strict-Transport-Security': 'max-age=31536000; includeSubDomains',
    'Cross-Origin-Opener-Policy': 'same-origin',
    'Cross-Origin-Resource-Policy': 'same-origin',
    'Content-Security-Policy': [
      "default-src 'self'",
      `script-src 'self' 'nonce-${value}' https://cdn.jsdelivr.net https://unpkg.com https://www.googletagmanager.com https://news.google.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
      'upgrade-insecure-requests'
    ].join('; ')
  };
}

async function fetchSupabaseRows(table, select, order, offset) {
  const url = new URL(`/rest/v1/${table}`, SUPABASE_URL);
  url.search = new URLSearchParams({
    status: 'eq.published',
    select,
    order,
    limit: String(REST_PAGE_SIZE),
    offset: String(offset)
  });
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('Supabase request timed out'), UPSTREAM_TIMEOUT_MS);
  try {
    const response = await fetch(url, {
      headers: {
        apikey: SUPABASE_PUBLISHABLE_KEY,
        Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}`
      },
      signal: controller.signal
    });
    if (!response.ok) throw new Error(`Supabase returned ${response.status} for ${table}`);
    const data = await response.json();
    if (!Array.isArray(data)) throw new Error(`Unexpected Supabase response for ${table}`);
    return data;
  } finally {
    clearTimeout(timeout);
  }
}

async function allPublishedRows(table, select, order) {
  const rows = [];
  for (let offset = 0; ; offset += REST_PAGE_SIZE) {
    const page = await fetchSupabaseRows(table, select, order, offset);
    if (rows.length + page.length > MAX_SITEMAP_URLS) {
      throw new Error(`The ${table} result exceeds the supported sitemap size.`);
    }
    rows.push(...page);
    if (page.length < REST_PAGE_SIZE) return rows;
  }
}

function validIsoDate(value, fallback) {
  const date = value ? new Date(value) : new Date(fallback);
  return Number.isNaN(date.getTime()) ? new Date(fallback).toISOString() : date.toISOString();
}

function publicRoutes(origin, now) {
  return ['/', '/makaleler', '/ictihatlar', '/sozluk', '/sss', '/hakkimda', '/iletisim']
    .map(path => ({ loc: new URL(path, origin).href, lastmod: now }));
}

async function sitemap(request) {
  const origin = new URL(request.url).origin;
  const now = new Date().toISOString();
  try {
    const [articles, cases, terms] = await Promise.all([
      allPublishedRows('articles', 'slug,updated_at,published_at', 'published_at.desc'),
      allPublishedRows('caselaw', 'id,updated_at,decision_date', 'decision_date.desc'),
      allPublishedRows('glossary_terms', 'id,updated_at,created_at', 'updated_at.desc')
    ]);
    if (articles.length + cases.length + terms.length + 7 > MAX_SITEMAP_URLS) {
      throw new Error('The combined content exceeds the supported sitemap size.');
    }
    const rows = [
      ...publicRoutes(origin, now),
      ...articles.filter(row => row.slug).map(row => ({
        loc: new URL(`/makale/${encodeURIComponent(row.slug)}`, origin).href,
        lastmod: validIsoDate(row.updated_at || row.published_at, now)
      })),
      ...cases.filter(row => row.id != null).map(row => ({
        loc: new URL(`/ictihat/${encodeURIComponent(row.id)}`, origin).href,
        lastmod: validIsoDate(row.updated_at || row.decision_date, now)
      })),
      ...terms.filter(row => row.id != null).map(row => ({
        loc: new URL(`/sozluk/${encodeURIComponent(row.id)}`, origin).href,
        lastmod: validIsoDate(row.updated_at || row.created_at, now)
      }))
    ];
    const seen = new Set();
    const unique = rows.filter(row => !seen.has(row.loc) && seen.add(row.loc));
    if (unique.length > MAX_SITEMAP_URLS) throw new Error('The sitemap exceeds the protocol URL limit.');
    const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${unique.map(row => `<url><loc>${xmlEscape(row.loc)}</loc><lastmod>${row.lastmod}</lastmod></url>`).join('')}</urlset>`;
    return new Response(body, { headers: XML_HEADERS });
  } catch (error) {
    console.error('Sitemap generation failed', error);
    return new Response('Sitemap geçici olarak üretilemiyor. Lütfen daha sonra tekrar deneyin.\n', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=UTF-8', 'cache-control': 'no-store', 'retry-after': '60' }
    });
  }
}

async function feed(request) {
  const origin = new URL(request.url).origin;
  try {
    const articles = await fetchSupabaseRows('articles', 'slug,title,excerpt,content,published_at,updated_at', 'published_at.desc', 0);
    const items = articles.filter(row => row.slug).slice(0, 50).map(row => {
      const link = new URL(`/makale/${encodeURIComponent(row.slug)}`, origin).href;
      const description = String(row.excerpt || row.content || '').replace(/\s+/g, ' ').trim().slice(0, 1200);
      const date = new Date(row.published_at || row.updated_at || Date.now());
      return `<item><title>${xmlEscape(row.title || 'Makale')}</title><link>${xmlEscape(link)}</link><guid isPermaLink="true">${xmlEscape(link)}</guid><pubDate>${(Number.isNaN(date.getTime()) ? new Date() : date).toUTCString()}</pubDate><description>${xmlEscape(description)}</description></item>`;
    });
    const body = `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom"><channel><title>${xmlEscape('Hukuki Aydınlatma Portalı')}</title><link>${xmlEscape(origin)}</link><description>${xmlEscape('Yeni yayınlanan hukuk makaleleri')}</description><language>tr-TR</language><atom:link href="${xmlEscape(new URL('/feed.xml', origin).href)}" rel="self" type="application/rss+xml"/>${items.join('')}</channel></rss>`;
    return new Response(body, { headers: XML_HEADERS });
  } catch (error) {
    console.error('RSS feed generation failed', error);
    return new Response('RSS akışı geçici olarak üretilemiyor. Lütfen daha sonra tekrar deneyin.\n', {
      status: 503,
      headers: { 'content-type': 'text/plain; charset=UTF-8', 'cache-control': 'no-store', 'retry-after': '60' }
    });
  }
}

async function htmlWithSecurity(response) {
  const value = nonce();
  const headers = new Headers(response.headers);
  Object.entries(securityHeaders(value)).forEach(([key, headerValue]) => headers.set(key, headerValue));
  if (!/^text\/html(?:\s*;|$)|^application\/xhtml\+xml(?:\s*;|$)/i.test(response.headers.get('content-type') || '')) {
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
  }
  headers.delete('content-length');
  const rewriter = new HTMLRewriter().on('script', {
    element(element) { element.setAttribute('nonce', value); }
  });
  return rewriter.transform(new Response(response.body, { status: response.status, statusText: response.statusText, headers }));
}

async function runSeoAutopilot(env) {
  const secret = env.SEO_AUTOPILOT_SECRET;
  if (!secret) return { ok: false, skipped: true, reason: 'SEO_AUTOPILOT_SECRET not configured' };
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('SEO autopilot timed out'), 15_000);
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/seo-autopilot`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', 'x-autopilot-secret': secret },
      body: JSON.stringify({ mode: 'audit-and-fix' }),
      signal: controller.signal
    });
    const data = await response.json().catch(() => ({}));
    if (!response.ok) throw new Error(`SEO autopilot returned ${response.status}`);
    return { ok: true, ...data };
  } finally {
    clearTimeout(timeout);
  }
}

function methodNotAllowed() {
  return new Response('Method not allowed', {
    status: 405,
    headers: { allow: 'GET, HEAD', 'content-type': 'text/plain; charset=UTF-8', 'cache-control': 'no-store' }
  });
}

function headResponse(response) {
  return new Response(null, { status: response.status, statusText: response.statusText, headers: response.headers });
}

async function probeEdgeFunction(name) {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort('Supabase function probe timed out'), 8_000);
  try {
    const response = await fetch(`${SUPABASE_URL}/functions/v1/${encodeURIComponent(name)}`, {
      method: 'OPTIONS',
      headers: { apikey: SUPABASE_PUBLISHABLE_KEY },
      signal: controller.signal
    });
    return { reachable: response.ok, status: response.status };
  } catch (error) {
    return { reachable: false, status: null, error: error?.name === 'AbortError' ? 'timeout' : 'network_error' };
  } finally {
    clearTimeout(timeout);
  }
}

async function integrationHealth() {
  const [telegram, ai] = await Promise.all([
    probeEdgeFunction('telegram-notify'),
    probeEdgeFunction('ai-assistant')
  ]);
  return new Response(JSON.stringify({ ok: true, integrations: { telegram, ai } }), {
    headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' }
  });
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runSeoAutopilot(env).catch(error => console.error('SEO autopilot failed', error)));
  },

  async fetch(request, env) {
    if (request.method !== 'GET' && request.method !== 'HEAD') return methodNotAllowed();

    const url = new URL(request.url);
    let response;
    if (url.pathname === '/sitemap.xml') {
      response = await sitemap(request);
    } else if (url.pathname === '/feed.xml') {
      response = await feed(request);
    } else if (url.pathname === '/robots.txt') {
      response = new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${url.origin}/sitemap.xml\n`, {
        headers: { 'content-type': 'text/plain; charset=UTF-8', 'cache-control': 'public, max-age=300, s-maxage=300' }
      });
    } else if (url.pathname === '/healthz') {
      response = new Response(JSON.stringify({
        ok: true,
        service: 'hukuk-portal',
        time: new Date().toISOString(),
        dependencies: { staticAssets: Boolean(env.ASSETS), supabase: 'not_checked' }
      }), {
        headers: { 'content-type': 'application/json; charset=UTF-8', 'cache-control': 'no-store' }
      });
    } else if (url.pathname === '/healthz/integrations') {
      response = await integrationHealth();
    } else {
      response = await env.ASSETS.fetch(request);
      if (response.status === 404 && request.method === 'GET' && !url.pathname.includes('.')) {
        response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
      }
    }

    const secured = await htmlWithSecurity(response);
    return request.method === 'HEAD' ? headResponse(secured) : secured;
  }
};
