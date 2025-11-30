param(
  [Parameter(Mandatory=$false)][string]$Source = "./build/dragon.png",
  [Parameter(Mandatory=$false)][string]$Out = "./build/icon.ico"
)

$ErrorActionPreference = 'Stop'

function Ensure-Command($name) {
  $cmd = Get-Command $name -ErrorAction SilentlyContinue
  return $null -ne $cmd
}

if (-not (Test-Path $Source)) {
  Write-Error "Imagem de origem não encontrada: $Source. Coloque o PNG do ícone em $Source ou passe -Source <caminho>."
}

$buildDir = Split-Path -Parent $Out
if (-not (Test-Path $buildDir)) { New-Item -ItemType Directory -Force -Path $buildDir | Out-Null }

if (-not (Ensure-Command magick)) {
  Write-Host "ImageMagick não encontrado. Instalando via winget..." -ForegroundColor Yellow
  if (Ensure-Command winget) {
    winget install -e --id ImageMagick.ImageMagick --accept-source-agreements --accept-package-agreements
  } else {
    Write-Error "winget não disponível. Instale o ImageMagick manualmente ou gere o .ico em um site (ex: icoconvert.com)."
  }
}

if (-not (Ensure-Command magick)) {
  Write-Error "Comando 'magick' ainda não disponível após instalação. Reinicie o terminal e tente novamente."
}

# Gerar tamanhos recomendados e compor ICO
$Sizes = @(16,24,32,48,64,128,256)
$pngs = @()
foreach ($s in $Sizes) {
  $p = Join-Path $buildDir ("icon-${s}.png")
  magick "$Source" -resize ${s}x${s} "$p"
  $pngs += $p
}

magick $pngs "$Out"

if (Test-Path $Out) {
  Write-Host "Ícone gerado com sucesso: $Out" -ForegroundColor Green
} else {
  Write-Error "Falha ao gerar $Out"
}
