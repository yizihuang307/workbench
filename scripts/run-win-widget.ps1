param()
$ErrorActionPreference = "Stop"

$root = Split-Path -Parent $PSScriptRoot
$project = Join-Path $root "desktop-widget\windows\TodayWidget.csproj"

if (-not (Get-Command dotnet -ErrorAction SilentlyContinue)) {
  Write-Error "未找到 dotnet。请先安装 .NET 8 SDK：https://dotnet.microsoft.com/download/dotnet/8.0"
}

dotnet publish $project -c Release -r win-x64 --self-contained false -o (Join-Path $root "desktop-widget\windows\publish")
$exe = Join-Path $root "desktop-widget\windows\publish\TodayWidget.exe"
if (-not (Test-Path $exe)) {
  Write-Error "便签未能编译成功。"
}
Start-Process $exe
