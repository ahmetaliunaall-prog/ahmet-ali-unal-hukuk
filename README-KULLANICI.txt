HUKUK PORTALI — KULLANICI REHBERİ

PROJE NE YAPIYOR?
Bu proje, makale, içtihat, sözlük ve SSS yayımlayan bir hukuk bilgi portalıdır. İçerik yönetimi Supabase'e, web sitesi ve Worker uçları Cloudflare'a bağlıdır.

KODU NASIL KONTROL EDERİM?
1. ZIP dosyasını Windows'ta sağ tıklayıp “Tümünü ayıkla” ile bir klasöre çıkarın.
2. Node.js kurulu değilse https://nodejs.org adresinden LTS sürümünü kurun. Kurulum seçeneklerini değiştirmeden ilerleyebilirsiniz.
3. Çıkardığınız klasörde TESTI-CALISTIR.bat dosyasına çift tıklayın.
4. “16 tests” ve “pass 16” satırlarını görürseniz otomatik kod testleri geçmiştir. Pencereyi kapatmadan önce sonucu not edin.

Bu testler Worker uçlarını, JavaScript sözdizimini, PWA simgelerini ve bazı güvenlik yanıtlarını denetler. Gerçek Supabase hesabınıza giriş yapmaz, gerçek Cloudflare yayını yapmaz ve canlı içerik göndermez.

CANLI SUPABASE TESTİNİ SİTEDE NASIL ÇALIŞTIRIRIM?
Bu adımlar, siteniz Cloudflare'da yayımlandıktan ve Supabase ayarları bağlandıktan sonra uygulanır:
1. Sitenizin yönetici hesabıyla giriş yapın.
2. Yönetim menüsünden “Canlı Sistem Testi” sayfasını açın.
3. Sayfadaki uyarıyı okuyun. “Canlı sistemi test et” düğmesine basıp onay verince test başlar.
4. Sonuçta başarılı, hatalı ve güvenli şekilde atlanan kontroller ile varsa hata açıklaması görünür. Sonuç ekranının görüntüsünü veya hata metnini buraya gönderin; birlikte yorumlayalım.

Bu canlı test, Supabase'e bir adet açıkça otomatik test olarak işaretlenmiş geçici iletişim mesajı yazar. Yönetici hesabıyla kaydı doğrular, anonim kullanıcıların okuyamadığını kontrol eder ve test sonunda silmeyi doğrular. Ayrıca yönetim hesabının tablo erişimlerini, herkese açık okumaları, RLS güvenlik sınırlarını, site uçlarını ve yapılandırılmış bazı özellikleri kontrol eder. SEO kontrolü güvenlik nedeniyle siteyi çerçeveye almaya çalışmaz; metadata üreticisini geçici olarak çalıştırır, çıktıyı doğrular ve sayfa başlığını/metadata durumunu geri yükler. Telegram ve Gemini işlevlerinin erişimini Worker üzerinden güvenli OPTIONS isteğiyle kontrol eder. Ardından iki ayrı onay sorulur: Telegram onayı verirseniz gerçek bir test mesajı gönderilir; Gemini onayı verirseniz küçük bir test çağrısı yapılır ve Gemini kotası kullanabilir. İki isteği de reddederseniz testler SKIP olarak raporlanır. Supabase projenize kendi veritabanı tetikleyici veya webhook'unuzu bağladıysanız, iletişim test kaydı eklenmesi onu çalıştırabilir. Ekrandaki uyarıyı okuyup yalnızca testi çalıştırmaya hazır olduğunuzda onaylayın.

`TESTI-CALISTIR.bat` bilgisayarınızdaki kodu denetler; canlı Supabase testi değildir. Canlı test, yayımlanmış sitede yönetici oturumuyla çalıştırılır.

YENİ OKUMA ARAÇLARI
Makale veya içtihat açınca “Atıfları bul” düğmesi mevzuat maddesi ve karar numarası biçimlerini metinde tarar; eşleşmeyi kopyalayabilir veya arama sonuçlarına geçebilirsiniz. Yargıtay atıflarında resmî [Emsal Karar Arama](https://karararama.yargitay.gov.tr/index) sayfası açılır; atıf metnini kopyalayıp oradaki arama alanına yapıştırabilirsiniz. Bu otomatik bulgular kaynak/yürürlük doğrulaması değildir. “Yazdır / PDF” düğmesi tarayıcının yazdırma penceresini açar; buradan yazıcı seçebilir veya “PDF olarak kaydet” seçebilirsiniz.

Site ilk açılışta veri bağlantısı yanıt vermezse artık sonsuz yükleme ekranında kalmamalı; 25 saniye içinde açıklama ve “Tekrar dene” düğmesi görünür. Bu yerel simülasyonla doğrulandı; gerçek Supabase ağı ve Cloudflare yayını ayrıca canlı ortamda kontrol edilmelidir.

GITHUB'A YÜKLERSEM NE OLUR?
GitHub projeyi saklar ve bu paketteki otomatik testleri her yüklemede çalıştırabilir. GitHub'a yüklemek web sitesini tek başına yayına almaz. Otomatik sonuçları görmek için ZIP'i değil, ZIP'ten çıkardığınız proje dosyalarını yeni deponun köküne yükleyin. `.github` klasörünü de yükleyin; GitHub test akışı oradadır. Sonra GitHub deposundaki “Actions” bölümünde “Kod kontrolü” iş akışının yeşil tik alıp almadığına bakın.

SİTEYİ GERÇEKTEN YAYINA ALMAK İÇİN
- Cloudflare hesabında Worker'ı yayımlamak ve alan adını bağlamak gerekir.
- Supabase tabloları, giriş hesabı ve RLS erişim kuralları doğru yapılandırılmalıdır.
- İsteğe bağlı AI, SEO ve Telegram özellikleri için ilgili Supabase Edge Function'ları ve sırları gerekir.
- Gizli anahtarları GitHub'a veya kaynak dosyalara koymayın. Paket tarayıcıda kullanılabilen Supabase publishable anahtarını kullanır; service role anahtarı içermez.

Bu arşiv yerel otomatik testlerden ve sahte verili tarayıcı kontrollerinden geçti. Gerçek Cloudflare/Supabase hesabınız henüz bağlanıp doğrulanmadı. Canlı yayına geçerken adımları birlikte tek tek kontrol edebiliriz.
