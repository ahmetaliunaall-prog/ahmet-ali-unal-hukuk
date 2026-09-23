@echo off
chcp 65001 >nul
title Hukuk Portali - Otomatik Kontrol
cd /d "%~dp0"

where node >nul 2>nul
if errorlevel 1 goto no_node

echo Hukuk Portali kontrol ediliyor...
echo.
node --version
call npm test
if errorlevel 1 goto failed

echo.
echo BASARILI: Tum otomatik testler gecti.
echo Bu sonuc kod kontrollerini gosterir; canli Supabase veya Cloudflare baglantisini test etmez.
goto finish

:no_node
echo Node.js bu bilgisayarda bulunamadi.
echo Once https://nodejs.org adresinden LTS surumunu kurun, sonra bu dosyayi yeniden acin.
goto finish

:failed
echo.
echo Bazi kontroller basarisiz oldu. Ekranin fotografini alip yardim isteyin.

:finish
echo.
pause
