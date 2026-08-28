<#
.SYNOPSIS
  Marxdown のメモリ使用量を測る（05.performance-budget/05-operations.md §3）。

.DESCRIPTION
  Tauri アプリは複数プロセス（メイン + WebView2 のブローカ/レンダラ）に分かれるため、
  **プロセスツリー全体の合計**で測る必要がある。

  単一インスタンス常駐を前提とするため、重視するのは瞬間値ではなく
  「開いて閉じた後」に戻るかどうか（N-PERF-06）。

.EXAMPLE
  # 起動中のアプリを 1 回測る
  pwsh scripts/measure-memory.ps1

.EXAMPLE
  # リーク検出の手順（§5.3）に沿って前後を比較する
  pwsh scripts/measure-memory.ps1 -Label before
  # ... タブを開閉する操作 ...
  pwsh scripts/measure-memory.ps1 -Label after
#>
param(
  [string]$Label = '',
  [switch]$Watch,
  [int]$IntervalSeconds = 5
)

function Get-MarxdownMemory {
  $main = Get-Process -Name marxdown -ErrorAction SilentlyContinue
  if (-not $main) {
    return $null
  }

  # WebView2 のプロセスは親を辿らないと Marxdown のものか判別できない。
  # ユーザーデータフォルダ名に identifier が入るため、コマンドラインで絞り込む。
  $webviewIds = @(
    Get-CimInstance Win32_Process -Filter "Name = 'msedgewebview2.exe'" -ErrorAction SilentlyContinue |
      Where-Object { $_.CommandLine -match 'marxdown' } |
      ForEach-Object { $_.ProcessId }
  )

  # §4.4 が指定するのは **Private Working Set**。
  # WorkingSet64 は WebView2 の共有 DLL を各プロセスで重複計上するため、
  # 実際の 3 倍近い値になり判定に使えない。
  $ids = @($main.Id) + $webviewIds
  $mainMB = 0.0
  $webviewMB = 0.0
  foreach ($id in $ids) {
    $counter = Get-CimInstance Win32_PerfRawData_PerfProc_Process -Filter "IDProcess = $id" -ErrorAction SilentlyContinue
    if (-not $counter) { continue }
    $mb = $counter.WorkingSetPrivate / 1MB
    if ($id -eq $main.Id) { $mainMB += $mb } else { $webviewMB += $mb }
  }

  [pscustomobject]@{
    Timestamp    = Get-Date -Format 'o'
    Label        = $Label
    ProcessCount = $ids.Count
    MainMB       = [math]::Round($mainMB, 1)
    WebViewMB    = [math]::Round($webviewMB, 1)
    TotalMB      = [math]::Round($mainMB + $webviewMB, 1)
  }
}

if ($Watch) {
  Write-Host 'Ctrl+C で終了'
  while ($true) {
    $m = Get-MarxdownMemory
    if ($m) {
      Write-Host ("{0}  プロセス {1}  合計 {2} MB  (main {3} / webview {4})" -f `
        (Get-Date -Format 'HH:mm:ss'), $m.ProcessCount, $m.TotalMB, $m.MainMB, $m.WebViewMB)
    } else {
      Write-Host ("{0}  marxdown が起動していない" -f (Get-Date -Format 'HH:mm:ss'))
    }
    Start-Sleep -Seconds $IntervalSeconds
  }
}

$measurement = Get-MarxdownMemory
if (-not $measurement) {
  Write-Error 'marxdown が起動していない。先にアプリを起動する。'
  exit 1
}

$measurement | Format-List

# 05.performance-budget/04-targets.md §4 の目標値
Write-Host ''
Write-Host '目標（§4.4）:'
Write-Host '  起動直後 / readme.md 1 タブ            <= 120MB（許容上限 180MB）'
Write-Host '  タブ 10 枚を開いて全部閉じた後          <= 150MB（許容上限 200MB）'
Write-Host '  8 時間アイドル後                        起動直後 +10MB 以内'
