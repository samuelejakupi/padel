@echo off
setlocal
cd /d "%~dp0"

rem Invia le modifiche a GitHub nell'ordine corretto:
rem commit prima, poi pull (il rebase non funziona con modifiche non salvate),
rem poi push. Si ferma al primo errore invece di proseguire e combinare guai.

set "MSG=%~1"
if "%MSG%"=="" set /p "MSG=Messaggio del commit: "
if "%MSG%"=="" set "MSG=Aggiornamento"

echo.
echo === Aggiungo i file ===
git add .
if errorlevel 1 goto errore

git diff --cached --quiet
if not errorlevel 1 (
  echo.
  echo Non c'e' niente da inviare: nessuna modifica rispetto all'ultimo commit.
  goto fine
)

echo.
echo === Commit ===
git commit -m "%MSG%"
if errorlevel 1 goto errore

echo.
echo === Scarico le modifiche di Samuele ===
git pull
if errorlevel 1 goto errore

echo.
echo === Invio ===
git push
if errorlevel 1 goto errore

echo.
echo === Fatto. La build parte tra poco. ===
goto fine

:errore
echo.
echo *** Qualcosa e' andato storto. ***
echo Leggi il messaggio qui sopra. Se compare la parola CONFLICT,
echo non toccare niente e mandalo a Claude.

:fine
echo.
pause
