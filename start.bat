@echo off
chcp 65001 >nul
title 单词复习系统

cd /d "%~dp0"

echo.
echo  📖 单词复习系统 - 正在启动...
echo.

:: 检查 dist 目录
if not exist "dist\index.html" (
    echo  ⚠️  dist 文件夹不存在，请先联系开发者获取完整包
    echo.
    pause
    exit /b 1
)

echo  ✅ 已就绪，正在打开浏览器...
echo  ⚠️  请允许防火墙访问（如果出现提示）
echo  📌 关闭本窗口即可停止服务
echo.

:: 打开浏览器
start http://localhost:3456

:: 使用 PowerShell 启动 HTTP 服务器（无需 Node.js / Python）
:: Windows 7 及以上自带 PowerShell + .NET
powershell -NoProfile -ExecutionPolicy Bypass -Command ^
$h = [System.Net.HttpListener]::new(); ^
$h.Prefixes.Add('http://localhost:3456/'); ^
$h.Start(); ^
Write-Host '  ✅ 服务已启动: http://localhost:3456'; ^
while ($h.IsListening) { ^
  try { ^
    $c = $h.GetContext(); ^
    $p = 'dist\' + $c.Request.Url.LocalPath.TrimStart('/').Replace('/', '\'); ^
    if ($p -eq 'dist\') { $p = 'dist\index.html'; }; ^
    if (-not (Test-Path $p)) { $p = 'dist\index.html'; }; ^
    $b = [IO.File]::ReadAllBytes($p); ^
    $ext = [IO.Path]::GetExtension($p); ^
    $t = switch ($ext) { ^
      '.html' { 'text/html; charset=utf-8' } ^
      '.js'   { 'text/javascript; charset=utf-8' } ^
      '.css'  { 'text/css; charset=utf-8' } ^
      '.json' { 'application/json; charset=utf-8' } ^
      '.png'  { 'image/png' } ^
      '.svg'  { 'image/svg+xml' } ^
      '.ico'  { 'image/x-icon' } ^
      '.woff' { 'font/woff' } ^
      '.woff2' { 'font/woff2' } ^
      default { 'application/octet-stream' } ^
    }; ^
    $c.Response.ContentType = $t; ^
    $c.Response.OutputStream.Write($b, 0, $b.Length); ^
    $c.Response.Close(); ^
  } catch { } ^
}

pause
