# Docker 一键打包推送脚本
# 用法: .\docker-build.ps1 [版本号]
# 示例: .\docker-build.ps1 1.0.0
#       .\docker-build.ps1  (自动读取 VERSION 文件)

param(
    [string]$Version = "",
    [string]$DockerUser = "alanhgh",
    [string]$ImageName = "fresh-api",
    [switch]$NoPush = $false,
    [switch]$MultiArch = $false
)

$ErrorActionPreference = "Stop"

# 颜色输出函数
function Write-Info { Write-Host "[INFO] $args" -ForegroundColor Cyan }
function Write-Success { Write-Host "[SUCCESS] $args" -ForegroundColor Green }
function Write-Warn { Write-Host "[WARN] $args" -ForegroundColor Yellow }
function Write-Err { Write-Host "[ERROR] $args" -ForegroundColor Red }

# 获取版本号
if ([string]::IsNullOrEmpty($Version)) {
    if (Test-Path "VERSION") {
        $Version = (Get-Content "VERSION" -Raw).Trim()
        Write-Info "从 VERSION 文件读取版本号: $Version"
    } else {
        Write-Err "未指定版本号且 VERSION 文件不存在"
        exit 1
    }
}

$FullImageName = "${DockerUser}/${ImageName}"
Write-Info "镜像名称: $FullImageName"
Write-Info "版本号: $Version"

# 检查 Docker 是否运行
try {
    docker info | Out-Null
} catch {
    Write-Err "Docker 未运行，请先启动 Docker Desktop"
    exit 1
}

# 检查是否已登录 Docker Hub
Write-Info "检查 Docker Hub 登录状态..."
$loginCheck = docker info 2>&1 | Select-String "Username"
if (-not $loginCheck) {
    Write-Warn "未登录 Docker Hub，请先登录"
    docker login
    if ($LASTEXITCODE -ne 0) {
        Write-Err "Docker Hub 登录失败"
        exit 1
    }
}

if ($MultiArch) {
    # 多架构构建 (amd64 + arm64)
    Write-Info "开始多架构构建 (amd64 + arm64)..."

    # 创建 buildx builder (如果不存在)
    $builderExists = docker buildx ls | Select-String "multiarch-builder"
    if (-not $builderExists) {
        Write-Info "创建 buildx builder..."
        docker buildx create --name multiarch-builder --use
    } else {
        docker buildx use multiarch-builder
    }

    # 构建并推送
    Write-Info "构建并推送多架构镜像..."
    docker buildx build `
        --platform linux/amd64,linux/arm64 `
        -t "${FullImageName}:${Version}" `
        -t "${FullImageName}:latest" `
        --push `
        .

    if ($LASTEXITCODE -ne 0) {
        Write-Err "多架构构建失败"
        exit 1
    }

    Write-Success "多架构镜像构建并推送成功!"
} else {
    # 单架构构建
    Write-Info "开始构建镜像..."
    docker build -t "${FullImageName}:${Version}" -t "${FullImageName}:latest" .

    if ($LASTEXITCODE -ne 0) {
        Write-Err "镜像构建失败"
        exit 1
    }

    Write-Success "镜像构建成功!"

    # 推送镜像
    if (-not $NoPush) {
        Write-Info "推送镜像到 Docker Hub..."

        docker push "${FullImageName}:${Version}"
        if ($LASTEXITCODE -ne 0) {
            Write-Err "推送版本标签失败"
            exit 1
        }

        docker push "${FullImageName}:latest"
        if ($LASTEXITCODE -ne 0) {
            Write-Err "推送 latest 标签失败"
            exit 1
        }

        Write-Success "镜像推送成功!"
    } else {
        Write-Warn "跳过推送 (使用了 -NoPush 参数)"
    }
}

Write-Host ""
Write-Success "=========================================="
Write-Success "构建完成!"
Write-Success "镜像: ${FullImageName}:${Version}"
Write-Success "镜像: ${FullImageName}:latest"
Write-Success "=========================================="
