$include = '\.(js|ts|tsx|jsx|cpp|hpp|h|c|py|rs|json|css|html|sql|yml|yaml)$'
$exclude = '(^|\\)(\.agents|\.claude|\.fingerprint|\.gsd|\.venv_ml|\.git|\.github|archive|build|data|dist|fixtures|graphify-out|legacy|node_modules|notebooks|storage|test-data|test_data|testdata|__pycache__)(\\|$)'

function Show-FilteredTree {
  param(
    [string]$Path = ".",
    [string]$Prefix = ""
  )

  $items = Get-ChildItem -LiteralPath $Path -Force |
    Where-Object {
      $rel = $_.FullName.Substring((Get-Location).Path.Length + 1)
      $showArchiveBucket = $rel -match '(^|\\)(docs|workspace)\\archive(\\|$)'
      $showDocsWorkspaceText = $rel -match '(^|\\)(docs|workspace)(\\|$)' -and $_.Extension -in '.md', '.txt'
      ($rel -notmatch $exclude -or $showArchiveBucket) -and ($_.PSIsContainer -or $_.FullName -match $include -or $showDocsWorkspaceText)
    } |
    Sort-Object @{ Expression = { -not $_.PSIsContainer } }, Name

  for ($i = 0; $i -lt $items.Count; $i++) {
    $item = $items[$i]
    $isLast = $i -eq $items.Count - 1
    $branch = if ($isLast) { '+-- ' } else { '|-- ' }
    $label = $item.Name
    if (-not $item.PSIsContainer) {
      $lineCount = (Get-Content -LiteralPath $item.FullName | Measure-Object -Line).Lines
      $label = "$label -x$lineCount"
    }
    Write-Output "$Prefix$branch$label"

    if ($item.PSIsContainer) {
      $nextPrefix = $Prefix + $(if ($isLast) { '    ' } else { '|   ' })
      Show-FilteredTree -Path $item.FullName -Prefix $nextPrefix
    }
  }
}

Show-FilteredTree
