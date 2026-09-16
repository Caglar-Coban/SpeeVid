# SpeeVid

Herhangi bir sitede video oynatma hızını kontrol etmenizi sağlayan bir Chrome uzantısı.

## Özellikler

- Her sitedeki HTML5 videolarında çalışır, 0.25x-16x arası.
- Video üzerinde beliren yüzen hız kontrolü (isteğe bağlı, ayarlardan kapatılabilir).
- Klavye kısayolları: varsayılan olarak `S` hızlandır, `D` yavaşlat, `A` sıfırla (1x), `Q` özel hıza atla — ayarlar ekranından yeniden atanabilir. Özel hızın kendisi de (0.25x-16x arası) ayarlardan değiştirilebilir.
- Popup arayüzü 13 dilde kullanılabilir (varsayılan: İngilizce), ayarlar ekranındaki dil seçiciden değiştirilir.
- Her site için son kullanılan hızı hatırlar; "Tüm sekmelere uygula" açıksa bunun yerine tek bir hız tüm açık sekmelerde anlık senkronize edilir.
- Toolbar ikonunda güncel hızı rozet olarak gösterir (1x'te rozet gizlenir).
- Site bazında tamamen devre dışı bırakılabilir (popup'ın üstündeki anahtar).
- Tüm ayarlar, kısayollar ve hatırlanan hızlar bir JSON dosyasına yedeklenip başka bir cihaza geri yüklenebilir (ayarlar ekranı).
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
