param(
    [string]$Destination,
    [switch]$Check
)

$ErrorActionPreference = 'Stop'
Set-StrictMode -Version Latest

$RepositoryRoot = Split-Path -Parent $PSScriptRoot
if (-not $Destination) {
    $UserProfilePath = [Environment]::GetFolderPath('UserProfile')
    $Destination = Join-Path $UserProfilePath '.codex\skills\system-workflows\skill-evolution'
}
$ResolvedDestination = [System.IO.Path]::GetFullPath($Destination)
if ((Split-Path -Leaf $ResolvedDestination) -ne 'skill-evolution') {
    throw "Destination must resolve to a skill-evolution directory: $ResolvedDestination"
}

$ManagedFiles = @('SKILL.md', 'LICENSE', 'README.md', 'README.zh-CN.md')
$ManagedDirectories = @('agents', 'evals', 'references', 'scripts')
$SourceFiles = [System.Collections.Generic.List[string]]::new()
foreach ($RelativePath in $ManagedFiles) {
    $SourceFiles.Add($RelativePath)
}
foreach ($Directory in $ManagedDirectories) {
    Get-ChildItem -LiteralPath (Join-Path $RepositoryRoot $Directory) -Recurse -File | ForEach-Object {
        $SourceFiles.Add($_.FullName.Substring($RepositoryRoot.Length + 1))
    }
}

$Differences = [System.Collections.Generic.List[string]]::new()
foreach ($RelativePath in $SourceFiles) {
    $SourcePath = Join-Path $RepositoryRoot $RelativePath
    $DestinationPath = Join-Path $ResolvedDestination $RelativePath
    if (-not (Test-Path -LiteralPath $DestinationPath)) {
        $Differences.Add("missing: $RelativePath")
        continue
    }
    if ((Get-FileHash -Algorithm SHA256 -LiteralPath $SourcePath).Hash -ne
        (Get-FileHash -Algorithm SHA256 -LiteralPath $DestinationPath).Hash) {
        $Differences.Add("different: $RelativePath")
    }
}
$ExpectedFiles = @($SourceFiles | ForEach-Object { $_.Replace('\', '/').ToLowerInvariant() })
if (Test-Path -LiteralPath $ResolvedDestination -PathType Container) {
    Get-ChildItem -LiteralPath $ResolvedDestination -Recurse -File | ForEach-Object {
        $RelativePath = $_.FullName.Substring($ResolvedDestination.Length + 1).Replace('\', '/').ToLowerInvariant()
        if ($RelativePath -notin $ExpectedFiles) {
            $Differences.Add("unexpected: $RelativePath")
        }
    }
}

if ($Check) {
    if ($Differences.Count -gt 0) {
        $Differences | ForEach-Object { Write-Error $_ }
        exit 1
    }
    Write-Output "Active Skill mirror matches $($SourceFiles.Count) managed files."
    exit 0
}

New-Item -ItemType Directory -Path $ResolvedDestination -Force | Out-Null
foreach ($RelativePath in $SourceFiles) {
    $SourcePath = Join-Path $RepositoryRoot $RelativePath
    $DestinationPath = Join-Path $ResolvedDestination $RelativePath
    New-Item -ItemType Directory -Path (Split-Path -Parent $DestinationPath) -Force | Out-Null
    Copy-Item -LiteralPath $SourcePath -Destination $DestinationPath -Force
}

Write-Output "Synchronized $($SourceFiles.Count) managed files to $ResolvedDestination."
& $PSCommandPath -Destination $ResolvedDestination -Check
