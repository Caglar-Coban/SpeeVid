# SpeeVid — Chrome Uzantısı Tasarımı

Tarih: 2026-09-16

## Amaç

Herhangi bir web sitesindeki HTML5 videolarının oynatma hızını kontrol
etmeyi sağlayan, sade ve gerçek bir ürün gibi görünen (yapay zeka
tarafından üretilmiş hissi vermeyen) bir Chrome uzantısı.

## Kapsam

- Tüm sitelerdeki `<video>` etiketlerinde çalışır (YouTube, Netflix,
  Vimeo, Twitter vb. dahil).
- Hız presetleri + slider ile hız kontrolü.
- Klavye kısayolları: `S` hızlandır (+0.1x), `D` yavaşlat (-0.1x), `A`
  sıfırla (1x).
- Video üzerinde yüzen kontrol (floating overlay) — ayarlardan
  açılıp kapatılabilir. Kapalıyken sadece toolbar popup'ından kontrol
  edilir.
- Site bazlı son kullanılan hızı hatırlama.
- Sistem temasına otomatik uyum (açık/koyu).

## Kapsam Dışı

- Ses hızlandırma/pitch koruma dışında ekstra ses efektleri.
- Video indirme, altyazı, reklam engelleme gibi ilgisiz özellikler.
- Firefox/Safari desteği (yalnızca Chrome/Chromium, Manifest V3).

## Mimari

Üç ana parça:

1. **Content script** (`src/content/content.js`)
   - Tüm sayfalara (`<all_urls>`) enjekte edilir.
   - Sayfadaki `<video>` etiketlerini bulur; `MutationObserver` ile
     sonradan eklenen videoları (SPA navigasyonları) da yakalar.
   - Her video için `playbackRate` uygular.
   - Klavye kısayollarını dinler; kullanıcı bir `input`/`textarea`/
     `contenteditable` alana odaklanmışken kısayollar devre dışı kalır.
   - Floating overlay'i bir Shadow DOM içine render eder (sitenin
     CSS'inden etkilenmemesi için).
   - `chrome.storage` üzerinden ayarları okur (floating açık/kapalı,
     kısayollar açık/kapalı) ve site bazlı hızı okur/yazar.

2. **Popup** (`src/popup/popup.html`, `popup.js`, `popup.css`)
   - Toolbar ikonuna tıklanınca açılır.
   - Aktif sekmedeki video(lar)ın hızını gösterir/değiştirir (slider +
     presetler: 0.5x, 0.75x, 1x, 1.25x, 1.5x, 1.75x, 2x, 2.5x, 3x).
   - "Video üzerinde kontrolü göster" açma/kapama anahtarı burada yer
     alır (bu ayar `chrome.storage.sync`'e yazılır ve content script
     tarafından dinlenir).
   - Aktif sekmedeki content script'e `chrome.tabs.sendMessage` ile
     komut gönderir.

3. **Background service worker** (`src/background/service-worker.js`)
   - Yalnızca `chrome.runtime.onInstalled` olayında varsayılan
     ayarları (`floatingEnabled: true`, `shortcutsEnabled: true`)
     `chrome.storage.sync`'e yazar.

## Veri / Depolama

- `chrome.storage.sync`:
  ```json
  { "floatingEnabled": true, "shortcutsEnabled": true }
  ```
  Cihazlar arasında senkronize genel ayarlar.

- `chrome.storage.local`:
  ```json
  { "siteSpeeds": { "www.youtube.com": 1.5, "vimeo.com": 1.25 } }
  ```
  Site bazlı son kullanılan hız (hostname anahtarlı). Bir sitede daha
  önce kayıt yoksa varsayılan 1x kullanılır.

## Mesajlaşma

- Popup ↔ Content script: `chrome.tabs.sendMessage` /
  `chrome.runtime.onMessage` ile `{ type: "SET_SPEED", speed }`,
  `{ type: "GET_STATE" }` gibi basit mesaj tipleri.
- Content script, ayar değişikliklerini `chrome.storage.onChanged`
  dinleyerek anlık uygular (popup kapatılsa bile).

## Görsel Tasarım

- Sistem temasına otomatik uyum: CSS `prefers-color-scheme` medya
  sorgusu ile açık/koyu değişkenler.
- Nötr gri tonlar + tek vurgu rengi (indigo/mor), yuvarlatılmış
  köşeler, ince gölgeler, kısa geçiş animasyonları.
- Floating overlay: videonun sağ-alt köşesinde küçük bir hız rozeti
  (ör. "1.25x"); üzerine gelince/genişleyince preset butonları ve
  slider açılır; birkaç saniye etkileşimsizlikte saydamlaşır.
- İkon: düz (flat) tasarım, yuvarlak köşeli kare + basit bir "hız"
  glifi, gradyan arka plan. 16/32/48/128px PNG olarak programatik
  üretilecek (PowerShell/.NET `System.Drawing` ile).

## Dosya Yapısı

```
SpeeVid/
  manifest.json
  icons/
    icon16.png
    icon32.png
    icon48.png
    icon128.png
  src/
    content/
      content.js
      content.css
    popup/
      popup.html
      popup.js
      popup.css
    background/
      service-worker.js
```

## Hata Yönetimi

- Sayfada hiç video yoksa popup bunu belirtir ("Bu sayfada video
  bulunamadı") ve kontrolleri devre dışı bırakır.
- `chrome.tabs.sendMessage` content script'in henüz yüklenmediği bir
  sayfada (ör. `chrome://` sayfaları) hata verirse popup sessizce
  "desteklenmeyen sayfa" durumuna düşer.

## Test Planı

- `chrome://extensions` → "Paketlenmemiş öğe yükle" ile manuel yükleme.
- YouTube üzerinde: hız değişimi, kısayollar, floating toggle, sayfa
  yenilendiğinde hızın hatırlanması.
- Düz bir HTML5 `<video>` test sayfasında aynı senaryolar.
- SPA navigasyonu (YouTube video değiştirme) sonrası floating
  overlay'in yeni videoya doğru bağlandığının kontrolü.
- Açık/koyu sistem teması değiştirildiğinde popup ve overlay'in doğru
  temayı yansıtması.
