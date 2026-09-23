AHMET ALİ ÜNAL HUKUK PORTALI - CLOUDFLARE WORKER

Bu paket Workers Static Assets mimarisi içindir.

YAPI:
- worker/index.js   = Cloudflare Worker kodu
- public/index.html = ana site
- public/manifest.webmanifest = PWA
- public/sw.js = Service Worker
- wrangler.json = Worker + Static Assets yapılandırması

ÖNEMLİ:
Bu paket, yalnızca "Upload static files" ekranına yüklenerek Worker kodunu çalıştırmaz.
Cloudflare'da Worker deployment/project olarak deploy edilmelidir.

Worker kodu /healthz, /robots.txt ve /sitemap.xml uçlarını sağlar; bilinmeyen SPA yollarını index.html'e düşürür.
Supabase bilgileri mevcut frontend ile korunmuştur. Service role veya gizli anahtar içermez.
