AHMET ALİ ÜNAL HUKUK PORTALI — CLOUDFLARE WORKERS
Sürüm: 2.0.0

MİMARİ
- worker/index.js: HTTP uçları, HTML güvenlik başlıkları, RSS ve sitemap üretimi.
- public/: portal arayüzü, çevrimdışı uygulama kabuğu ve PWA dosyaları.
- wrangler.json: Workers Static Assets yönlendirmesi ve günlük SEO zamanlayıcısı.
- tests/: Worker uçları ve tarayıcı JavaScript sözdizimi için bağımlılıksız testler.

YEREL KONTROL
1. Node.js kurulu bir ortamda proje klasörüne girin.
2. npm install
3. npm test
4. npm run dev

YAYINA ALMA
1. Cloudflare hesabınızla Wrangler oturumu açın.
2. Gerekirse `wrangler.json` içindeki Worker adını ve alan adı yönlendirmesini düzenleyin.
3. `npm run deploy:dry-run` ile paketi kontrol edin.
4. `npm run deploy` ile Worker ve statik dosyaları birlikte yayımlayın.
5. Günlük SEO görevini etkinleştirmek için `npx wrangler secret put SEO_AUTOPILOT_SECRET` komutuyla yalnızca Cloudflare'da gizli değişken tanımlayın. Bu değer kaynak dosyalara eklenmemelidir.

SEO görevi her gün 07:00 UTC'de çalışır. Gizli değer tanımlı değilse güvenli biçimde atlanır. Görev, mevcut Supabase `seo-autopilot` Edge Function'ına `audit-and-fix` isteği gönderir.

SUPABASE BAĞLANTISI
Paket, mevcut Supabase projesinin URL ve publishable anahtarını kullanır. Publishable anahtar tarayıcıda bulunabilir; service role anahtarı paket içinde yoktur. Erişim güvenliği Supabase RLS ilkelerine ve tablo izinlerine bağlıdır.

Portal şu tabloları bekler: `admin_users`, `articles`, `caselaw`, `contact_messages`, `faq`, `glossary_terms`, `homepage_sections`, `navigation_items`, `site_settings`, `visitor_logs`.

İsteğe bağlı Edge Function'lar: `ai-assistant`, `google-seo`, `seo-autopilot`, `telegram-notify`, `visitor-track`. İlgili dış hizmet ayarları olmadan bu paneller açıklayıcı hata verir; temel portal, makale, içtihat, sözlük, SSS ve iletişim akışları Supabase tablo politikalarıyla çalışır.

Yönetici hesabı Supabase Auth'ta bulunmalı ve `admin_users.user_id` alanında aynı Auth UID ile eşleşmelidir. Anonim kullanıcılar yalnızca yayımlanmış içeriği okuyabilmeli; iletişim formu için gerekli INSERT izni dışında içerik tablolarına yazamamalıdır. Yönetici CRUD işlemleri için yalnızca yöneticiye açık RLS politikaları gerekir.

UÇ NOKTALARI
- `/healthz`: Worker'ın çalıştığını ve statik varlık bağını raporlar; Supabase erişimini test etmez.
- `/robots.txt`: tarayıcı yönergesi ve sitemap adresi.
- `/sitemap.xml`: yayımlanmış makale, içtihat ve sözlük kayıtları; sayfalı Supabase okuması.
- `/feed.xml`: son yayımlanan hukuk makaleleri için RSS 2.0 akışı.

Çevrimdışı mod, önbellekteki son sayfa kabuğunu ve yerel içerik kopyasını gösterir. Yeni Service Worker sürümü etkinleştiğinde eski portal önbellekleri temizlenir.
