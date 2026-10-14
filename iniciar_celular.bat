@echo off
title Ritmos — Conectar Celular / iPhone
echo ============================================================
echo   📱 INICIANDO CONEXION SEGURA HTTPS PARA CELULAR / IPHONE
echo ============================================================
echo.
echo Obteniendo contrasena de verificacion...
powershell -Command "Write-Host 'Tu contrasena de acceso es: ' -NoNewline; (Invoke-RestMethod -Uri 'https://loca.lt/mytunnelpassword').Trim()"
echo.
echo Iniciando tunel HTTPS...
echo Abre el enlace que aparecera a continuacion en Safari/Chrome de tu celular.
echo.
npx localtunnel --port 8000
pause
