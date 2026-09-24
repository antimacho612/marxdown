<#
.SYNOPSIS
  CLI シムが起動に足す時間を測る（measurements/08-distribution.md §2）。

.DESCRIPTION
  起動元を呼んでから marxdown.exe のプロセスが生成されるまでの実時間を、起動経路ごとに測って中央値を出す。
  測るのは T0 より前の区間である。Cold Start / Warm Start の計測（bench-startup.mjs）には現れない。

  アプリは `-n --trace-startup nul --exit-after-trace` で起動し、描画が終わると自分で終了する。
  計測のたびにウィンドウが一瞬表示される。

  Git Bash の経路は `C:\Program Files\Git\bin\bash.exe` があるときだけ測る。

.EXAMPLE
  # ビルド成果物のシム（target/release/bin）で測る
  pwsh scripts/measure-cli-shim.ps1

.EXAMPLE
  # インストール済みのものを測る
  pwsh scripts/measure-cli-shim.ps1 -Release "$env:LOCALAPPDATA\Marxdown" -Runs 10
#>
param(
  [string]$Release = (Join-Path $PSScriptRoot '..\src-tauri\target\release'),
  [int]$Runs = 8
)

$Release = (Resolve-Path $Release).Path
$exe = Join-Path $Release 'marxdown.exe'
$bin = Join-Path $Release 'bin'
if (-not (Test-Path (Join-Path $bin 'marxdown.cmd'))) {
  throw "CLI シムが無い: $bin（pnpm build でリソースとして置かれる）"
}

$work = Join-Path ([IO.Path]::GetTempPath()) 'marxdown-measure-cli-shim'
New-Item -ItemType Directory -Force -Path $work | Out-Null
Set-Content -Encoding utf8 -Path (Join-Path $work 'sample.md') -Value '# CLI シムの計測'

$appArgs = '-n --trace-startup nul --exit-after-trace sample.md'
$routes = [ordered]@{
  'exe を直接'           = @{ file = $exe; args = $appArgs }
  'cmd /c exe'          = @{ file = 'cmd.exe'; args = "/d /c `"`"$exe`" $appArgs`"" }
  'cmd /c marxdown.cmd' = @{ file = 'cmd.exe'; args = "/d /c `"`"$bin\marxdown.cmd`" $appArgs`"" }
}
$bash = 'C:\Program Files\Git\bin\bash.exe'
if (Test-Path $bash) {
  $binPosix = '/' + $bin.Replace(':', '').Replace('\', '/')
  $routes['bash -c exe'] = @{ file = $bash; args = "-c `"'$binPosix/../marxdown.exe' $appArgs`"" }
  $routes['bash -c marxdown'] = @{ file = $bash; args = "-c `"'$binPosix/marxdown' $appArgs`"" }
}

function Wait-AppExit {
  Get-Process marxdown -ErrorAction SilentlyContinue |
    Where-Object { $_.Path -eq $exe } |
    ForEach-Object { $_.WaitForExit(15000) | Out-Null }
}

foreach ($name in $routes.Keys) {
  $samples = foreach ($i in 1..$Runs) {
    $psi = [Diagnostics.ProcessStartInfo]::new($routes[$name].file, $routes[$name].args)
    $psi.UseShellExecute = $false
    $psi.CreateNoWindow = $true
    $psi.WorkingDirectory = $work

    # Start-Process -Wait は子孫のプロセスまで待つため使わない。シムが切り離したアプリの終了まで待ってしまう。
    $t0 = [DateTime]::Now
    $launcher = [Diagnostics.Process]::Start($psi)
    $app = $null
    $deadline = $t0.AddSeconds(10)
    while (-not $app -and [DateTime]::Now -lt $deadline) {
      $app = Get-Process marxdown -ErrorAction SilentlyContinue |
        Where-Object { $_.Path -eq $exe -and $_.StartTime -ge $t0.AddMilliseconds(-5) } |
        Select-Object -First 1
    }
    if ($app) { ($app.StartTime - $t0).TotalMilliseconds }

    $launcher.WaitForExit(15000) | Out-Null
    Wait-AppExit
    Start-Sleep -Milliseconds 300
  }

  $sorted = @($samples | Sort-Object)
  if ($sorted.Count -eq 0) {
    '{0,-20} 計測できなかった' -f $name
    continue
  }
  $median = $sorted[[int][Math]::Floor($sorted.Count / 2)]
  '{0,-20} n={1} median={2,6:N1}ms  min={3,6:N1}ms  max={4,6:N1}ms' -f $name, $sorted.Count, $median, $sorted[0], $sorted[-1]
}
