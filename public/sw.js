const CACHE='hukuk-portal-signature-2026-v2';
const CORE=['/','/index.html','/manifest.webmanifest'];

self.addEventListener('install',event=>{
  event.waitUntil(
    caches.open(CACHE)
      .then(c=>c.addAll(CORE))
      .then(()=>self.skipWaiting())
  );
});

self.addEventListener('activate',event=>{
  event.waitUntil(
    caches.keys()
      .then(keys=>Promise.all(keys.filter(k=>k.startsWith('hukuk-portal-signature-') && k!==CACHE).map(k=>caches.delete(k))))
      .then(()=>self.clients.claim())
  );
});

self.addEventListener('fetch',event=>{
  const request=event.request;
  const u=new URL(request.url);
  if(u.origin!==location.origin || request.method!=='GET') return;

  const isDocument=request.mode==='navigate' || u.pathname==='/' || u.pathname==='/index.html';

  if(isDocument){
    /* Network-first prevents an old index.html from surviving a deployment. */
    event.respondWith(
      fetch(request)
        .then(response=>{
          if(response.ok){
            const copy=response.clone();
            event.waitUntil(caches.open(CACHE).then(c=>c.put('/index.html',copy)));
          }
          return response;
        })
        .catch(()=>caches.match('/index.html').then(c=>c || new Response('Çevrimdışı.',{status:503,headers:{'content-type':'text/plain; charset=UTF-8'}})))
    );
    return;
  }

  event.respondWith(
    caches.match(request).then(cached=>{
      if(cached) return cached;
      return fetch(request).then(response=>{
        if(response.ok && (u.pathname.endsWith('.webmanifest') || u.pathname.endsWith('.css') || u.pathname.endsWith('.js'))){
          event.waitUntil(caches.open(CACHE).then(c=>c.put(request,response.clone())));
        }
        return response;
      });
    })
  );
});
