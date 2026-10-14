@echo off
REM ===========================================================================
REM dev.bat —— dev.ps1 的入口（本文件不含其他逻辑，仅转调 PowerShell 脚本）
REM 双击或命令行执行均可；自动以 Bypass 策略运行同目录 dev.ps1。
REM ===========================================================================
powershell.exe -NoProfile -ExecutionPolicy Bypass -File "%~dp0dev.ps1"
if %ERRORLEVEL% NEQ 0 (
    echo.
    echo dev.ps1 exited with errors. Press any key to close...
    pause >nul
)
