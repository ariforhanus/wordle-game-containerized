# Wordle — Önceliklendirilmiş geliştirme ve production hazırlık listesi

Bu liste `fix/security-game-integrity` dalının mevcut kodu ve `VALIDATION.md` sonuçları esas alınarak güncellendi. `[x]` yalnızca uygulanmış ve yerelde doğrulanmış işi gösterir; production kurulumu veya başarılı uzak CI anlamına gelmez. Kısmen mevcut özelliklerin yeni kabul koşulları açık bırakıldı.

Önerilen geliştirme sırası: **süre adaleti → toplam puan sıralaması → dil bazlı streak → veri modeli/performans → günlük oyun UX/erişilebilirlik → yeni diller**. CI ve yayın güvenliği engelleri bu sıraya paralel çözülür ve production çıkışını engeller. Doğruluk, performans optimizasyonundan; mevcut dil kurallarının düzeltilmesi de yeni dil eklenmesinden önce gelir.

## P0.1 — Günlük oyun süresi ve adalet

Mevcut temel: oyun kaydı Start isteğinde sunucuda oluşturuluyor; skor süresi kalıcı `started_at` üzerinden hesaplanıyor. Ekran salt okunur durum sorgusuyla Start, Resume ve kayıtlı sonuç durumlarını ayırıyor. Aşağıdaki işler bu temeli koruyarak tamamlanacak.

- [x] Günlük oyun yalnızca açık Start eylemiyle başlasın; sayfayı açma, durum sorgulama veya dil değiştirme oyunu başlatmasın. Backend, frontend ve E2E testleriyle doğrula.
- [x] Oyun başladıktan sonra süre sekme/sayfa kapatılsa, cihaz değişse veya bağlantı kesilse bile işlemeye devam etsin; Resume `started_at` değerini yenilemesin. Mevcut sunucu tarafı süre hesabını koru ve regresyon testleri ekle.
- [x] Start ve Resume ekranlarını ayır; başlangıçtan sonra sürenin durmadığını Start öncesinde açıkla. Durum sorgusuyla mevcut oyunu bul; sorgu yeni oyun yaratmasın.
- [x] Eşzamanlı Start/Resume, farklı oturumlar/cihazlar, yinelenen istekler ve yanıt kaybında aynı oyun ve tek skor garantisini birlikte test et; mevcut satır kilidi ve idempotency kontrollerini koru.
- [x] Uygulama zaman diliminde gece yarısı geçişini test et: gece yarısından önce başlayan oyun, sonra gelen tahmin/retry, eski oyunun süresi ve sonraki günün oyunu. Tamamlama/kapanma politikasını açıkça belgele; puzzle günü, skor günü ve sıralama tutarlı olsun.

## P0.2 — CI ve production çıkış engelleri

Bu maddeler geliştirme sırasında izlenir; production çıkışı tamamı doğrulanana kadar yapılmaz.

- [ ] Açığa çıkmış canlı veritabanı, yönetici ve JWT kimlik bilgilerini yetkili production ortamında döndür; eski bilgilerin artık çalışmadığını doğrula.
- [ ] GitHub runner sorununu çöz ve backend/frontend/E2E/security işlerinin gerçekten çalışıp geçtiğini doğrula. Son gözlenen uzak koşu hiçbir adım başlamadan başarısız oldu.
- [ ] `.github/rulesets/main.json` kurallarını GitHub ayarlarında etkinleştir; PR incelemesi ve başarılı zorunlu kontroller olmadan main'e birleşmeyi engelle. Yönetim erişimi gerekir.
- [ ] Gerçek production verisinin yetkili bir kopyasıyla migration/preflight ve rollback provasını tamamla; eski kayıtları silmeden uyumsuzlukları gider.
- [ ] Alan adı, DNS ve HTTPS yapılandırmasını belirle ve doğrula.
- [ ] Release imajlarını staging'de doğrula; high/critical imaj taramaları, Compose/health/readiness, Nginx ve migration sonuçlarını kaydet.
- [ ] Production SMTP sağlayıcısı ve public URL'yi seç/yapılandır; gerçek sağlayıcıyla teslimat ve reset/doğrulama akışını doğrula. Sonra sıralı oyun için doğrulanmış e-posta şartını etkinleştir.
- [ ] Production backup/restore ve monitoring'i devreye al; şifreli ortam dışı yedek, alarm alıcısı/log hedefi ve ölçülmüş kurtarma hedefleriyle geri yükleme provasını tamamla.

## P1.1 — Leaderboard kuralları

Tamamlandı: günlük sonuçlar `played_at` gününe göre; hafta/ay sonuçları oyuncu+dil bazında SQL toplamı. Eşit toplamda son galibiyet zamanı, ardından kalıcı kullanıcı ID’si kullanılır. Yerel test kanıtları `VALIDATION.md` içinde.

- [x] Daily leaderboard her dil için yalnızca ilgili günün en yüksek oyun skorlarını göstersin; puzzle günü/`played_at` ile bitiş zamanı ayrımını P0 gece yarısı kuralına bağla.
- [x] Weekly leaderboard her oyuncunun ilgili dilde hafta boyunca topladığı puanı veritabanında `SUM(score)` ile hesaplasın; her oyuncu yalnızca bir kez görünsün.
- [x] Monthly leaderboard her oyuncunun ilgili dilde ay boyunca topladığı puanı veritabanında `SUM(score)` ile hesaplasın; her oyuncu yalnızca bir kez görünsün.
- [x] Dönemleri uygulama zaman diliminde tanımla: hafta pazartesi başlasın, ay ilk gün başlasın; yarı açık `[başlangıç, bitiş)` aralıkları ve gelecek tarihli kayıtların dışlanmasını test et.
- [x] Toplam puan tie-breaker kuralını kesinleştir ve API/UI'de belgele. Öneri: toplam puan azalan, toplama dahil son galibiyet zamanı artan, kalıcı kullanıcı ID'si artan; kayıpsız toplam veri tipi, eşit zaman ve sayfalama kararlılığı test edilsin. Günlük eşitliklerde de son anahtar olarak kalıcı ID kullan.
- [x] Kayıp/0 puanlı oyunlar, az maçlı oyuncular, bir oyuncunun çok günlük sonuçları, farklı diller, hafta/ay/yıl değişimi ve zaman dilimi sınırlarını backend testlerine ekle.
- [x] Frontend/API yanıtında günlük oyun skoru ile haftalık/aylık toplam puanı açıkça ayır; etiketleri ve dönem bilgisini çevir. Tek oyuncunun tek satır göründüğünü frontend ve E2E testleriyle doğrula.

## P1.2 — Dil bazlı streak

Tamamlandı: `played_at` tabanlı SQL streak hesabı dil bazında bağımsızdır. Bugün oynanmamışsa dün biten seri aktiftir; bugünkü kayıp yalnızca aynı dilin serisini sıfırlar. Profil ve oyun sonunda seçili dilin current/best bilgisi; sıralamada seçili dilin current streak’i gösterilir.

- [x] Her dil için ayrı current streak ve best streak hesapla; sabit iki dil varsayımı kullanma. Veritabanındaki `played_at` tarihini esas al, istemci saatine güvenme.
- [x] Bir dilde kaybetmek veya oynamamak yalnızca o dilin serisini etkilesin. Bugün henüz oynanmayan dilde dünün serisinin ne zamana kadar aktif kaldığını açıkça tanımla.
- [x] Aynı gün birden fazla dil, bir dilde galibiyet/diğerinde kayıp, gün atlama, eski kayıplar, gece yarısı ve boş geçmiş senaryolarını test et.
- [x] Profil, oyun sonu ve leaderboard'da seçili dilin current/best streak bilgisini kullan; API sözleşmesini ve çevirileri birlikte güncelle.
- [x] Backend hesaplarını frontend gösterimi ve dil değiştirme E2E testleriyle doğrula; geçmiş sonuçların doğru dil serisine katıldığını kontrol et.

## P1.3 — Veritabanı doğruluğu, tasarım ve performans

Doğruluk constraint'leri P0/P1 özellikleriyle birlikte teslim edilir; aşağıdaki ölçüm ve optimizasyonlar sorguların yeni biçimi netleştikten sonra yapılır.

- [x] `daily_games.guesses TEXT` modelini ayrı tahmin tablosu ve JSONB ile karşılaştır; en fazla altı tahmin, sıra/tekillik, atomiklik, kilitleme, sorgu ihtiyacı ve migration maliyetini belgeleyen karar kaydı yaz. Ölçüm/gerekçe olmadan model değiştirme.
- [x] Yeni daily/weekly/monthly sorgularını temsilî büyüklükte test verisiyle `EXPLAIN (ANALYZE, BUFFERS)` kullanarak ölç; veri hacmi, plan, buffer ve süre sonuçlarını kaydet. Production üzerinde izinsiz yük çalıştırma.
- [ ] Dil, `played_at`, oyuncu, kazanma filtresi ve aggregate sorguları için indeksleri değerlendir; önce/sonra planları, yazma maliyeti ve migration etkisini karşılaştır.
- [x] Profil/istatistik ve leaderboard streak sorgularında gereksiz tüm geçmişi uygulama belleğine yüklemeyi kaldır; SQL aggregate/projection veya gerekçelendirilmiş özet yaklaşımı kullan. Kaynak verinin doğruluğunu ve dil izolasyonunu koru.
- [x] `scores.username` tekrarını değerlendir: güncel profil adı mı tarihsel snapshot mı gösterileceğini belirle; kullanıcı adı değişimi, JOIN/denormalizasyon, silme ve eski veri tutarlılığı için karar/migration/test hazırla.
- [x] Kullanıcı+dil+gün tekilliği, tahmin sıra/limitleri, durum/skor ilişkisi ve referans bütünlüğü constraint'lerini denetle; yeni model gerekirse ileri migration ekle, uygulanmış migration'ları değiştirme.
- [x] Migration/preflight, eşzamanlı yazma, skor oluşturma rollback'i ve yinelenen istek testlerini yeni sorgu/model kuralları için tamamla; mevcut testleri koru.

V6 dönem indeksi ve sentetik önce/sonra okuma planları tamamlandı (`docs/performance/`); yazma maliyeti yük testi ve production büyüklüğünde migration provası açık. V7 ile tahmin biçimi/sayısı, durum ve tamamlanma zamanı constraint’leri eklendi; salt okunur preflight ve bozuk geçmişte atomik migration rollback’i test edildi. Skor çakışmasında oyun güncellemesi de geri alınıyor. Oyun/skor arasındaki anlamsal eşleşme uygulama transaction’ına dayanır; doğrudan SQL yazıcılarına karşı deferred ilişki henüz yok. Denetim ve sınırlar `docs/DAILY_GAME_CONSISTENCY.md` içinde. Production veri provası P0.2’de açık. TEXT/JSONB/tablo kararı `docs/GUESSES_STORAGE_DECISION.md`, kullanıcı adı kararı `docs/SCORE_IDENTITY_DECISION.md` içinde.

## P1.4 — Günlük oyun UX ve erişilebilirlik

- [x] Kullanıcı kararı: önceki günün yarım oyunu devam ettirilemesin; gün sınırında sunucu GET/tahmin için `410 game_expired` dönsün. Eski oyunlar için Resume seçicisi eklenmeyecek; bugünün oyunu açık Start gerektirir.
- [ ] Oyun sonunda seçili dilin istatistiklerini, tahmin dağılımını ve sunucunun gün/zaman dilimiyle uyumlu sonraki oyuna geri sayımı göster; gün değişiminde eski oyunu yanlışlıkla başlatma.
- [ ] Günlük ve serbest oyunun farkını açıkla: sıralama, günlük hak, süre ve çevrimdışı kullanım kuralları.
- [ ] Ağ hatasında yazılmış/iletilmiş tahminleri koru; retry sırasında çift tahmin oluşturma. Mevcut kayıp yanıt testine yazılmakta olan tahmin, offline/online geçişi ve yeniden bağlantı senaryolarını ekle.
- [ ] Mobil klavye/tahta, yatay ekran, yakınlaştırma ve odak davranışını doğrula; emülasyona ek fiziksel cihaz kontrolü yap.
- [ ] Reduced-motion tercihini uygula; sonuç/klavye durumları yalnızca renkle aktarılmasın. Ekran okuyucu duyuruları, klavye erişimi, kontrast ve renk körlüğü seçeneklerini iyileştir.
- [ ] Yeni Start/Resume, dönem toplamları, dil streak'i ve oyun sonu akışları için backend/frontend/E2E kabul testlerini tamamla; frontend kapsamını mevcut %22,20 satır / %24,22 dal kapsamını özellikle UI hata yollarında genişlet.
- [ ] Firefox'ta başarılı tarayıcı koşusu elde et; yerelde sayfa açılmadan context çöküyor. WebKit testini gerçek Safari/fiziksel cihaz doğrulaması yerine sayma; manuel yardımcı teknoloji testlerini tamamla.

Kısmi ilerleme: seçili dilin oyun sonu istatistikleri ve tahmin dağılımı tamamlandı; sonraki oyuna geri sayım henüz yok. Yeni dönem toplamı/dil geçişi testleri eklendi; frontend kapsamı %34,58 satır / %36,15 dal. Erişilebilirlik, ağ kesintisi ve fiziksel cihaz maddeleri açık.

## P2.1 — Yeni diller ve kelime rotasyonu

- [ ] Almanca, Fransızca ve İspanyolca desteğini dil kayıtları/API/UI üzerinden ekle; önce P1 dil izolasyonunu tamamla.
- [ ] Her dil için cevap ve geçerli tahmin sözlüklerini ayrı hazırla; kaynak, lisans, yeniden dağıtım hakkı ve attribution gereksinimlerini doğrula ve depoda belgele. Lisansı doğrulanmamış sözlük yayımlama.
- [ ] Dil bazlı harf kuralları, büyük/küçük harf dönüşümü, Unicode normalizasyonu, beş harf kuralı ve klavye düzenini tanımla; arayüz çevirilerini ve backend/frontend/E2E testlerini tamamla.
- [ ] Yakın tarihlerde aynı cevabı önleyen dil bazlı rotasyonu değerlendir; havuz yetersizliği, eşzamanlı puzzle oluşturma ve sürüm değişikliği davranışını belirle.
- [ ] Geçmiş günlük cevapların sözlük, algoritma veya uygulama güncellemesiyle değişmemesini garanti et; kalıcı puzzle kayıtları ve regression testleriyle doğrula. Rotasyon değişikliğinden önce bu garanti sağlansın.

## P2.2 — Hesap ve operasyonel dayanıklılık

Production'ı engelleyen uygulama/aktivasyon işleri P0.2'de; burası ek politika ve ölçek gereksinimleridir.

- [ ] Hesap silme ve veri saklama politikasını kullanıcıya açıkla: bağlı kayıtlar, anonimleşen audit kayıtları, yedeklerin saklama süresi ve geri yükleme sonrası silme taleplerinin tekrar uygulanması.
- [ ] Bot ve çoklu hesap suistimali için yarışma politikasını ve ek sinyalleri değerlendir; mevcut doğrulanmış e-posta/hesap-IP limitlerini koru. Güvenilir proxy/client-IP yapılandırmasını gerçek ingress için doğrula.
- [ ] SMTP teslimat gecikmesi, timing farkları, retry ve transaction etkileri için dayanıklı mail outbox ihtiyacını değerlendir; gerçek sağlayıcı arızalarını staging'de test et.
- [ ] Production büyüklüğünde staging kapasite testleri, yedek geri dönüş tatbikatı, alarm teslimatı ve release/rollback provalarını düzenli işlet. Yerel smoke testini kapasite garantisi olarak sunma.

## Tamamlanan temel çalışmalar — korunacak

- [x] Veritabanı preflight ve sürümlü migration altyapısı; eski veriyi silmeden hata provası.
- [x] CI backend/frontend/tarayıcı işleri, high/critical imaj/bağımlılık tarama tanımları ve main ruleset dosyası. Uzak başarılı koşu/ayar aktivasyonu hâlâ P0.2'de açık.
- [x] Kayıt, günlük oyun bitirme/retry/resume ve oturum iptalinin yerel doğrulaması.
- [x] Özel dosya izinleri, retention, checksum ve günlük servis içeren PostgreSQL yedekleme; izole gerçek geri yükleme provası.
- [x] Yedek/restore hata enjeksiyonu ve veritabanı oluşturmadan önce checksum doğrulaması.
- [x] Yapılandırılmış JSON loglar, iç Prometheus metrikleri ve erişilebilirlik/hata/gecikme alarm kuralları.
- [x] Transactional yönetici/hesap güvenliği audit kayıtları, 90 günlük temizlik; release/rollback ve secret rotation runbook'ları.
- [x] Tek kullanımlık, süreli, hash olarak saklanan doğrulama/reset token'ları ve sağlayıcıdan bağımsız SMTP.
- [x] İngilizce/Türkçe şifre değişimi, reset, e-posta doğrulama ve hesap güvenliği arayüzü.
- [x] Şifre değişimi/reset/logout-all ile eski oturumların iptali; PostgreSQL'de paylaşılan hesap/IP kimlik doğrulama limitleri.
- [x] Şifre onaylı hesap silme; oyun/skor/token temizliği ve audit kullanıcı referanslarının kaldırılması.
- [x] Sıralı oyuna isteğe bağlı doğrulanmış e-posta şartı; yerel SMTP capture ve tarayıcıyla reset/doğrulama akışı testleri.
- [x] Masaüstü/mobil Chromium kayıp yanıt, reload, çok sekme ve session revocation testleri; Türkçe oyun ve production Nginx/WebKit/worker testleri.
- [x] Transaction rollback, farklı eşzamanlı tahmin, JWT/CORS, SMTP timeout, token süre sınırı ve mevcut leaderboard tarih sınırı testleri.
- [x] Java/frontend coverage raporları; ölçülen kapsam ve ortam sınırları `VALIDATION.md` içinde kayıtlı.
- [x] Otomatik erişilebilirlik kontrolleri; login kontrastı, grid semantiği ve browser zoom düzeltmeleri.
- [x] Sınırlı yerel/staging yük smoke testi; eski frontend ve açık içeren PWA build zincirinin kaldırılması, yalnızca statik dosyalara çevrimdışı destek.

## Tamamlanan TODO raporları

### P0.1 / yalnızca Start ile başlama

2026-11-09: mevcut Start davranışı korundu; sayfa açma, dil değiştirme, reload/remount ve salt okunur durum isteklerinin oyun başlatmadığı üç katmanda test edildi. Backend testi, açık Start isteğine kadar puzzle/oyun/skor tablosunda kayıt oluşmadığını ve başlangıç zamanının sunucunun Start anı olduğunu doğruluyor. Frontend testi tıklamadan önce API çağrısı yapılmadığını; gerçek tarayıcı testi dil değişimi/reload sonrası da başlangıç POST isteği gönderilmediğini doğruluyor.

Doğrulama sırasında bulunan tahta animasyonu zamanlayıcı sızıntısı giderildi; normal animasyon ve unmount temizliği için iki test eklendi. Tam backend suite: **63 geçti**; frontend suite: **11 geçti**; build edilmiş worker: **8 geçti**; production Nginx masaüstü/mobil Chromium hedefli E2E: **4 geçti**. TypeScript/production build ve `git diff --check` geçti. Bu tur uzak CI'nin geçtiğini veya bütün tarayıcıların tekrar çalıştırıldığını göstermez; ayrıntılar `VALIDATION.md` içinde.

### P0.1 / kapalı sayfa ve Resume süresi

2026-11-09: mevcut sunucu süre hesabı değiştirilmeden ikinci TODO doğrulandı. İngilizce ve Türkçe PostgreSQL testleri, oyun isteği olmadan ilerleyen sunucu saati sonrası yeni oturum token'ıyla üç Resume isteğinin aynı oyun/başlangıç zamanını koruduğunu doğruluyor. Tamamlama süresi ve veritabanındaki `duration_ms` bağlantısız dönemi içeriyor; bitmiş oyuna dönüş süreyi değiştirmiyor ve ikinci skor oluşturmuyor.

Frontend testleri, unmount sırasında yerel interval'in temizlendiğini, yeniden açıldığında güncel sunucu `elapsedMs` değerinden devam edildiğini ve bitmiş oyun süresinin sabit kaldığını doğruluyor. E2E testi sayfayı kapatıp ilk tarayıcı bağlamını offline yapıyor; gerçek bekleme aralığından sonra kimlik bilgileri taşınmış yeni bir bağlamda aynı oyuna devam edildiğini ve sunucu süresinin arttığını kontrol ediyor. Bu yeni bağlam fiziksel cihaz testi yerine sayılmaz.

Son koşu: **65 backend**, **13 frontend**, **8 build edilmiş worker** ve production Nginx üzerinde **4 masaüstü/mobil Chromium E2E** testi geçti; TypeScript/production build ve `git diff --check` geçti. Bu tur uygulama davranışı veya migration değiştirilmedi; testler ve dokümantasyon eklendi. Uzak CI başarısı, Firefox ve fiziksel cihaz kontrolleri açık kalıyor.

### P0.1 / ayrı Start ve Resume ekranları

2026-11-09: `GET /api/v1/daily/games?lang=...` salt okunur durum sorgusu eklendi. Yeni oyun Start ile POST edilir; mevcut oyun Resume ile GET üzerinden açılır; tamamlanmış oyunda kayıtlı sonuç görüntülenir. Eski skor kaydı olup oyunu olmayan kullanıcı yeniden başlatamaz. İngilizce/Türkçe ekranlar süre kuralını butondan önce açıklar; Resume süreyi sıfırlamaz. Yükleme sırasında başlangıç kapalıdır; sorgu hatası yalnızca kontrolü tekrar denemeyi sunar. Geç gelen eski dil yanıtları yok sayılır. Aktif oyun dışındaki klavye dinleyicisi kaldırılarak butonların doğal Enter davranışı korundu.

Son doğrulama: **68 backend**, **17 frontend**, **8 build edilmiş worker**, **22 farklı masaüstü/mobil Chromium E2E** ve **4 seçili WebKit E2E** senaryosu geçti. E2E sonuçları bölünmüş koşulardan tekil senaryo sayılarıdır; tekrar koşuları ayrıca sayılmadı. Türkçe uyarı ve Resume metni son build üzerinden tekrar doğrulandı. Ağ hatası enjekte eden testte WebKit interception sınırı nedeniyle yalnızca o senaryoda service worker engellenir; gerçek Start/Resume, sonuç ve offline testleri worker açıkken çalışır. İlk ortam açılışı disk dolması nedeniyle başarısız oldu; eski test JAR/önbellekleri temizlenip ortam yeniden kurulduktan sonraki sonuçlar esas alındı.

Backend önce, frontend sonra yayımlanmalı; API sözleşmesi ve dağıtım sırası `OPERATIONS.md` içinde. Migration gerekmedi; sunucunun süre/skor hesabı değişmedi. Uzak CI'nin başarıyla çalışması, Firefox ve fiziksel cihaz doğrulamaları hâlâ açık.

### P0.1 / eşzamanlı oturum ve tekrar istekleri

2026-11-09: mevcut PostgreSQL tekillik/satır kilidi davranışı üretim kodu değiştirilmeden genişletilmiş kabul testleriyle doğrulandı. İngilizce/Türkçe testleri farklı JWT oturumlarının önce aynı `not_started` durumunu görmesini, dört eşzamanlı Start'ın aynı kaydı döndürmesini ve ardından karışık Start/Resume/durum okumalarının başlangıç zamanını değiştirmemesini kontrol ediyor. Farklı eşzamanlı tahminlerde bir istek kabul ediliyor, diğeri 409 alıyor; retry kabul edilmiş tahmini değiştiremiyor.

Galibiyet ve kayıp son hamleleri için gerçek bir PostgreSQL transaction'ı oyun satırını kilitli tutuyor. `pg_stat_activity` üzerinden iki HTTP hamlesinin gerçekten kilitte beklediği görülmeden kilit bırakılmıyor. Beklerken Resume tamamlanmamış tutarlı durumu okuyor; kilit açıldıktan sonra aynı hamleye iki yanıt ve sonradan yapılan replay aynı bitmiş sonucu veriyor. Tek skor, sabit `duration_ms`/puan ve değişmeyen `started_at` kontrol ediliyor.

Frontend'e bekleyen Start/tahminde çift gönderimi engelleme ve yanıtı kaybolan Start'ı yeniden deneme testleri eklendi. E2E testleri ayrı tarayıcı bağlamı ve yeni girişle eşzamanlı Start, commit edilmiş Start yanıtının kaybı, iki oturumdan yinelenen hamleler ve commit edilmiş son yanıtın kaybından kurtulmayı doğruluyor; kullanıcı istatistiği tek oyun gösteriyor.

Son koşu: **76 backend**, **20 frontend**, **8 build edilmiş worker** ve **6 hedefli E2E** (masaüstü Chromium, mobil Chromium ve WebKit'te ikişer senaryo) geçti. Production build ve `git diff --check` geçti. Hata enjekte eden E2E bağlamlarında mevcut interception kuralı gereği worker kapalı; worker/offline davranışı ayrı testlerde korunuyor. Frontend satır kapsamı **%21,80**, dal kapsamı **%22,44**; geniş kapsam ihtiyacı açık. Bu tur migration/üretim mantığı değiştirilmedi; yük kapasitesi veya tüm tarayıcı senaryolarının tekrar doğrulandığı iddia edilmiyor.

### P0.1 / gece yarısı ve skor günü

Tarihsel not — aşağıdaki politika 2026-11-10 kullanıcı kararıyla kaldırıldı. 2026-11-09: eski oyunun gece yarısından sonra tamamlanabilmesi korundu; süre ilk Start'tan devam ediyor ve skor eski puzzle'ın `played_at` gününe yazılıyor. Yeni gün ayrı, açık Start istiyor. Start'ın günü ve başlangıç anı artık tek sunucu saat okumasından geliyor; veritabanında beklerken gece yarısını geçmek günü değiştirmiyor.

Bulunan tutarsızlık giderildi: daily/weekly/monthly dönem sorguları bitiş zamanı `won_at` yerine puzzle günü `played_at` üzerinden seçiyor. Haftalık/aylık SUM sıralaması henüz yapılmadı. Durum API'si gün/zaman dilimini veriyor; frontend tarihi gösteriyor ve Start'a beklenen günü ekliyor. Eski ekranın günü geçmişse sunucu kayıt oluşturmadan `409 day_changed` dönüyor; ekran tarihi yenileyip tekrar tıklama istiyor. Metadata vermeyen eski backend yanıtında başlangıç kapalı kalıyor. Süre göstergesi cihaz duvar saati yerine monoton saat kullanıyor.

**85 backend**, **23 frontend**, **8 build edilmiş worker**, **12 masaüstü/mobil Chromium + 4 seçili WebKit E2E** senaryosu geçti; yeni iki E2E senaryosu son build'de üç projede yeniden doğrulandı (tekrarlar sayılmadı). Backend testleri 1 ms sınırı, İngilizce/Türkçe, galibiyet/kayıp, hafta/ay/yıl geçişi, retry ve kilit bekleyerek gece yarısını geçen Start'ı kapsıyor. E2E, eski durum tarihini simüle edip gerçek backend'in reddini doğruluyor; sunucu saatini production test endpoint'iyle değiştirmiyor. Bu tur E2E sunumu disk sınırı nedeniyle production build üzerinde Vite Preview ile yapıldı; Nginx yeniden doğrulandı iddiası yok.

Politika, uyumlu eski istemci davranışı, deploy sırası ve sınırlar `OPERATIONS.md` içinde. Bilinen eski oyun ID'siyle bitirme mümkün; geçmiş yarım oyun seçicisi P1 UX takibine eklendi. Schema/veri migration'ı yapılmadı; yeni tarih sorgusu için temsilî EXPLAIN/indeks çalışması P1.3'te açık.

P0.1'in beş kabul maddesi tamamlandı. Sıradaki geliştirme TODO'su: P1.1 günlük leaderboard kabul kuralını mevcut davranış ve yeni tarih seçimiyle doğrulamak; ardından haftalık/aylık SUM sıralamasına geçmek. P0.2 CI/production engelleri, Firefox ve fiziksel cihaz doğrulamaları ayrıca açık.

## Ara görev — zaman kaynağı ve test fixture kalitesi

- [x] Kullanıcı önceliğiyle sabit tarih/saat kullanımlarını incele; gerçek sistem saatini doğrudan kullanan iş akışlarını ortak `Clock`'a geçir, test fixture'larını kapsülle ve doğrula.

2026-11-09: örnek gösterilen sabit tarihlerin testlere ait olduğu doğrulandı; üretimde sabit takvim tarihi bulunmadı. Testleri gerçek bugüne bağlamak yerine tekrar eden takvim değerleri isimli fixture'lara taşındı. Ortak `MutableClock`/`TestClockConfiguration`, başka test sınıfının iç tipine bağımlılığı ve açık `clock.now` erişimini kaldırıyor; canlı `withZone` görünümü, atomik advance ve DST davranışı test edildi. Fixture referansı çalışma gününden bağımsız, bilinen bir pazartesi/leap-year tarihi; gece yarısı, hafta/ay/yıl ve artık gün sınırları ondan türetiliyor.

Gerçek düzeltmeler: günlük kelime servisi ve admin dashboard artık enjekte edilen uygulama saatini kullanıyor; kayıt/bootstrap kullanıcı oluşturma zamanını açıkça bu saatten atıyor. Entity'lerde örtük sistem saati/tarih varsayımları, kullanılmayan eski Score kurucusu ve ScoreService'in gizli gerçek saat oluşturan test kolaylık kurucusu kaldırıldı. Frontend fixture günleri de tek referanstan türetildi; eski ekran testinin mock sonucu yeni istenen günle tutarlı hale getirildi.

**95 backend**, **23 frontend**, **8 build edilmiş worker** ve production build/Vite Preview üzerinde **12 masaüstü/mobil E2E** senaryosu geçti. Test saat/config/fixture sınıflarının production JAR'ında olmadığı ayrıca kontrol edildi. Schema/veri migration'ı yapılmadı. Nginx/WebKit/Firefox bu ara görevde yeniden doğrulanmadı; CI/production engelleri açık. Leaderboard TODO'ları bu ara görev nedeniyle tamamlandı işaretlenmedi.

## Ara görev — yerel test için env hazırlığı

- [x] Yerel Compose için eksik zorunlu env değerlerini oluştur ve farklı bilgisayarda aynı kurulumu güvenli biçimde yeniden üretilebilir yap.

2026-11-09: workspace `.env` dosyası rastgele, birbirinden bağımsız DB/JWT/admin değerleriyle oluşturuldu; Git dışında ve 0600 izinli. `node deploy/setup-local-env.mjs` kullanıcının kendi checkout'unda farklı değerlerle dosya oluşturuyor; mevcut dosyayı değiştirmiyor ve parolaları çıktıya yazmıyor. Admin `localadmin`; parola `.env` içindeki `ADMIN_PASSWORD`. Node 22+ ve Docker Compose ile açılış komutları `OPERATIONS.md` başında.

4 kurulum testi, üç Compose yapılandırma doğrulaması (ana/operations/production) ve diff/ignore/izin kontrolleri geçti. Gerçek SMTP olmadan mail kapalı, verified-email şartı kapalı. Bu dosya yalnızca yerel test içindir; mevcut DB volume'unun parolası env değiştirerek dönmez. Full Docker build/start disk sınırı nedeniyle yapılmadı; production secret rotation/SMTP/CI işleri tamamlandı sayılmadı. Leaderboard geliştirmesi sırada kalıyor.

## Mühendislik kuralları

- Her uygulama turunda sıradaki tek TODO maddesini ele al; tamamlanan işi, ilgili değişiklikleri, çalıştırılan testleri ve açık riskleri raporla. Bağımlı hata düzeltmelerini ayrıca belirt; sonraki TODO'yu bitmiş sayma.

- Zamana bağlı iş kuralları için constructor ile `Clock` enjekte et; gerçek saatin Java fabrikası production `ClockConfig` olsun. Entity'lere örtük `now()`/varsayılan makine zaman dilimi ekleme; zamanı uygulama katmanında açıkça ata.
- Testte `Clock.fixed` veya test destek `MutableClock` kullan; sabit sınır tarihleri geçerli fixture'lardır. Tekrarlanan tarihleri isimlendir/türet, testleri makinenin bugünkü tarihine bağlama ve test saatini production'a taşıma. İş süresi/süre aşımı birim testlerinde uyumak yerine saati ilerlet; gerçek ağ/veritabanı senkronizasyon beklemelerini sınırla.
- Mevcut işlevleri koru; uygulamadan önce ilgili kodu, API sözleşmelerini ve testleri incele.
- Doğruluğu veritabanı constraint/transaction'larıyla koru; süre, skor, dönem ve streak hesaplarını sunucu belirlesin.
- Her davranış değişikliğine uygun backend, frontend ve E2E testlerini ekle; mevcut yeşil testleri kaldırarak geçiş sağlama.
- Değişiklikleri, veri modeli kararlarını, migration etkilerini ve çözülmemiş riskleri belgele; planlanan işi tamamlanmış işaretleme.
- Main'e otomatik merge yapma. Mikroservis geçişi kapsam dışı.
- Production secret/data/deployment, koruma ayarları ve dış servis aktivasyonu bu TODO güncellemesinin parçası değildir; mevcut yetki kapsamına göre ayrıca yürütülür.
