@echo off
REM ============================================================
REM  Cai dat va build Zitthenkne MCP Server
REM  Bam dup file nay de chay. Khong can go lenh gi.
REM ============================================================
cd /d "%~dp0"

echo.
echo === Kiem tra Node.js ===
where node >nul 2>nul
if errorlevel 1 (
  echo [LOI] Chua cai Node.js.
  echo Hay tai ban LTS tai https://nodejs.org , cai dat, roi chay lai file nay.
  echo.
  pause
  exit /b 1
)
node --version

echo.
echo === Buoc 1/2: npm install (tai cac thu vien can thiet) ===
call npm install
if errorlevel 1 (
  echo.
  echo [LOI] npm install that bai. Doc thong bao loi o tren.
  echo Neu loi mang/proxy, kiem tra ket noi internet roi chay lai.
  pause
  exit /b 1
)

echo.
echo === Buoc 2/2: npm run build (bien dich TypeScript) ===
call npm run build
if errorlevel 1 (
  echo.
  echo [LOI] Build that bai. Doc thong bao loi o tren.
  pause
  exit /b 1
)

echo.
echo ============================================================
echo  THANH CONG! Da tao thu muc dist\index.js
echo  Tiep theo: khai bao server vao Claude Desktop (xem README muc 3).
echo  Nho dat file service-account.json vao thu muc nay.
echo ============================================================
echo.
pause
