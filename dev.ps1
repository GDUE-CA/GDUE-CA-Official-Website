# =============================================================================
# dev.ps1 —— Windows PowerShell 本地开发启动脚本（DEV）
#
# DEV 铁律：
#   无 git pull、无 npm run build、无 alembic 自动迁移（迁移请手动运行 migrate.ps1）
#   在两个新 PowerShell 窗口中分别启动：
#     窗口 1（前端）：cd frontend; npm run dev
#     窗口 2（后端）：cd backend; .\venv\Scripts\Activate.ps1; python -m uvicorn app.main:app --reload
#
# 约定：
#   - 虚拟环境固定为 backend\venv，需预先手动创建，本脚本不负责创建；
#   - 子窗口统一以 -ExecutionPolicy Bypass 启动，避免 Activate.ps1 / npm.ps1 被本机执行策略拦截；
#   - 停止服务：直接关闭两个窗口，或在窗口内按 Ctrl-C。
# =============================================================================
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$FrontendDir = Join-Path $ScriptDir "frontend"
$BackendDir = Join-Path $ScriptDir "backend"
$VenvActivate = Join-Path $BackendDir "venv\Scripts\Activate.ps1"

function Write-Info($Message) { Write-Host $Message -ForegroundColor Cyan }

try {
    Write-Warning "DEVELOPMENT MODE, NO git pull, NO build, NO auto migrate"
    Write-Host "⚠️ DEVELOPMENT MODE, NO git pull, NO build, NO auto migrate" -ForegroundColor Yellow
    Write-Host "   数据库迁移请手动执行：.\migrate.ps1" -ForegroundColor Yellow

    # ---------------------------------------------------------- 前置环境检查
    if (-not (Test-Path -LiteralPath $VenvActivate)) {
        throw "未找到后端虚拟环境：$VenvActivate。`n请先手动初始化（仅首次）：`n  cd backend`n  python -m venv venv`n  .\venv\Scripts\Activate.ps1`n  pip install -r requirements.txt"
    }
    if (-not (Test-Path -LiteralPath $FrontendDir)) {
        throw "未找到前端目录：$FrontendDir，请确认脚本位于仓库根目录。"
    }
    if (-not (Get-Command pnpm -ErrorAction SilentlyContinue)) {
        throw "未找到 npm，请先安装 Node.js（含 npm）并重新打开 PowerShell。"
    }

    # ----------------------------------------------------- 窗口 1：前端 npm dev
    $feLocation = $FrontendDir.Replace("'", "''")
    $feCommand = @(
        "`$host.UI.RawUI.WindowTitle = 'GDUE-CA frontend (npm run dev)'"
        "Set-Location -LiteralPath '$feLocation'"
        "pnpm run dev"
    ) -join "; "

    Start-Process -FilePath "powershell.exe" `
        -WorkingDirectory $FrontendDir `
        -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $feCommand) | Out-Null

    # ------------------------------------------- 窗口 2：后端 venv + uvicorn reload
    $beLocation = $BackendDir.Replace("'", "''")
    $beCommand = @(
        "`$host.UI.RawUI.WindowTitle = 'GDUE-CA backend (uvicorn --reload, venv)'"
        "Set-Location -LiteralPath '$beLocation'"
        ". '.\venv\Scripts\Activate.ps1'"
        "if (-not `$env:VIRTUAL_ENV) { Write-Host '❌ venv 激活失败，已终止（绝不回退全局 Python）' -ForegroundColor Red; exit 1 }"
        "python -m uvicorn app.main:app --reload"
    ) -join "; "

    Start-Process -FilePath "powershell.exe" `
        -WorkingDirectory $BackendDir `
        -ArgumentList @("-NoExit", "-ExecutionPolicy", "Bypass", "-Command", $beCommand) | Out-Null

    Write-Host ""
    Write-Info "✅ 已在两个新窗口启动开发服务："
    Write-Info "   前端 Next.js ：http://localhost:3000"
    Write-Info "   后端 FastAPI ：http://127.0.0.1:8000（健康检查 /health）"
    Write-Host "   关闭服务：关闭对应窗口，或在窗口内按 Ctrl-C。" -ForegroundColor DarkGray
}
catch {
    Write-Host "❌发生错误：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
