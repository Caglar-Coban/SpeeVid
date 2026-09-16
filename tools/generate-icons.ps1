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
    $graphics.TextRenderingHint = [System.Drawing.Text.TextRenderingHint]::AntiAliasGridFit

    $rect = New-Object System.Drawing.Rectangle 0, 0, $size, $size
    $colorStart = [System.Drawing.Color]::FromArgb(255, 101, 82, 224)
    $colorEnd = [System.Drawing.Color]::FromArgb(255, 138, 123, 250)
    $brush = New-Object System.Drawing.Drawing2D.LinearGradientBrush(
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

    $graphics.FillPath($brush, $path)

    $fontSize = [Math]::Round($size * 0.56)
    $font = New-Object System.Drawing.Font("Segoe UI", $fontSize, [System.Drawing.FontStyle]::Bold, [System.Drawing.GraphicsUnit]::Pixel)
    $textBrush = [System.Drawing.Brushes]::White
    $format = New-Object System.Drawing.StringFormat
    $format.Alignment = [System.Drawing.StringAlignment]::Center
    $format.LineAlignment = [System.Drawing.StringAlignment]::Center
    $textRect = New-Object System.Drawing.RectangleF 0, ($size * -0.03), $size, $size
    $graphics.DrawString("S", $font, $textBrush, $textRect, $format)

    $outPath = Join-Path $outDir "icon$size.png"
    $bitmap.Save($outPath, [System.Drawing.Imaging.ImageFormat]::Png)

    $graphics.Dispose()
    $bitmap.Dispose()
    $font.Dispose()
    $brush.Dispose()
    $path.Dispose()
}

Write-Host "Icons generated in $outDir"
