<p align="right"><a href="README.md">English</a> · <strong>Türkçe</strong></p>

# SpeeVid

Herhangi bir sitede video oynatma hızını kontrol etmenizi sağlayan bir tarayıcı uzantısı (Chrome ve Firefox).

## Özellikler

- Her sitedeki HTML5 videolarında çalışır, 0.25x-16x arası.
- Video üzerinde beliren yüzen hız kontrolü — konumu (4 köşeden biri) ayarlanabilir, isteğe bağlı otomatik gizleme modu var (hareketsizlikte kaybolur, herhangi bir hız değişiminde tekrar belirir).
- Klavye kısayolları: varsayılan olarak `S` hızlandır, `D` yavaşlat, `A` sıfırla (1x), `Q` özel hıza atla — ayarlar ekranından yeniden atanabilir. Özel hızın kendisi de (0.25x-16x arası) ayarlardan değiştirilebilir. Reset ya da özel hız tuşuna zaten o hızdayken tekrar basmak, bir önceki hıza geri döner.
- Popup arayüzü 13 dilde kullanılabilir (varsayılan: İngilizce), ayarlar ekranındaki dil seçiciden değiştirilir.
- Her site için son kullanılan hızı hatırlar. Ayrıca bir siteye kasıtlı bir varsayılan hız da sabitleyebilirsiniz ("son kullanılan"dan farklı olarak, her sayfa yüklemesinde önce bu uygulanır); "Tüm sekmelere uygula" açıksa ikisinin de önüne geçip tek bir hız tüm açık sekmelerde anlık senkronize edilir.
- Toolbar ikonunda güncel hızı rozet olarak gösterir (1x'te rozet gizlenir).
- Site bazında tamamen devre dışı bırakılabilir — popup'taki hızlı anahtardan veya ayarlardaki yönetilebilir site listesinden.
- Tüm ayarlar, kısayollar, hatırlanan hızlar ve sabitlenmiş hızlar bir JSON dosyasına yedeklenip başka bir cihaza geri yüklenebilir (ayarlar ekranı). Geri yüklenen dosya gerçek bir SpeeVid yedeği olmalı — başka bir dosya seçilirse ayarlarınızı sessizce silmek yerine reddedilir.
- Açık/koyu sistem temasına otomatik uyum.
- SpeeVid kurulduğunda/güncellendiğinde zaten açık olan bir sekmede, popup "sayfa desteklenmiyor" demek yerine tek tıkla yenileme seçeneği sunar.
- Mağaza listelemesi (ad ve açıklama) desteklenen 13 dilin tamamında yerelleştirilmiştir.
- Hızlandırılmışken ses perdesini korur (footer'daki anahtar) — perdeyi kasıtlı kapatan sitelerde bile "sincap sesi" olmaz.
- Sadece normal DOM'u değil, açık shadow root'ların içindeki videoları da bulur — oynatıcısı bir web component olan siteler için gerekli.
- Devre dışı site listesi `*.example.com` joker karakterli girişleri destekler; tek kayıt hem ana domaini hem tüm alt domainleri kapsar.
- İsteğe bağlı "kazanılan zaman" sayacı (ayarlar ekranı), 1x'ten hızlı izleyerek ne kadar gerçek zaman kazandığını takip eder, sıfırlama düğmesiyle birlikte.
- İsteğe bağlı "agresif hız kilidi" (varsayılan kapalı, ayarlar ekranı) — kendi oynatıcısı hızı sürekli geri çeken siteler için (bazı kurs/LMS platformları); her seferinde tekrar savaşmak yerine seçilen hızı sayfa seviyesinde zorlar.
- Tema kişiselleştirilebilir: Otomatik (tarayıcı/işletim sistemine uyar), Açık veya Koyu; ayrıca tamamen özel bir vurgu rengi (birkaç hazır seçenek veya renk seçiciden istediğin renk) — hem popup'ta hem video üzerindeki yüzen kontrolde uygulanır.

## Kişiselleştirme

Popup'ın ayarlar ekranı, SpeeVid'i sabit bir varsayılan yerine kendine göre görünüp davranacak şekilde ayarlamana izin verir:

- **Tema** — Otomatik/Açık/Koyu, tarayıcının geri kalanının ayarından bağımsız.
- **Vurgu rengi** — hazır seçeneklerden birini seç ya da istediğin özel bir rengi seç; mordan yerine her yerde (popup ve video üzerindeki kontrol) bu renk kullanılır.
- **Kontrolün konumu ve otomatik gizleme**, **klavye kısayolları** (tamamen yeniden atanabilir), **özel hız değeri**, **site bazlı hız sabitleme ve devre dışı bırakma** (`*.example.com` joker karakterleriyle) zaten aynı ayarlar ekranından değiştirilebiliyor.

## Kurulum (geliştirici modu)

**Chrome**

1. Chrome'da `chrome://extensions` adresine gidin.
2. Sağ üstten "Geliştirici modu"nu açın.
3. "Paketlenmemiş öğe yükle" butonuna tıklayın ve bu proje klasörünü seçin.

**Firefox**

1. `npm run build:firefox` komutunu çalıştırın (Firefox'a hazır bir kopyayı `dist/firefox/` altına yazar).
2. Firefox'ta `about:debugging#/runtime/this-firefox` adresine gidin.
3. "Geçici Eklenti Yükle"ye tıklayıp `dist/firefox/manifest.json` dosyasını seçin.

Firefox geçici eklentileri sadece o oturum için yükler — tarayıcıyı yeniden başlattığınızda 3. adımı tekrarlamanız gerekir. İki build'in nasıl senkron tutulduğu için aşağıdaki [Tarayıcılar arası destek](#tarayıcılar-arası-destek) bölümüne bakın.

## Geliştirme

Paylaşılan mantık `src/shared/` altında, saf JS fonksiyonları olarak yazılmıştır ve `node --test` ile test edilir:

```
npm test
```

İkonları yeniden üretmek için (Windows, PowerShell):

```
powershell -ExecutionPolicy Bypass -File tools/generate-icons.ps1
```

## Tarayıcılar arası destek

`src/` ve `icons/` Chrome ve Firefox arasında aynı şekilde paylaşılır — sadece manifest farklıdır (Chrome bir `service_worker` background kullanır; Firefox'un MV3 service worker desteği hâlâ tutarsız olduğu için Firefox düz bir `background.scripts` listesi kullanır). `manifest.json` Chrome'a, `manifest.firefox.json` Firefox'a ait; `npm run build:firefox` bu ikisinden ve paylaşılan kaynaktan `dist/firefox/` klasörünü oluşturur — ayrı bir branch yok, mantık tekrarı yok. `test/manifest.test.js`, iki manifest dosyasından biri değiştiğinde ikisinin senkron kalıp kalmadığını (aynı content script'ler, ikonlar, izinler) kontrol eder.
