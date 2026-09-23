AHMET ALİ ÜNAL HUKUK PORTALI - CLOUDFLARE WORKER

Bu paket Workers Static Assets mimarisi içindir.

YAPI:
- worker/index.js   = Cloudflare Worker kodu
- public/index.html = ana site
- public/manifest.webmanifest = PWA
- public/sw.js = Service Worker
- public/icon-192.png / icon-512.png = PWA ikonları
- wrangler.json = Worker + Static Assets yapılandırması

DEPLOY:
1. Cloudflare Workers/Workers & Pages bölümünden Worker projesi oluşturun.
2. Bu klasörü Wrangler ile deploy edin:
   wrangler deploy
3. Supabase URL ve publishable/anon key index.html içinde kullanılmaktadır.
4. Service role, Gemini secret ve Telegram bot token frontend'e gömülmez.
5. SEO autopilot için Worker secret gerekiyorsa Cloudflare Worker secret olarak SEO_AUTOPILOT_SECRET tanımlayın.

ÖNEMLİ:
- "Upload static files" ekranı tek başına Worker kodunu çalıştırmaz.
- /healthz, /robots.txt ve /sitemap.xml Worker tarafından sağlanır.
- SPA yolları Worker güvenlik başlıklarından geçecek şekilde yapılandırılmıştır.
- HTML için süresiz Worker cache kullanılmaz; yeni deploy sonrası eski index.html'in kalması engellenmiştir.
- Service Worker yeni sürümde eski cache'i temizler ve HTML'de network-first çalışır.
- PWA ikonları pakete dahildir.

DEPLOY SONRASI KONTROL:
1. /healthz açılmalı ve {"ok":true,...} dönmeli.
2. /robots.txt içinde Sitemap satırı bulunmalı.
3. /sitemap.xml XML urlset üretmeli.
4. Ana sayfa, /makaleler, /ictihatlar, /sozluk, /sss, /hakkimda ve /iletisim açılmalı.
5. Admin'e giriş yaptıktan sonra Yönetim > Canlı Sistem Testi çalıştırılmalı.
6. Supabase Edge Function'lar (ai-assistant, telegram-notify, visitor-track, google-seo ve seo-autopilot kullanılıyorsa) ayrıca deploy edilmiş olmalıdır.

GÜVENLİK:
- Frontend yalnızca Supabase publishable/anon anahtarını kullanır.
- RLS politikaları Supabase tarafında zorunludur.
- Admin yetkisi admin_users + Supabase Auth üzerinden kontrol edilir.
- AI ve Telegram secret değerleri HTML'e yazılmaz.
