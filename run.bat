@echo off
REM 一键编译并运行 snake 游戏（需要 Windows + MinGW/MSVC/TCC 任一 C 编译器）

if not exist snake.exe (
  call build.bat
  if errorlevel 1 (
    echo [run] 编译失败，无法运行
    pause
    exit /b 1
  )
)

echo [run] 启动 snake.exe ...
snake.exe