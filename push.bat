@echo off
setlocal
cd /d "%~dp0"

rem Invia le modifiche a GitHub nell'ordine corretto:
rem commit prima, poi pull (il rebase non funziona con modifiche non salvate),
rem poi push. Si ferma al primo errore invece di proseguire e combinare guai.
rem
rem Se non c'e' niente di nuovo da salvare non e' un errore e non e' un motivo
rem per fermarsi: i commit possono essere gia' stati fatti (per esempio da
rem Claude, che puo' committare ma non ha rete per il push). In quel caso si
rem salta il commit e si va dritti a pull e push.
rem
rem Niente blocchi fra parentesi attorno a MSG: dentro un blocco il valore
rem verrebbe letto quando il blocco viene analizzato, cioe' prima che set lo
rem scriva, e il commit partirebbe con il messaggio vuoto. Da qui le etichette.

echo.
echo === Aggiungo i file ===
git add .
if errorlevel 1 goto errore

git diff --cached --quiet
if not errorlevel 1 goto niente

set "MSG=%~1"
if "%MSG%"=="" set /p "MSG=Messaggio del commit: "
if "%MSG%"=="" set "MSG=Aggiornamento"

echo.
echo === Commit ===
git commit -m "%MSG%"
if errorlevel 1 goto errore
goto invio

:niente
echo.
echo Niente di nuovo da salvare: i commit ci sono gia', passo all'invio.

:invio
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
