@echo off
setlocal
cd /d "%~dp0"

rem Scarica gli aggiornamenti da GitHub senza inviare niente.

echo.
echo === Stato attuale ===
git status --short
git rev-parse --abbrev-ref HEAD

echo.
echo === Scarico da GitHub ===
git pull
if errorlevel 1 goto errore

echo.
echo === Ultimi commit ===
git log --oneline -10

echo.
echo === Fatto. Sei aggiornato. ===
goto fine

:errore
echo.
echo *** Qualcosa e' andato storto. ***
echo Leggi il messaggio qui sopra. Se compare la parola CONFLICT,
echo non toccare niente e mandalo a Claude.

:fine
echo.
pause
