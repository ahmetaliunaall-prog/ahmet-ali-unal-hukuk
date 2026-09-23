const CACHE='hukuk-portal-signature-2026-v1';
const CORE=['/','/index.html','/manifest.webmanifest'];
self.addEventListener('install',event=>event.waitUntil(caches.open(CACHE).then(c=>c.addAll(CORE)).then(()=>self.skipWaiting())));
self.addEventListener('activate',event=>event.waitUntil(self.clients.claim()));
self.addEventListener('fetch',event=>{
  const u=new URL(event.request.url);
  if(u.origin!==location.origin || event.request.method!=='GET') return;
  event.respondWith(caches.match(event.request).then(cached=>cached||fetch(event.request).then(r=>{if(r.ok && (u.pathname==='/'||u.pathname.endsWith('.html')||u.pathname.endsWith('.webmanifest'))) caches.open(CACHE).then(c=>c.put(event.request,r.clone())); return r}).catch(()=>caches.match('/index.html'))));
});
