# =============================================================
# DOODLY — Static preview server (no Node required)
# Serves the project root over http://localhost:<port>/ using
# System.Net.HttpListener. Root-relative asset paths (/assets/..)
# resolve correctly. Per-request loop is wrapped in try/catch so a
# readiness probe can't crash it.
#
#   powershell -ExecutionPolicy Bypass -File tools/serve.ps1 -Port 4173
# =============================================================
param(
  [int]$Port = $(if ($env:PORT) { [int]$env:PORT } else { 4173 }),
  [string]$Root = (Split-Path $PSScriptRoot -Parent)
)

$types = @{
  '.html'='text/html; charset=utf-8'; '.htm'='text/html; charset=utf-8';
  '.css'='text/css; charset=utf-8'; '.js'='application/javascript; charset=utf-8';
  '.json'='application/json; charset=utf-8'; '.svg'='image/svg+xml';
  '.png'='image/png'; '.jpg'='image/jpeg'; '.jpeg'='image/jpeg';
  '.gif'='image/gif'; '.ico'='image/x-icon'; '.webp'='image/webp';
  '.woff'='font/woff'; '.woff2'='font/woff2'; '.txt'='text/plain; charset=utf-8'
}

$listener = New-Object System.Net.HttpListener
$listener.Prefixes.Add("http://localhost:$Port/")
try { $listener.Start() }
catch { Write-Error "Could not bind port $Port. Try another (avoid 2869/8123/8884/50000-50059)."; exit 1 }

Write-Host "DOODLY  ->  http://localhost:$Port/" -ForegroundColor Green
Write-Host "Serving $Root  (Ctrl+C to stop)"

while ($listener.IsListening) {
  try {
    $ctx = $listener.GetContext()
    $rel = [System.Uri]::UnescapeDataString($ctx.Request.Url.AbsolutePath).TrimStart('/')
    if ([string]::IsNullOrWhiteSpace($rel)) { $rel = 'index.html' }
    $path = Join-Path $Root ($rel -replace '/', '\')
    if (Test-Path $path -PathType Container) { $path = Join-Path $path 'index.html' }

    if (Test-Path $path -PathType Leaf) {
      $bytes = [System.IO.File]::ReadAllBytes($path)
      $ext = [System.IO.Path]::GetExtension($path).ToLower()
      $ct = $types[$ext]; if (-not $ct) { $ct = 'application/octet-stream' }
      $ctx.Response.ContentType = $ct
      $ctx.Response.StatusCode = 200
      $ctx.Response.OutputStream.Write($bytes, 0, $bytes.Length)
    } else {
      $ctx.Response.StatusCode = 404
      $msg = [System.Text.Encoding]::UTF8.GetBytes("404 - not found: $rel")
      $ctx.Response.ContentType = 'text/plain; charset=utf-8'
      $ctx.Response.OutputStream.Write($msg, 0, $msg.Length)
    }
    $ctx.Response.OutputStream.Close()
  } catch { }
}
