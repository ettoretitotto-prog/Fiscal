@echo off
title Fiscal - Avvio Servizi
cd /d "%~dp0"

echo ============================================
echo    FISCAL - Avvio Servizi
echo    LocalPort Watcher + Receipt Processor
echo ============================================
echo.

start "Fiscal Watcher"   node localport-watcher.js
start "Fiscal Processor" node receipt-processor.js

echo.
echo ✅ Entrambi i servizi sono stati avviati.
echo    Ogni servizio si e' aperto in una finestra separata.
echo.
echo Per fermare i servizi, chiudi le finestre dei singoli servizi.
echo.
pause