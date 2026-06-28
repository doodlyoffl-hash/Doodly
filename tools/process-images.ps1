# =============================================================
# DOODLY - optimise the official product photos for the web
# Imports the 4 originals from Downloads and writes resized,
# compressed JPEGs into assets/img/products/. Also makes a tight
# bottle-only crop for product cards / hero. No restyling.
#   powershell -ExecutionPolicy Bypass -File tools/process-images.ps1
# =============================================================
param(
  [string]$SrcDir = "C:\Users\devin\Downloads",
  [string]$OutDir = "C:\Users\devin\OneDrive\Desktop\Doodly Claude\assets\img\products"
)
Add-Type -AssemblyName System.Drawing
if (-not (Test-Path $OutDir)) { New-Item -ItemType Directory -Force -Path $OutDir | Out-Null }

$jpegCodec = [System.Drawing.Imaging.ImageCodecInfo]::GetImageEncoders() | Where-Object { $_.MimeType -eq "image/jpeg" }
function Save-Jpeg($bitmap, $path, $quality) {
  $ep = New-Object System.Drawing.Imaging.EncoderParameters(1)
  $ep.Param[0] = New-Object System.Drawing.Imaging.EncoderParameter([System.Drawing.Imaging.Encoder]::Quality, [long]$quality)
  $bitmap.Save($path, $jpegCodec, $ep)
}

# job: source file, output name, max width, optional crop [x0,y0,x1,y1] fractions
$jobs = @(
  @{ src = "1 copy.jpg"; out = "milk-bottle.jpg"; w = 700;  crop = @(0.30, 0.16, 0.70, 0.93) },  # tight bottle for cards/hero
  @{ src = "1 copy.jpg"; out = "milk.jpg";        w = 1000; crop = $null },                       # full clean shot
  @{ src = "2 copy.jpg"; out = "milk-lifestyle.jpg"; w = 1100; crop = $null },
  @{ src = "4 copy.jpg"; out = "milk-splash.jpg"; w = 1200; crop = $null },
  @{ src = "3 copy.jpg"; out = "farm-story.jpg";  w = 1100; crop = $null }
)

foreach ($j in $jobs) {
  $srcPath = Join-Path $SrcDir $j.src
  if (-not (Test-Path $srcPath)) { Write-Host "MISSING $srcPath" -ForegroundColor Yellow; continue }
  $img = [System.Drawing.Image]::FromFile($srcPath)
  $W = $img.Width; $H = $img.Height
  if ($j.crop) {
    $sx = [int]($j.crop[0] * $W); $sy = [int]($j.crop[1] * $H)
    $sw = [int](($j.crop[2] - $j.crop[0]) * $W); $sh = [int](($j.crop[3] - $j.crop[1]) * $H)
  } else { $sx = 0; $sy = 0; $sw = $W; $sh = $H }
  $dw = [Math]::Min($j.w, $sw)
  $dh = [int]($dw * $sh / $sw)

  $bmp = New-Object System.Drawing.Bitmap($dw, $dh, [System.Drawing.Imaging.PixelFormat]::Format24bppRgb)
  $g = [System.Drawing.Graphics]::FromImage($bmp)
  $g.Clear([System.Drawing.Color]::FromArgb(255, 251, 252, 250))   # milk-white, in case of any edge
  $g.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
  $g.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
  $destRect = New-Object System.Drawing.Rectangle(0, 0, $dw, $dh)
  $g.DrawImage($img, $destRect, $sx, $sy, $sw, $sh, [System.Drawing.GraphicsUnit]::Pixel)
  $g.Dispose(); $img.Dispose()

  $outPath = Join-Path $OutDir $j.out
  Save-Jpeg $bmp $outPath 82
  $bmp.Dispose()
  $kb = [int]((Get-Item $outPath).Length / 1024)
  Write-Host ("  {0,-20} {1}x{2}  {3} KB" -f $j.out, $dw, $dh, $kb) -ForegroundColor Green
}
Write-Host "Done." -ForegroundColor Green
