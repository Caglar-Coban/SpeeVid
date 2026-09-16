Add-Type -AssemblyName System.Drawing

$sizes = @(16, 32, 48, 128)
$outDir = Join-Path $PSScriptRoot "..\icons"
if (-not (Test-Path $outDir)) {
    New-Item -ItemType Directory -Path $outDir | Out-Null
}

foreach ($size in $sizes) {
    $bitmap = New-Object System.Drawing.Bitmap $size, $size
    $graphics = [System.Drawing.Graphics]::FromImage($bitmap)
    $graphics.SmoothingMode = [System.Drawing.Drawing2D.SmoothingMode]::AntiAlias
    $graphics.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality

    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $colorStart = [System.Drawing.Color]::FromArgb(255, 101, 82, 224)
    $colorEnd = [System.Drawing.Color]::FromArgb(255, 138, 123, 250)
    $bgBrush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
        $rect, $colorStart, $colorEnd, [System.Drawing.Drawing2D.LinearGradientMode]::ForwardDiagonal
    )

    $radius = [Math]::Round($size * 0.22)
    $path = New-Object System.Drawing.Drawing2D.GraphicsPath
    $d = $radius * 2
    $path.AddArc(0, 0, $d, $d, 180, 90)
    $path.AddArc($size - $d, 0, $d, $d, 270, 90)
    $path.AddArc($size - $d, $size - $d, $d, $d, 0, 90)
    $path.AddArc(0, $size - $d, $d, $d, 90, 90)
    $path.CloseFigure()

    $graphics.FillPath($bgBrush, $path)

    # --- Speedometer glyph: dial arc + needle + pivot, all in white ---
    $cx = $size * 0.5
    $cy = $size * 0.56
    $r = $size * 0.30

    $strokeWidth = [Math]::Max(1.0, $size * 0.075)
    $pen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $strokeWidth)
    $pen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $pen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round

    $dialRect = New-Object System.Drawing.RectangleF ($cx - $r), ($cy - $r), ($r * 2), ($r * 2)
    # GDI+ angle convention: 0=east, 90=south, 180=west, 270=north, clockwise.
    # Leave a 60deg gap centered at the top (270deg) so it reads as an open dial.
    $graphics.DrawArc($pen, $dialRect, 300, 300)

    # Needle pointing to the upper-right (fast/high-speed reading).
    $needleAngleDeg = 315
    $needleLen = $r * 0.82
    $rad = $needleAngleDeg * [Math]::PI / 180
    $tipX = $cx + $needleLen * [Math]::Cos($rad)
    $tipY = $cy + $needleLen * [Math]::Sin($rad)
    $needlePen = New-Object System.Drawing.Pen([System.Drawing.Color]::White, $strokeWidth)
    $needlePen.StartCap = [System.Drawing.Drawing2D.LineCap]::Round
    $needlePen.EndCap = [System.Drawing.Drawing2D.LineCap]::Round
    $graphics.DrawLine($needlePen, $cx, $cy, $tipX, $tipY)

    # Pivot dot at the dial center.
    $pivotR = $size * 0.052
    $whiteBrush = [System.Drawing.Brushes]::White
    $graphics.FillEllipse($whiteBrush, ($cx - $pivotR), ($cy - $pivotR), ($pivotR * 2), ($pivotR * 2))

    # Tick dots at the two arc ends and the bottom, for a bit of dial detail.
    $tickR = $size * 0.028
    $tickAngles = @(300, 90, 240)
    foreach ($ta in $tickAngles) {
        $tr = $ta * [Math]::PI / 180
        $tx = $cx + $r * [Math]::Cos($tr)
        $ty = $cy + $r * [Math]::Sin($tr)
        $graphics.FillEllipse($whiteBrush, ($tx - $tickR), ($ty - $tickR), ($tickR * 2), ($tickR * 2))
    }

    $outPath = Join-Path $outDir "icon$size.png"
    $bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $graphics.Dispose()
    $bitmap.Dispose()
    $pen.Dispose()
    $needlePen.Dispose()
    $bgBrush.Dispose()
    $path.Dispose()
}

Write-Host "Icons generated in $outDir"
