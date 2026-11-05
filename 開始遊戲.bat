@echo off
setlocal EnableExtensions
title DUSTLINE - Game Launcher
pushd "%~dp0" || exit /b 1

where node.exe >nul 2>&1
if errorlevel 1 goto :need_node
set "port=5173"

:check_port
set "url=http://127.0.0.1:%port%/"
rem Exit codes: 0 = this game, 1 = no listener, 2 = occupied by another service.
node.exe -e "fetch(process.argv[1], {signal: AbortSignal.timeout(1500), redirect: 'manual'}).then(r => r.text()).then(html => process.exit(html.includes('Dustline') && html.includes('radar-panel') ? 0 : 2)).catch(e => process.exit(e.cause?.code === 'ECONNREFUSED' ? 1 : 2))" "%url%"
if errorlevel 2 goto :next_port
if errorlevel 1 goto :launch
start "" "%url%"
goto :done

:next_port
set /a port+=1 >nul
if %port% LEQ 5192 goto :check_port
echo No available game port between 5173 and 5192.
goto :failed

:launch
where npm.cmd >nul 2>&1
if errorlevel 1 goto :need_node
if exist "node_modules\.bin\vite.cmd" goto :serve
echo Installing game dependencies...
call npm.cmd ci
if errorlevel 1 goto :failed

:serve
echo Starting DUSTLINE at %url%
echo Keep this window open while playing. Press Ctrl+C to stop.
call npm.cmd run dev -- --port %port% --open
if errorlevel 1 goto :failed
goto :done

:need_node
echo Install Node.js 24 with npm, then run this launcher again.
:failed
echo Unable to start DUSTLINE.
pause
popd
exit /b 1

:done
popd
exit /b 0
