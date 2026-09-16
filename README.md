# SpeeVid

Herhangi bir sitede video oynatma hızını kontrol etmenizi sağlayan bir Chrome uzantısı.

## Özellikler

- Her sitedeki HTML5 videolarında çalışır.
- Video üzerinde beliren yüzen hız kontrolü (isteğe bağlı, ayarlardan kapatılabilir).
- Klavye kısayolları: `S` hızlandır, `D` yavaşlat, `A` sıfırla (1x).
- Her site için son kullanılan hızı hatırlar.
- Açık/koyu sistem temasına otomatik uyum.

## Kurulum (geliştirici modu)

1. Chrome'da `chrome://extensions` adresine gidin.
2. Sağ üstten "Geliştirici modu"nu açın.
3. "Paketlenmemiş öğe yükle" butonuna tıklayın ve bu proje klasörünü seçin.

## Geliştirme

Paylaşılan mantık `src/shared/` altında, saf JS fonksiyonları olarak yazılmıştır ve `node --test` ile test edilir:

```
npm test
```

İkonları yeniden üretmek için (Windows, PowerShell):

```
powershell -ExecutionPolicy Bypass -File tools/generate-icons.ps1
```
