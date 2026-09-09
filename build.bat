@echo off
REM 编译 snake.c 为 snake.exe
REM 优先尝试 MinGW gcc，备选 MSVC cl，最后回退到任意 gcc

setlocal

where gcc >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo [build] 用 gcc 编译 ...
  gcc snake.c -o snake.exe -std=c99 -O2
  if exist snake.exe (
    echo [build] 编译成功 -> snake.exe
    exit /b 0
  )
)

where cl >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo [build] 用 cl 编译 ...
  cl /nologo /O2 /std:c11 snake.c /Fe:snake.exe
  if exist snake.exe (
    echo [build] 编译成功 -> snake.exe
    exit /b 0
  )
)

where tcc >nul 2>&1
if %ERRORLEVEL% EQU 0 (
  echo [build] 用 tcc 编译 ...
  tcc snake.c -o snake.exe
  if exist snake.exe (
    echo [build] 编译成功 -> snake.exe
    exit /b 0
  )
)

echo [build] 没找到任何 C 编译器，请安装 MinGW 或 MSVC 后再试。
exit /b 1