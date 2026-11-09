# Wordle — Önceliklendirilmiş geliştirme ve production hazırlık listesi

Bu liste `fix/security-game-integrity` dalının mevcut kodu ve `VALIDATION.md` sonuçları esas alınarak güncellendi. `[x]` yalnızca uygulanmış ve yerelde doğrulanmış işi gösterir; production kurulumu veya başarılı uzak CI anlamına gelmez. Kısmen mevcut özelliklerin yeni kabul koşulları açık bırakıldı.

Önerilen geliştirme sırası: **süre adaleti → toplam puan sıralaması → dil bazlı streak → veri modeli/performans → günlük oyun UX/erişilebilirlik → yeni diller**. CI ve yayın güvenliği engelleri bu sıraya paralel çözülür ve production çıkışını engeller. Doğruluk, performans optimizasyonundan; mevcut dil kurallarının düzeltilmesi de yeni dil eklenmesinden önce gelir.

## P0.1 — Günlük oyun süresi ve adalet

Mevcut temel: oyun kaydı Start isteğinde sunucuda oluşturuluyor; skor süresi kalıcı `started_at` üzerinden hesaplanıyor. Ekranda Start/Resume ortak buton kullanılıyor. Aşağıdaki işler bu temeli koruyarak tamamlanacak.

- [x] Günlük oyun yalnızca açık Start eylemiyle başlasın; sayfayı açma, durum sorgulama veya dil değiştirme oyunu başlatmasın. Backend, frontend ve E2E testleriyle doğrula.
- [ ] Oyun başladıktan sonra süre sekme/sayfa kapatılsa, cihaz değişse veya bağlantı kesilse bile işlemeye devam etsin; Resume `started_at` değerini yenilemesin. Mevcut sunucu tarafı süre hesabını koru ve regresyon testleri ekle.
- [ ] Start ve Resume ekranlarını ayır; başlangıçtan sonra sürenin durmadığını Start öncesinde açıkla. Durum sorgusuyla mevcut oyunu bul; sorgu yeni oyun yaratmasın.
- [ ] Eşzamanlı Start/Resume, farklı oturumlar/cihazlar, yinelenen istekler ve yanıt kaybında aynı oyun ve tek skor garantisini birlikte test et; mevcut satır kilidi ve idempotency kontrollerini koru.
- [ ] Uygulama zaman diliminde gece yarısı geçişini test et: gece yarısından önce başlayan oyun, sonra gelen tahmin/retry, eski oyunun süresi ve sonraki günün oyunu. Tamamlama/kapanma politikasını açıkça belgele; puzzle günü, skor günü ve sıralama tutarlı olsun.

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

Mevcut `weeklyTop` ve `monthlyTop`, günlük sıralamayla aynı tekil skor sorgusunu kullanıyor; toplam puan sıralaması henüz uygulanmadı. Sınır testleri mevcut davranışı doğruluyor, yeni SUM kurallarını değil.

- [ ] Daily leaderboard her dil için yalnızca ilgili günün en yüksek oyun skorlarını göstersin; puzzle günü/`played_at` ile bitiş zamanı ayrımını P0 gece yarısı kuralına bağla.
- [ ] Weekly leaderboard her oyuncunun ilgili dilde hafta boyunca topladığı puanı veritabanında `SUM(score)` ile hesaplasın; her oyuncu yalnızca bir kez görünsün.
- [ ] Monthly leaderboard her oyuncunun ilgili dilde ay boyunca topladığı puanı veritabanında `SUM(score)` ile hesaplasın; her oyuncu yalnızca bir kez görünsün.
- [ ] Dönemleri uygulama zaman diliminde tanımla: hafta pazartesi başlasın, ay ilk gün başlasın; yarı açık `[başlangıç, bitiş)` aralıkları ve gelecek tarihli kayıtların dışlanmasını test et.
- [ ] Toplam puan tie-breaker kuralını kesinleştir ve API/UI'de belgele. Öneri: toplam puan azalan, toplama dahil son galibiyet zamanı artan, kalıcı kullanıcı ID'si artan; kayıpsız toplam veri tipi, eşit zaman ve sayfalama kararlılığı test edilsin. Günlük eşitliklerde de son anahtar olarak kalıcı ID kullan.
- [ ] Kayıp/0 puanlı oyunlar, az maçlı oyuncular, bir oyuncunun çok günlük sonuçları, farklı diller, hafta/ay/yıl değişimi ve zaman dilimi sınırlarını backend testlerine ekle.
- [ ] Frontend/API yanıtında günlük oyun skoru ile haftalık/aylık toplam puanı açıkça ayır; etiketleri ve dönem bilgisini çevir. Tek oyuncunun tek satır göründüğünü frontend ve E2E testleriyle doğrula.

## P1.2 — Dil bazlı streak

Mevcut profil istatistikleri ve sıralama streak hesapları dilleri birlikte ele alıyor. İngilizce/Türkçe bağımsızlığı ve gelecekteki diller için genellenmiş hesap gerekiyor.

- [ ] Her dil için ayrı current streak ve best streak hesapla; sabit iki dil varsayımı kullanma. Veritabanındaki `played_at` tarihini esas al, istemci saatine güvenme.
- [ ] Bir dilde kaybetmek veya oynamamak yalnızca o dilin serisini etkilesin. Bugün henüz oynanmayan dilde dünün serisinin ne zamana kadar aktif kaldığını açıkça tanımla.
- [ ] Aynı gün birden fazla dil, bir dilde galibiyet/diğerinde kayıp, gün atlama, eski kayıplar, gece yarısı ve boş geçmiş senaryolarını test et.
- [ ] Profil, oyun sonu ve leaderboard'da seçili dilin current/best streak bilgisini kullan; API sözleşmesini ve çevirileri birlikte güncelle.
- [ ] Backend hesaplarını frontend gösterimi ve dil değiştirme E2E testleriyle doğrula; geçmiş sonuçların doğru dil serisine katıldığını kontrol et.

## P1.3 — Veritabanı doğruluğu, tasarım ve performans

Doğruluk constraint'leri P0/P1 özellikleriyle birlikte teslim edilir; aşağıdaki ölçüm ve optimizasyonlar sorguların yeni biçimi netleştikten sonra yapılır.

- [ ] `daily_games.guesses TEXT` modelini ayrı tahmin tablosu ve JSONB ile karşılaştır; en fazla altı tahmin, sıra/tekillik, atomiklik, kilitleme, sorgu ihtiyacı ve migration maliyetini belgeleyen karar kaydı yaz. Ölçüm/gerekçe olmadan model değiştirme.
- [ ] Yeni daily/weekly/monthly sorgularını temsilî büyüklükte test verisiyle `EXPLAIN (ANALYZE, BUFFERS)` kullanarak ölç; veri hacmi, plan, buffer ve süre sonuçlarını kaydet. Production üzerinde izinsiz yük çalıştırma.
- [ ] Dil, `played_at`, oyuncu, kazanma filtresi ve aggregate sorguları için indeksleri değerlendir; önce/sonra planları, yazma maliyeti ve migration etkisini karşılaştır.
- [ ] Profil/istatistik ve leaderboard streak sorgularında gereksiz tüm geçmişi uygulama belleğine yüklemeyi kaldır; SQL aggregate/projection veya gerekçelendirilmiş özet yaklaşımı kullan. Kaynak verinin doğruluğunu ve dil izolasyonunu koru.
- [ ] `scores.username` tekrarını değerlendir: güncel profil adı mı tarihsel snapshot mı gösterileceğini belirle; kullanıcı adı değişimi, JOIN/denormalizasyon, silme ve eski veri tutarlılığı için karar/migration/test hazırla.
- [ ] Kullanıcı+dil+gün tekilliği, tahmin sıra/limitleri, durum/skor ilişkisi ve referans bütünlüğü constraint'lerini denetle; yeni model gerekirse ileri migration ekle, uygulanmış migration'ları değiştirme.
- [ ] Migration/preflight, eşzamanlı yazma, skor oluşturma rollback'i ve yinelenen istek testlerini yeni sorgu/model kuralları için tamamla; mevcut testleri koru.

## P1.4 — Günlük oyun UX ve erişilebilirlik

- [ ] Oyun sonunda seçili dilin istatistiklerini, tahmin dağılımını ve sunucunun gün/zaman dilimiyle uyumlu sonraki oyuna geri sayımı göster; gün değişiminde eski oyunu yanlışlıkla başlatma.
- [ ] Günlük ve serbest oyunun farkını açıkla: sıralama, günlük hak, süre ve çevrimdışı kullanım kuralları.
- [ ] Ağ hatasında yazılmış/iletilmiş tahminleri koru; retry sırasında çift tahmin oluşturma. Mevcut kayıp yanıt testine yazılmakta olan tahmin, offline/online geçişi ve yeniden bağlantı senaryolarını ekle.
- [ ] Mobil klavye/tahta, yatay ekran, yakınlaştırma ve odak davranışını doğrula; emülasyona ek fiziksel cihaz kontrolü yap.
- [ ] Reduced-motion tercihini uygula; sonuç/klavye durumları yalnızca renkle aktarılmasın. Ekran okuyucu duyuruları, klavye erişimi, kontrast ve renk körlüğü seçeneklerini iyileştir.
- [ ] Yeni Start/Resume, dönem toplamları, dil streak'i ve oyun sonu akışları için backend/frontend/E2E kabul testlerini tamamla; frontend kapsamını mevcut %17,27 satır baz çizgisinin ötesine çıkar.
- [ ] Firefox'ta başarılı tarayıcı koşusu elde et; yerelde sayfa açılmadan context çöküyor. WebKit testini gerçek Safari/fiziksel cihaz doğrulaması yerine sayma; manuel yardımcı teknoloji testlerini tamamla.

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

## Son tamamlanan TODO — P0.1 / yalnızca Start ile başlama

2026-11-09: mevcut Start davranışı korundu; sayfa açma, dil değiştirme, reload/remount ve salt okunur durum isteklerinin oyun başlatmadığı üç katmanda test edildi. Backend testi, açık Start isteğine kadar puzzle/oyun/skor tablosunda kayıt oluşmadığını ve başlangıç zamanının sunucunun Start anı olduğunu doğruluyor. Frontend testi tıklamadan önce API çağrısı yapılmadığını; gerçek tarayıcı testi dil değişimi/reload sonrası da başlangıç POST isteği gönderilmediğini doğruluyor.

Doğrulama sırasında bulunan tahta animasyonu zamanlayıcı sızıntısı giderildi; normal animasyon ve unmount temizliği için iki test eklendi. Tam backend suite: **63 geçti**; frontend suite: **11 geçti**; build edilmiş worker: **8 geçti**; production Nginx masaüstü/mobil Chromium hedefli E2E: **4 geçti**. TypeScript/production build ve `git diff --check` geçti. Bu tur uzak CI'nin geçtiğini veya bütün tarayıcıların tekrar çalıştırıldığını göstermez; ayrıntılar `VALIDATION.md` içinde.

Sıradaki tek TODO: sayfa kapatma/cihaz değiştirme sonrası sürenin devam etmesi ve Resume'un `started_at` değerini yenilememesi. Start/Resume ekran ayrımı ve gece yarısı politikası henüz tamamlanmadı.

## Mühendislik kuralları

- Her uygulama turunda sıradaki tek TODO maddesini ele al; tamamlanan işi, ilgili değişiklikleri, çalıştırılan testleri ve açık riskleri raporla. Bağımlı hata düzeltmelerini ayrıca belirt; sonraki TODO'yu bitmiş sayma.

- Mevcut işlevleri koru; uygulamadan önce ilgili kodu, API sözleşmelerini ve testleri incele.
- Doğruluğu veritabanı constraint/transaction'larıyla koru; süre, skor, dönem ve streak hesaplarını sunucu belirlesin.
- Her davranış değişikliğine uygun backend, frontend ve E2E testlerini ekle; mevcut yeşil testleri kaldırarak geçiş sağlama.
- Değişiklikleri, veri modeli kararlarını, migration etkilerini ve çözülmemiş riskleri belgele; planlanan işi tamamlanmış işaretleme.
- Main'e otomatik merge yapma. Mikroservis geçişi kapsam dışı.
- Production secret/data/deployment, koruma ayarları ve dış servis aktivasyonu bu TODO güncellemesinin parçası değildir; mevcut yetki kapsamına göre ayrıca yürütülür.
