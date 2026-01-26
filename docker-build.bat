@echo off
chcp 65001 >nul
setlocal enabledelayedexpansion

echo ==========================================
echo   Docker 一键打包推送脚本
echo   镜像: alanhgh/fresh-api
echo ==========================================
echo.

cd /d "%~dp0"

:: 读取版本号
if exist VERSION (
    set /p VERSION=<VERSION
    echo [INFO] 版本号: !VERSION!
) else (
    echo [ERROR] VERSION 文件不存在
    pause
    exit /b 1
)

:: 检查 Docker
docker info >nul 2>&1
if errorlevel 1 (
    echo [ERROR] Docker 未运行，请先启动 Docker Desktop
    pause
    exit /b 1
)

set IMAGE=alanhgh/fresh-api

echo.
echo [INFO] 开始构建镜像...
docker build -t %IMAGE%:!VERSION! -t %IMAGE%:latest .

if errorlevel 1 (
    echo [ERROR] 构建失败
    pause
    exit /b 1
)

echo.
echo [SUCCESS] 构建成功!
echo.

set /p PUSH="是否推送到 Docker Hub? (Y/N): "
if /i "!PUSH!"=="Y" (
    echo.
    echo [INFO] 推送 %IMAGE%:!VERSION!...
    docker push %IMAGE%:!VERSION!

    echo [INFO] 推送 %IMAGE%:latest...
    docker push %IMAGE%:latest

    echo.
    echo [SUCCESS] 推送完成!
)

echo.
echo ==========================================
echo   完成! 镜像: %IMAGE%:!VERSION!
echo ==========================================
pause
