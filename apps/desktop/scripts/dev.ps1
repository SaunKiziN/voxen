param(
    [string]$Url = $env:SHARKORD_DESKTOP_URL
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($Url)) {
    Write-Host "Set SHARKORD_DESKTOP_URL or pass -Url. Example: `$env:SHARKORD_DESKTOP_URL = 'https://sharkord.example.com'; bun run dev" -ForegroundColor Red
    exit 1
}

$normalizedUrl = $Url.Trim().TrimEnd("/")
$uri = $null

if (-not [Uri]::TryCreate($normalizedUrl, [UriKind]::Absolute, [ref]$uri)) {
    Write-Host "SHARKORD_DESKTOP_URL must be an absolute URL." -ForegroundColor Red
    exit 1
}

if ($uri.Scheme -ne "http" -and $uri.Scheme -ne "https") {
    Write-Host "SHARKORD_DESKTOP_URL must start with http:// or https://." -ForegroundColor Red
    exit 1
}

if ($uri.Scheme -eq "http") {
    Write-Host "Warning: remote media capture usually requires HTTPS. Chat may work over HTTP while microphone, camera, or screen sharing fail." -ForegroundColor Yellow
}

$env:SHARKORD_DESKTOP_URL = $normalizedUrl

$workspace = Resolve-Path (Join-Path $PSScriptRoot "..")
Set-Location $workspace

bun tauri dev
exit $LASTEXITCODE
