# Builds the files to upload to the school web server (e.g. https://www.ben2.ac.th/repair/).
#   dist/repair/                 folder to upload as-is
#   dist/ben2-repair-site.zip    same files, zip root = site root (extract inside a folder named "repair")
# Run from the repo root:  powershell -ExecutionPolicy Bypass -File scripts/make-school-bundle.ps1
$ErrorActionPreference = 'Stop'

$root = Split-Path -Parent $PSScriptRoot
$out  = Join-Path $root 'dist'
$site = Join-Path $out 'repair'
$zip  = Join-Path $out 'ben2-repair-site.zip'

# only ever delete our own build folder
if ((Split-Path -Leaf $out) -ne 'dist' -or -not (Test-Path (Join-Path $root 'index.html'))) {
    throw "Refusing to run: $root does not look like the BEN2 repo root."
}
if (Test-Path $out) { Remove-Item -LiteralPath $out -Recurse -Force }
New-Item -ItemType Directory -Path $site | Out-Null

$files = 'index.html', 'admin.html', 'dashboard.html', 'login.html', 'config.js', 'styles.css'
foreach ($f in $files) { Copy-Item -LiteralPath (Join-Path $root $f) -Destination $site }
Copy-Item -LiteralPath (Join-Path $root 'js') -Destination (Join-Path $site 'js') -Recurse

# sanity checks: backend configured, nothing from tests/docs leaked in
$config = Get-Content -LiteralPath (Join-Path $site 'config.js') -Raw
if ($config -notmatch "SCRIPT_URL\s*=\s*'https://script\.google\.com/macros/s/[^']+/exec'") {
    throw 'config.js has no Apps Script URL (SCRIPT_URL is empty) - the site would run in demo mode.'
}

# bsdtar (built into Windows 10+) writes a zip with forward-slash paths, which every server unzips correctly
& tar.exe -a -c -f $zip -C $site .
if ($LASTEXITCODE -ne 0) { throw 'tar failed to create the zip' }

$count = (Get-ChildItem -LiteralPath $site -Recurse -File).Count
Write-Host "OK: $count files"
Write-Host "  folder: $site"
Write-Host "  zip:    $zip ($([math]::Round((Get-Item $zip).Length / 1KB)) KB)"
