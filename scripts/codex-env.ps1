$repoRoot = Resolve-Path -LiteralPath (Join-Path $PSScriptRoot "..")

$candidatePaths = @(
  "C:\Program Files\nodejs",
  (Join-Path $repoRoot "node_modules\.bin"),
  "C:\Program Files\Git\cmd",
  "C:\Program Files\Git\bin"
)

$existingPaths = $candidatePaths | Where-Object { Test-Path -LiteralPath $_ }
$currentPaths = $env:Path -split ";" | Where-Object { $_ }
$env:Path = (($existingPaths + $currentPaths) | Select-Object -Unique) -join ";"

function global:node {
  & "C:\Program Files\nodejs\node.exe" @args
}

function global:npm {
  & "C:\Program Files\nodejs\npm.cmd" @args
}

function global:npx {
  & "C:\Program Files\nodejs\npx.cmd" @args
}

function global:git {
  & "C:\Program Files\Git\cmd\git.exe" @args
}
