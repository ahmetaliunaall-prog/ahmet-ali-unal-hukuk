const SUPABASE_URL = 'https://ztkopywelwximjiopdci.supabase.co';
const SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_mkA2Q3ivb3uhxSb9QxF6cg_MxcfZGJ-';

const ALLOWED_CONTENT_TYPES = /^(text\/html|application\/xhtml\+xml)/i;

function xmlEscape(v='') {
  return String(v).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;').replace(/'/g,'&apos;');
}
function absolute(base, path='') { return new URL(path, base).href; }
function safeIso(value, fallback) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toISOString() : fallback;
}
function nonce() {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g,'-').replace(/\//g,'_').replace(/=+$/,'');
}
function securityHeaders(n) {
  return {
    'X-Content-Type-Options':'nosniff',
    'X-Frame-Options':'DENY',
    'Referrer-Policy':'strict-origin-when-cross-origin',
    'Permissions-Policy':'camera=(), microphone=(), geolocation=(), payment=(), usb=(), browsing-topics=()',
    'Strict-Transport-Security':'max-age=31536000; includeSubDomains; preload',
    'Cross-Origin-Opener-Policy':'same-origin',
    'Cross-Origin-Resource-Policy':'same-origin',
    'Content-Security-Policy':[
      "default-src 'self'",
      `script-src 'self' 'nonce-${n}' https://cdn.jsdelivr.net https://www.googletagmanager.com https://news.google.com`,
      "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
      "font-src 'self' https://fonts.gstatic.com data:",
      "img-src 'self' data: blob: https:",
      "connect-src 'self' https://*.supabase.co https://www.google-analytics.com https://analytics.google.com https://www.googletagmanager.com https://news.google.com",
      "frame-src 'none'",
      "object-src 'none'",
      "base-uri 'self'",
      "form-action 'self'",
      "frame-ancestors 'none'",
      "manifest-src 'self'",
      "worker-src 'self' blob:",
      "upgrade-insecure-requests"
    ].join('; ')
  };
}

async function rest(path) {
  const headers = { apikey: SUPABASE_PUBLISHABLE_KEY, Authorization: `Bearer ${SUPABASE_PUBLISHABLE_KEY}` };
  const r = await fetch(`${SUPABASE_URL}/rest/v1/${path}`, { headers });
  if (!r.ok) return [];
  return r.json();
}

async function sitemap(request) {
  const origin = new URL(request.url).origin;
  const now = new Date().toISOString();
  const [articles,cases,terms,faqs] = await Promise.all([
    rest('articles?status=eq.published&select=slug,updated_at,published_at&order=published_at.desc'),
    rest('caselaw?status=eq.published&select=id,updated_at,decision_date&order=decision_date.desc'),
    rest('glossary_terms?status=eq.published&select=id,updated_at&order=updated_at.desc'),
    rest('faq?status=eq.published&select=id,updated_at&order=updated_at.desc')
  ]);
  const rows = [
    { loc: origin + '/', lastmod: now },
    { loc: origin + '/makaleler', lastmod: now },
    { loc: origin + '/ictihatlar', lastmod: now },
    { loc: origin + '/sozluk', lastmod: now },
    { loc: origin + '/sss', lastmod: now },
    { loc: origin + '/hakkimda', lastmod: now },
    { loc: origin + '/iletisim', lastmod: now },
    ...articles.map(a => ({ loc: origin + '/makale/' + encodeURIComponent(a.slug), lastmod: safeIso(a.updated_at || a.published_at, now) })),
    ...cases.map(a => ({ loc: origin + '/ictihat/' + encodeURIComponent(a.id), lastmod: safeIso(a.updated_at || a.decision_date, now) })),
    ...terms.map(a => ({ loc: origin + '/sozluk/' + encodeURIComponent(a.id), lastmod: safeIso(a.updated_at, now) }))
  ];
  const body = `<?xml version="1.0" encoding="UTF-8"?><urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">${rows.map(x=>`<url><loc>${xmlEscape(x.loc)}</loc><lastmod>${new Date(x.lastmod).toISOString()}</lastmod></url>`).join('')}</urlset>`;
  return new Response(body,{headers:{'content-type':'application/xml; charset=UTF-8','cache-control':'public, max-age=300, s-maxage=300'} });
}

async function htmlWithSecurity(response) {
  const n = nonce();
  const h = new Headers(response.headers);
  Object.entries(securityHeaders(n)).forEach(([k,v])=>h.set(k,v));
  const ct = response.headers.get('content-type') || '';
  if (!ALLOWED_CONTENT_TYPES.test(ct)) return new Response(response.body,{status:response.status,statusText:response.statusText,headers:h});
  const rewriter = new HTMLRewriter().on('script', {
    element(el) { el.setAttribute('nonce', n); }
  });
  return rewriter.transform(new Response(response.body,{status:response.status,statusText:response.statusText,headers:h}));
}

async function runSeoAutopilot(env) {
  const secret=env.SEO_AUTOPILOT_SECRET;
  if(!secret) return {ok:false,skipped:true,reason:'SEO_AUTOPILOT_SECRET not configured'};
  const r=await fetch(`${SUPABASE_URL}/functions/v1/seo-autopilot`,{method:'POST',headers:{'content-type':'application/json','x-autopilot-secret':secret},body:JSON.stringify({mode:'audit-and-fix'})});
  const data=await r.json().catch(()=>({}));
  return {ok:r.ok,...data};
}

export default {
  async scheduled(controller, env, ctx) {
    ctx.waitUntil(runSeoAutopilot(env).catch(err=>console.error('SEO autopilot failed',err)));
  },
  async fetch(request, env, ctx) {
    const url = new URL(request.url);
    if (url.pathname === '/sitemap.xml') return sitemap(request);
    if (url.pathname === '/robots.txt') {
      const origin = url.origin;
      return new Response(`User-agent: *\nAllow: /\nDisallow: /admin\nDisallow: /api/\nSitemap: ${origin}/sitemap.xml\n`,{headers:{'content-type':'text/plain; charset=UTF-8','cache-control':'public, max-age=300, s-maxage=300',...securityHeaders('robots')}});
    }
    if (url.pathname === '/healthz') {
      return new Response(JSON.stringify({ok:true,service:'hukuk-portal',time:new Date().toISOString()}),{headers:{'content-type':'application/json; charset=UTF-8',...securityHeaders('health')}});
    }
    /* HTML is dynamic at the deployment level (new builds + CSP nonce), so do not
       serve an indefinitely stale Worker cache entry. Static Assets already has
       its own immutable asset caching strategy. */
    let response = await env.ASSETS.fetch(request);
    if (response.status === 404 && request.method === 'GET' && !url.pathname.includes('.')) {
      response = await env.ASSETS.fetch(new Request(new URL('/index.html', request.url), request));
    }
    const secured = await htmlWithSecurity(response);
    return secured;
  }
};
