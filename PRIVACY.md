<p align="right"><strong>English</strong> · <a href="#gizlilik-politikası">Türkçe</a></p>

# Privacy Policy

**SpeeVid does not collect, transmit, sell or share any data.** The extension makes no network requests of its own, has no analytics or telemetry, and has no server.

## What is stored, and where

Everything below is stored by your browser through the standard extension storage API, and never leaves it except as described:

- **Settings** (theme, shortcuts, overlay position, language, disabled sites, ...) — `storage.sync`. If you are signed in to a browser account with sync turned on, your *browser* may sync these between your own devices, under that browser's own privacy policy. SpeeVid never sees or sends them anywhere.
- **Per-site speeds** (last used speed, pinned speeds), the shared "apply to all tabs" speed, and the optional **time saved** counter — `storage.local`, on this device only.
- **Exported backups** are files you create yourself; SpeeVid does not upload them.

## What the extension reads

- It runs on every page you open so it can find `<video>` (and, if you enable it, `<audio>`) elements and change their playback speed. It does not read, record or store page content, the media itself, URLs or browsing history. The current site's **hostname** is used only as a key for that site's remembered speed and disabled/pinned lists, locally.
- Keyboard shortcuts are only matched against the keys you configured; typed text is never recorded, and shortcuts are ignored while you type in an input field.

## Permissions

- `storage` — keep your settings and per-site speeds.
- `activeTab` — let the toolbar popup talk to the tab you are looking at.
- Content script on all sites — required to control video on any website you choose to use it on. You can turn SpeeVid off per site in its settings.

## Contact

Questions or concerns: open an issue at <https://github.com/Caglar-Coban/SpeeVid/issues>.

---

# Gizlilik Politikası

**SpeeVid hiçbir veri toplamaz, iletmez, satmaz veya paylaşmaz.** Eklenti kendi başına ağ isteği yapmaz; analitik, telemetri veya sunucusu yoktur.

## Ne saklanır, nerede?

Aşağıdakilerin hepsi tarayıcının standart eklenti depolama API'si ile saklanır:

- **Ayarlar** (tema, kısayollar, kontrol konumu, dil, devre dışı siteler...) — `storage.sync`. Tarayıcı hesabında eşitleme açıksa, bunları *tarayıcın* kendi cihazların arasında kendi gizlilik politikasına göre eşitleyebilir. SpeeVid bunları görmez ve hiçbir yere göndermez.
- **Site bazlı hızlar** (son kullanılan, sabitlenmiş), "tüm sekmelere uygula" hızı ve isteğe bağlı **kazanılan zaman** sayacı — `storage.local`, yalnızca bu cihazda.
- **Dışa aktarılan yedekler** senin oluşturduğun dosyalardır; SpeeVid bunları yüklemez.

## Eklenti ne okur?

- Videoları (ve açarsan `<audio>` öğelerini) bulup oynatma hızını değiştirmek için açtığın her sayfada çalışır. Sayfa içeriğini, medyanın kendisini, URL'leri veya gezinti geçmişini okumaz, kaydetmez, saklamaz. Bulunduğun sitenin **alan adı** yalnızca o sitenin hatırlanan hızı ve devre dışı/sabit listeleri için yerelde anahtar olarak kullanılır.
- Kısayollar yalnızca ayarladığın tuşlarla eşleştirilir; yazdığın metin kaydedilmez ve bir giriş alanına yazarken kısayollar yok sayılır.

## İzinler

- `storage` — ayarları ve site hızlarını saklamak.
- `activeTab` — araç çubuğu popup'ının baktığın sekmeyle konuşması.
- Tüm sitelerde içerik betiği — istediğin her sitede videoyu kontrol edebilmek için gerekli. Ayarlardan SpeeVid'i site bazında kapatabilirsin.

## İletişim

Sorular için: <https://github.com/Caglar-Coban/SpeeVid/issues>
