param(
  [int]$GifWidth = 1120,
  [int]$FramesPerSecond = 12,
  [int]$PaletteSize = 128
)

$ErrorActionPreference = 'Stop'

$repoRoot = (Resolve-Path (Join-Path $PSScriptRoot '..\..')).Path
$assetDir = Join-Path $repoRoot 'assets'
$gifPath = Join-Path $assetDir 'skill-evolution-demo.gif'
$posterPath = Join-Path $assetDir 'skill-evolution-demo-poster.png'
$tempRoot = Join-Path $env:TEMP ('skill-evolution-readme-demo-' + [guid]::NewGuid().ToString('N'))
$renderPath = Join-Path $tempRoot 'skill-evolution-demo.mp4'

New-Item -ItemType Directory -Path $assetDir -Force | Out-Null
New-Item -ItemType Directory -Path $tempRoot -Force | Out-Null

& hyperframes check $PSScriptRoot --json
if ($LASTEXITCODE -ne 0) { throw 'HyperFrames check failed.' }

& hyperframes render $PSScriptRoot --quality standard --output $renderPath
if ($LASTEXITCODE -ne 0) { throw 'HyperFrames render failed.' }

$gifFilter = "fps=${FramesPerSecond},scale=${GifWidth}:-1:flags=lanczos,split[a][b];[a]palettegen=max_colors=${PaletteSize}:stats_mode=diff[p];[b][p]paletteuse=dither=bayer:bayer_scale=3"
& ffmpeg -hide_banner -loglevel error -y -i $renderPath -filter_complex $gifFilter -loop 0 -an $gifPath
if ($LASTEXITCODE -ne 0) { throw 'GIF conversion failed.' }

& ffmpeg -hide_banner -loglevel error -y -ss 5.8 -i $renderPath -frames:v 1 -update 1 $posterPath
if ($LASTEXITCODE -ne 0) { throw 'Poster extraction failed.' }

$gifInfo = Get-Item -LiteralPath $gifPath
$posterInfo = Get-Item -LiteralPath $posterPath
$mediaInfo = & ffprobe -v error -show_entries format=duration -of default=noprint_wrappers=1:nokey=1 $gifPath

Write-Output "GIF: $($gifInfo.FullName) ($($gifInfo.Length) bytes; ${mediaInfo}s)"
Write-Output "Poster: $($posterInfo.FullName) ($($posterInfo.Length) bytes)"
Write-Output "Temporary MP4 and render logs: $tempRoot"
