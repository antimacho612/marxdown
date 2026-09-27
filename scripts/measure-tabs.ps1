<#
.SYNOPSIS
  タブを開閉した後にメモリが戻るかを測る（N-PERF-06）。

.DESCRIPTION
  手順はリーク検出の手順そのものである。
  readme.md を開いた状態を基準（M0）にし、spec.md 相当を 10 枚のタブで開閉する周回を 3 回行い、60 秒待ってから測り直す（M1）。
  判定は M1 - M0 <= 30MB。

  WebDriver は使わない。
  E2E 経由の値は 1 往復あたり +20MB で線形に増え、手計測の横ばいと矛盾する。
  判定に使えるのは人が操作したときと同じ条件の値だけである。
  そのため、開くのは argv 転送（単一インスタンス / ADR-0004）、閉じるのは SendKeys による実際の `Ctrl+W`、トレイへの格納は `WM_CLOSE` で行う。
  いずれもデバッガもドライバも介さない。

  同じファイルを 10 枚のタブでは開けない（開いているファイルはタブが増えずに切り替わる）ため、作業用のコピーを 10 個作る。

.EXAMPLE
  # 既定（10 枚 × 3 周）
  pwsh scripts/measure-tabs.ps1

.EXAMPLE
  # huge.md を 1 往復。閉じた後にメモリが戻るかを測る
  pwsh scripts/measure-tabs.ps1 -Scenario huge

.EXAMPLE
  # トレイへ格納したときに実際に減るか（TrySuspend / ADR-0007）
  pwsh scripts/measure-tabs.ps1 -Scenario suspend
#>
param(
  [ValidateSet('tabs', 'huge', 'suspend')]
  [string]$Scenario = 'tabs',
  [int]$Tabs = 10,
  [int]$Rounds = 3,
  # GC の猶予。
  [int]$SettleSeconds = 60
)

$ErrorActionPreference = 'Stop'
$root = Split-Path -Parent $PSScriptRoot
$app = Join-Path $root 'src-tauri\target\release\marxdown.exe'
$fixtures = Join-Path $root 'bench\fixtures'
$work = Join-Path $root 'bench\.tabs'

if (-not (Test-Path $app)) { throw "実行ファイルが無い: $app（先に pnpm build:app）" }
if (-not (Test-Path (Join-Path $fixtures 'readme.md'))) { throw '基準ファイルが無い（先に pnpm fixtures）' }

# 前面に出す / 閉じる要求を送る。
# SendKeys は前面のウィンドウにしか届かず、`✕`（トレイへ格納）はカスタム描画なのでクリックできない。
Add-Type @'
using System;
using System.Runtime.InteropServices;
public static class Win {
  [DllImport("user32.dll")] public static extern bool SetForegroundWindow(IntPtr hWnd);
  [DllImport("user32.dll")] public static extern IntPtr SendMessage(IntPtr hWnd, uint msg, IntPtr wParam, IntPtr lParam);
}
'@

$shell = New-Object -ComObject WScript.Shell

function Get-App {
  return Get-Process -Name marxdown -ErrorAction SilentlyContinue | Select-Object -First 1
}

function Focus-App {
  $proc = Get-App
  if (-not $proc) { throw 'marxdown が起動していない' }
  [void][Win]::SetForegroundWindow($proc.MainWindowHandle)
  Start-Sleep -Milliseconds 300
}

function Measure-Now([string]$label) {
  $json = pwsh -NoProfile -NonInteractive -File (Join-Path $PSScriptRoot 'measure-memory.ps1') -Label $label -Json
  $m = $json | ConvertFrom-Json
  '{0,-22} 合計 {1,7} MB   renderer {2,7}   gpu {3,7}' -f $label, $m.TotalMB, $m.ByType.renderer, $m.ByType.'gpu-process' | Write-Host
  return $m.TotalMB
}

# argv 転送で開く（ADR-0004）。転送側は待たない（OQ-32: シェルを保持したまま終わらない）。
function Open-Doc([string]$path, [int]$waitMs = 1500) {
  Start-Process -FilePath $app -ArgumentList $path | Out-Null
  Start-Sleep -Milliseconds $waitMs
}

function Close-Tabs([int]$count) {
  Focus-App
  for ($i = 0; $i -lt $count; $i++) {
    $shell.SendKeys('^w')
    Start-Sleep -Milliseconds 400
  }
}

# 作業用のコピー。同じファイルは 2 枚のタブにならない（開いていれば切り替わる）。
function New-Copies([string]$source, [int]$count) {
  New-Item -ItemType Directory -Force $work | Out-Null
  Get-ChildItem $work -Filter '*.md' | Remove-Item -Force
  $paths = @()
  for ($i = 1; $i -le $count; $i++) {
    $target = Join-Path $work ('doc-{0:d2}.md' -f $i)
    Copy-Item $source $target -Force
    $paths += $target
  }
  return $paths
}

Get-Process -Name marxdown -ErrorAction SilentlyContinue | Stop-Process -Force
Start-Sleep -Seconds 2

Start-Process -FilePath $app -ArgumentList (Join-Path $fixtures 'readme.md') | Out-Null
Start-Sleep -Seconds 12

Write-Host ''
Write-Host ("シナリオ: {0}" -f $Scenario)
Write-Host '------------------------------------------------------------'
$m0 = Measure-Now 'M0 (readme.md)'

switch ($Scenario) {
  'tabs' {
    $copies = New-Copies (Join-Path $fixtures 'spec.md') $Tabs
    for ($round = 1; $round -le $Rounds; $round++) {
      foreach ($path in $copies) { Open-Doc $path }
      Measure-Now ("開いた直後 ({0}周目)" -f $round) | Out-Null
      Close-Tabs $Tabs
      Measure-Now ("閉じた直後 ({0}周目)" -f $round) | Out-Null
    }
  }
  'huge' {
    # 開いて閉じる（= readme.md へ戻す）だけを 1 往復。
    Open-Doc (Join-Path $fixtures 'huge.md') 12000
    Measure-Now '開いた直後 (huge.md)' | Out-Null
    Close-Tabs 1
  }
  'suspend' {
    # `✕` と同じ経路（close.rs）。hide() + TrySuspend が走る（ADR-0007 論点 7）。
    $proc = Get-App
    [void][Win]::SendMessage($proc.MainWindowHandle, 0x0010, [IntPtr]::Zero, [IntPtr]::Zero)
  }
}

Write-Host ("{0} 秒待つ（GC の猶予）..." -f $SettleSeconds)
Start-Sleep -Seconds $SettleSeconds
$m1 = Measure-Now 'M1 (待機後)'

Write-Host '------------------------------------------------------------'
$delta = [math]::Round($m1 - $m0, 1)
Write-Host ("M1 - M0 = {0} MB" -f $delta)
if ($Scenario -eq 'suspend') {
  Write-Host '判定: 減っていれば TrySuspend が効いている（ADR-0007）'
} else {
  Write-Host ("判定: {0}（目標 <= 30MB）" -f ($(if ($delta -le 30) { 'OK' } else { '未達' })))
}
