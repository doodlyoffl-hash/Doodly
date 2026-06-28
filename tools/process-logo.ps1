# =============================================================
# DOODLY - prepare the official logo for the web
# Takes the supplied white-background JPG and produces a tight,
# transparent-background PNG (white keyed out, letter counters
# included, margins trimmed). No recolour, no distortion.
#   powershell -ExecutionPolicy Bypass -File tools/process-logo.ps1 -SrcPath "<path-to-jpg>"
# =============================================================
param(
  [string]$SrcPath = "C:\Users\devin\Downloads\Doodly Logo-16.jpg",
  [string]$OutPath = "C:\Users\devin\OneDrive\Desktop\Doodly Claude\assets\img\logo.png",
  [int]$Width = 1400
)
Add-Type -AssemblyName System.Drawing
$fmt = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb

$image = [System.Drawing.Image]::FromFile($SrcPath)
$tw = $Width
$th = [int]($image.Height * $tw / $image.Width)
$bmp = New-Object System.Drawing.Bitmap($tw, $th, $fmt)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.InterpolationMode = [System.Drawing.Drawing2D.InterpolationMode]::HighQualityBicubic
$gfx.PixelOffsetMode = [System.Drawing.Drawing2D.PixelOffsetMode]::HighQuality
$gfx.DrawImage($image, 0, 0, $tw, $th)
$gfx.Dispose(); $image.Dispose()

$rect = New-Object System.Drawing.Rectangle(0, 0, $tw, $th)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, $fmt)
$stride = $data.Stride
$len = $stride * $th
$buf = [byte[]]::new($len)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buf, 0, $len)

$minX = $tw; $minY = $th; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $th; $y++) {
  $row = $y * $stride
  for ($x = 0; $x -lt $tw; $x++) {
    $i = $row + $x * 4
    $b = $buf[$i]; $gr = $buf[$i + 1]; $r = $buf[$i + 2]
    $minc = [Math]::Min($b, [Math]::Min($gr, $r))   # whiteness: high = near-white
    if ($minc -ge 236) { $a = 0 }
    elseif ($minc -le 198) { $a = 255 }
    else { $a = [int]((236 - $minc) * 255 / 38) }   # feather edges
    $buf[$i + 3] = [byte]$a
    if ($a -gt 24) {
      if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
[System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $data.Scan0, $len)
$bmp.UnlockBits($data)

$pad = 8
$cx = [Math]::Max(0, $minX - $pad); $cy = [Math]::Max(0, $minY - $pad)
$cw = [Math]::Min($tw - $cx, ($maxX - $minX + 1) + 2 * $pad)
$ch = [Math]::Min($th - $cy, ($maxY - $minY + 1) + 2 * $pad)
$crop = New-Object System.Drawing.Rectangle($cx, $cy, $cw, $ch)
$result = $bmp.Clone($crop, $fmt)
$dir = Split-Path $OutPath -Parent
if (-not (Test-Path $dir)) { New-Item -ItemType Directory -Force -Path $dir | Out-Null }
$result.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$result.Dispose(); $bmp.Dispose()

Write-Host ("Saved {0}  ({1} x {2}, trimmed from {3} x {4})" -f $OutPath, $cw, $ch, $tw, $th) -ForegroundColor Green
