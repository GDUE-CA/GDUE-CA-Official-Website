# =============================================================================
# migrate.ps1 —— Windows PowerShell 数据库迁移脚本（仅此一件事）
#
# 进入 backend -> 激活 .\venv -> python -m alembic upgrade head
# 不做 git pull、不做构建。venv 需预先手动创建，本脚本不负责创建虚拟环境。
# =============================================================================
$ErrorActionPreference = "Stop"

$ScriptDir = Split-Path -Parent $MyInvocation.MyCommand.Definition
$BackendDir = Join-Path $ScriptDir "backend"
$VenvActivate = Join-Path $BackendDir "venv\Scripts\Activate.ps1"

try {
    if (-not (Test-Path -LiteralPath $VenvActivate)) {
        throw "未找到后端虚拟环境：$VenvActivate。`n请先手动初始化（仅首次）：`n  cd backend`n  python -m venv venv`n  .\venv\Scripts\Activate.ps1`n  pip install -r requirements.txt"
    }

    Set-Location -LiteralPath $BackendDir

    # 在同一会话内点源激活，激活状态对后续 python 命令立即生效
    . ".\venv\Scripts\Activate.ps1"

    if (-not $env:VIRTUAL_ENV) {
        throw "虚拟环境激活失败（VIRTUAL_ENV 为空），请确认 backend\venv 完整性。"
    }

    Write-Host "使用 Python：$(python -c 'import sys; print(sys.executable)')" -ForegroundColor DarkGray
    python -m alembic upgrade head
    # 原生程序非零退出不会触发 $ErrorActionPreference=Stop，必须显式检查
    if ($LASTEXITCODE -ne 0) {
        throw "alembic upgrade head 失败（退出码 $LASTEXITCODE）"
    }

    Write-Host "✅ Database migration done" -ForegroundColor Green
}
catch {
    Write-Host "❌迁移失败：$($_.Exception.Message)" -ForegroundColor Red
    exit 1
}
