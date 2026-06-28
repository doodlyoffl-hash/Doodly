# =============================================================
# DOODLY - cut the bottle out of its cream background
# Border flood-fill removes only the connected background colour,
# so the enclosed white milk / cap / label are preserved. Edges
# feathered, result trimmed and saved as a transparent PNG.
#   powershell -ExecutionPolicy Bypass -File tools/cutout-bottle.ps1
# =============================================================
param(
  [string]$InPath  = "C:\Users\devin\OneDrive\Desktop\Doodly Claude\assets\img\products\milk-bottle.jpg",
  [string]$OutPath = "C:\Users\devin\OneDrive\Desktop\Doodly Claude\assets\img\products\milk-bottle.png",
  [int]$Tol = 34
)
Add-Type -AssemblyName System.Drawing
$fmt = [System.Drawing.Imaging.PixelFormat]::Format32bppArgb

$img = [System.Drawing.Image]::FromFile($InPath)
$w = $img.Width; $h = $img.Height
$bmp = New-Object System.Drawing.Bitmap($w, $h, $fmt)
$gfx = [System.Drawing.Graphics]::FromImage($bmp)
$gfx.DrawImage($img, 0, 0, $w, $h); $gfx.Dispose(); $img.Dispose()

$rect = New-Object System.Drawing.Rectangle(0, 0, $w, $h)
$data = $bmp.LockBits($rect, [System.Drawing.Imaging.ImageLockMode]::ReadWrite, $fmt)
$stride = $data.Stride; $len = $stride * $h
$buf = [byte[]]::new($len)
[System.Runtime.InteropServices.Marshal]::Copy($data.Scan0, $buf, 0, $len)

# background colour = average of the four corners (inset a few px)
$cx = @(4, ($w - 5), 4, ($w - 5)); $cy = @(4, 4, ($h - 5), ($h - 5))
$bb = 0; $bg = 0; $br = 0
for ($k = 0; $k -lt 4; $k++) { $i = $cy[$k] * $stride + $cx[$k] * 4; $bb += $buf[$i]; $bg += $buf[$i + 1]; $br += $buf[$i + 2] }
$bb = [int]($bb / 4); $bg = [int]($bg / 4); $br = [int]($br / 4)

$wm1 = $w - 1; $hm1 = $h - 1
$stack = New-Object System.Collections.Generic.Stack[int]
# seed: every border pixel that matches the background
for ($x = 0; $x -lt $w; $x++) {
  $i = $x * 4;                if (([Math]::Abs($buf[$i]-$bb)+[Math]::Abs($buf[$i+1]-$bg)+[Math]::Abs($buf[$i+2]-$br)) -lt $Tol) { $stack.Push($x) }
  $i = $hm1 * $stride + $x*4; if (([Math]::Abs($buf[$i]-$bb)+[Math]::Abs($buf[$i+1]-$bg)+[Math]::Abs($buf[$i+2]-$br)) -lt $Tol) { $stack.Push($hm1*$w+$x) }
}
for ($y = 0; $y -lt $h; $y++) {
  $i = $y*$stride;            if (([Math]::Abs($buf[$i]-$bb)+[Math]::Abs($buf[$i+1]-$bg)+[Math]::Abs($buf[$i+2]-$br)) -lt $Tol) { $stack.Push($y*$w) }
  $i = $y*$stride + $wm1*4;   if (([Math]::Abs($buf[$i]-$bb)+[Math]::Abs($buf[$i+1]-$bg)+[Math]::Abs($buf[$i+2]-$br)) -lt $Tol) { $stack.Push($y*$w+$wm1) }
}

while ($stack.Count -gt 0) {
  $p = $stack.Pop()
  $y = [int]($p / $w); $x = $p - $y * $w
  $i = $y * $stride + $x * 4
  if ($buf[$i + 3] -eq 0) { continue }
  $d = [Math]::Abs($buf[$i]-$bb) + [Math]::Abs($buf[$i+1]-$bg) + [Math]::Abs($buf[$i+2]-$br)
  if ($d -ge $Tol) { continue }
  $buf[$i + 3] = 0
  if ($x -gt 0)    { $stack.Push($p - 1) }
  if ($x -lt $wm1) { $stack.Push($p + 1) }
  if ($y -gt 0)    { $stack.Push($p - $w) }
  if ($y -lt $hm1) { $stack.Push($p + $w) }
}

# feather: soften 1px halo on foreground pixels that border transparency
$band = $Tol * 2
for ($y = 0; $y -lt $h; $y++) {
  for ($x = 0; $x -lt $w; $x++) {
    $i = $y * $stride + $x * 4
    if ($buf[$i + 3] -eq 0) { continue }
    $edge = $false
    if ($x -gt 0    -and $buf[$i - 4] -eq 0)        { $edge = $true }
    if (-not $edge -and $x -lt $wm1 -and $buf[$i + 4] -eq 0)        { $edge = $true }
    if (-not $edge -and $y -gt 0    -and $buf[$i - $stride + 3] -eq 0) { $edge = $true }
    if (-not $edge -and $y -lt $hm1 -and $buf[$i + $stride + 3] -eq 0) { $edge = $true }
    if (-not $edge) { continue }
    $d = [Math]::Abs($buf[$i]-$bb) + [Math]::Abs($buf[$i+1]-$bg) + [Math]::Abs($buf[$i+2]-$br)
    if ($d -lt $band) { $a = [int](255 * ($d - $Tol) / $Tol); if ($a -lt 0) { $a = 0 }; if ($a -lt $buf[$i + 3]) { $buf[$i + 3] = [byte]$a } }
  }
}

# bounding box of opaque content
$minX = $w; $minY = $h; $maxX = 0; $maxY = 0
for ($y = 0; $y -lt $h; $y++) {
  $row = $y * $stride
  for ($x = 0; $x -lt $w; $x++) {
    if ($buf[$row + $x * 4 + 3] -gt 24) {
      if ($x -lt $minX) { $minX = $x }; if ($x -gt $maxX) { $maxX = $x }
      if ($y -lt $minY) { $minY = $y }; if ($y -gt $maxY) { $maxY = $y }
    }
  }
}
[System.Runtime.InteropServices.Marshal]::Copy($buf, 0, $data.Scan0, $len)
$bmp.UnlockBits($data)

$pad = 10
$cx0 = [Math]::Max(0, $minX - $pad); $cy0 = [Math]::Max(0, $minY - $pad)
$cw = [Math]::Min($w - $cx0, ($maxX - $minX + 1) + 2 * $pad)
$ch = [Math]::Min($h - $cy0, ($maxY - $minY + 1) + 2 * $pad)
$crop = New-Object System.Drawing.Rectangle($cx0, $cy0, $cw, $ch)
$result = $bmp.Clone($crop, $fmt)
$result.Save($OutPath, [System.Drawing.Imaging.ImageFormat]::Png)
$result.Dispose(); $bmp.Dispose()

$kb = [int]((Get-Item $OutPath).Length / 1024)
Write-Host ("Cutout saved: {0}x{1}  {2} KB  (bg avg B{3} G{4} R{5}, tol {6})" -f $cw, $ch, $kb, $bb, $bg, $br, $Tol) -ForegroundColor Green
