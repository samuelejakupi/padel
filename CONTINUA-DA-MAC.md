# Riprendere sul Mac: app iPhone, GPS e Fitbit Air

Aggiornato il 13 novembre 2026. Questo documento permette di continuare il
lavoro in una nuova chat senza avere la conversazione originale.

## Obiettivo dell'utente

Partire dalla web app TheBoyz esistente e renderla un'app iPhone con
Capacitor. Successivamente aggiungere una specie di Strava personale che
unisca il percorso GPS del telefono ai dati del Fitbit Air dell'utente.

Il telefono è un **iPhone 16e**. L'utente ha un **Mac** e vuole installare
la prima versione sul proprio telefono tramite cavo USB-C. La pubblicazione
sull'App Store non è necessaria per la prima prova e non è stata richiesta.

La prima fase è già iniziata su Windows. Si continua sul Mac perché
compilazione, firma e installazione dell'app iOS richiedono Xcode.

## Contesto del progetto

- Repository/app nella cartella `padel`, nome pacchetto `theboyz-hq`.
- Next.js 16, React 19, TypeScript e CSS custom.
- Next.js è configurato per export statico (`output: "export"`).
- Autenticazione, dati e Storage usano il backend Supabase esistente.
- `app/page.tsx` coordina le sezioni con navigazione gestita tramite stato
  interno; tipi condivisi e componenti sono anche in `app/core.tsx`,
  `app/ui.tsx`, `app/padel/`, `app/pizza/` e `app/profile/`. La divisione
  in moduli è arrivata con gli aggiornamenti remoti integrati prima del push.
- Leggere `CONVENTIONS.md` prima di modificare il codice. `LAVORI.md`
  contiene le decisioni e le attività aperte; aggiornalo quando si avanza.
- Ogni push su `main` pubblica automaticamente anche il sito su Vercel.

## Già realizzato in questa sessione

- Aggiunte dipendenze Capacitor: core e iOS 8.6.2, CLI 8.6.2,
  Splash Screen 8.0.2, Status Bar 8.0.4. Lockfile aggiornato.
- Creato `capacitor.config.json`: nome TheBoyz, bundle ID iniziale
  `it.theboyz.hq`, file web locali da `out`. Non viene caricato il sito
  remoto dentro la WebView.
- Generato il progetto Xcode in `ios/`, con Swift Package Manager.
  **Non eseguire di nuovo `cap add ios`: la piattaforma esiste già.**
- Preparati icona iOS e splash a partire dal logo esistente.
- Impostati orientamento verticale su iPhone, aspetto chiaro e gestione
  delle aree sicure coerente con il CSS esistente.
- Aggiunto `scripts/build-mobile.mjs`: genera la versione ed esegue
  la build con basePath vuoto per l'app mobile.
- Aggiunti i comandi `mobile:build`, `ios:sync` e `ios:open`.
- Il controllo automatico degli aggiornamenti web in `app/build-watcher.tsx`
  viene saltato quando gira dentro Capacitor. Un deploy del sito non
  aggiorna il codice incluso nell'app installata.
- Esclusa la cartella iOS dai controlli TypeScript ed ESLint della web app.
- Scritta la guida operativa `MOBILE.md` e aggiornati README e LAVORI.

## Verifiche già eseguite su Windows

- `npm run ios:sync`: build Next.js e copia dei file nel progetto iOS riuscite.
- `npm test`: build web riuscita e **61 test passati** dopo l'integrazione
  degli aggiornamenti remoti (38 nella verifica iniziale).
- `npm run lint`: nessun errore, tre warning nel codice esistente
  (font in `app/layout.tsx`, variabile `rankedTeams` in `app/page.tsx`
  e import `readFile` in `tests/friendly-matches.test.mjs`).
- Verificata la sintassi XML di Info.plist e LaunchScreen.storyboard;
  icona 1024 × 1024 senza trasparenza.

Non sono ancora stati verificati compilazione Swift, risoluzione dei
pacchetti in Xcode, firma, login, navigazione o comportamento su iPhone.
La build web riuscita non dimostra che queste prove iOS siano già passate.

## Primo lavoro da fare sul Mac

1. Recuperare la versione aggiornata del repository con clone o pull.
   Verificare che siano presenti questo documento, `capacitor.config.json`,
   `ios/App/App.xcodeproj` e i comandi `ios:sync` e `ios:open` in
   `package.json`. Se si trasferisce invece una copia della cartella,
   non trasferire `node_modules`, `.next` e `out` da Windows.
2. Aprire il progetto nell'app Codex sul Mac. Controllare lo stato Git
   e leggere `CONVENTIONS.md`, questo documento e `MOBILE.md`.
3. Verificare Node.js 22 o superiore e Xcode 26 o superiore; completare
   l'installazione dei componenti di Xcode. Il progetto usa SPM, non CocoaPods.
4. Dalla cartella `padel` eseguire `npm ci`.
5. Configurare `.env.local` con URL e chiave pubblica del backend del sito,
   e URL pubblico del sito, seguendo `MOBILE.md`. Questa copia Windows non
   aveva un file `.env.local`. Senza configurazione la build riesce ma
   l'app mostra la schermata di configurazione. Non salvare service role
   key, password o credenziali Fitbit nel codice o nella documentazione.
6. Eseguire:

   ```sh
   npm run ios:sync
   npm run ios:open
   ```

7. In Xcode configurare il Team e la firma automatica. Collegare l'iPhone
   16e via USB-C, autorizzare il Mac, abilitare la modalità sviluppatore
   quando richiesta, selezionare l'iPhone e premere Run. Se il bundle ID
   risulta occupato, cambiarlo sia nel target Xcode sia nella configurazione
   Capacitor. I dettagli sono in `MOBILE.md`.
8. Verificare login con account esistente, persistenza della sessione dopo
   riapertura, logout, navigazione, tacca e indicatore Home, tastiera, fogli,
   foto profilo, link esterni e recupero dopo perdita della connessione.
   Correggere i problemi osservati prima di passare al modulo sportivo.

## Fase successiva: Strava personale

La richiesta confermata è **unire GPS e dati Fitbit Air**. Le singole
funzioni sociali (bacheca del gruppo, classifiche, sfide, commenti) sono
state solo proposte: non sono ancora requisiti concordati.

Percorso di implementazione proposto, da affinare dopo la prova iOS:

1. Aggiungere una sezione Sport con registrazione di un allenamento:
   avvio, pausa, ripresa, termine, durata e punti GPS con orario.
2. Salvare i dati sul telefono durante la registrazione, anche senza rete,
   e recuperare quanto registrato dopo un'interruzione. Evitare perdita
   dell'allenamento o duplicati quando torna la connessione.
3. Scegliere e verificare un plugin nativo per GPS in background su iOS.
   Il plugin standard `@capacitor/geolocation` non supporta direttamente
   questo caso. Provare schermo bloccato, pausa/ripresa, permessi negati,
   risparmio energetico e qualità del segnale. Non promettere registrazione
   continua dopo una chiusura forzata dell'app senza averla verificata.
4. Mostrare storico, mappa, distanza e passo. Calcolare le metriche tenendo
   conto di pause, precisione e punti GPS anomali.
5. Fare una prova reale di accesso ai dati del Fitbit Air tramite account
   autorizzato, prima di costruire tutta l'integrazione. La documentazione
   consultata indica Google Health API come evoluzione della Fitbit Web API;
   ricontrollare API, disponibilità e requisiti aggiornati sul Mac.
6. Abbinare i campioni Fitbit al percorso usando gli orari, dopo la
   sincronizzazione. Esempio desiderato: mappa della corsa, passo al km,
   battiti lungo l'allenamento e riepilogo in una sola scheda.
7. Progettare la gestione delle autorizzazioni e delle credenziali OAuth
   lato backend, con accesso ai dati personali limitato al proprietario.
   Definire con l'utente cosa eventualmente rendere visibile al gruppo.

**Non sono ancora implementati:** sezione Sport, GPS, registrazione in
background, salvataggio locale degli allenamenti, nuove tabelle o RPC per
lo sport, mappe, collegamento OAuth Fitbit e sincronizzazione dei dati.
Non è stato creato alcun account sviluppatore per questa integrazione.

I battiti **in diretta** dal Fitbit durante la corsa sono un requisito da
verificare separatamente. Il percorso cloud documentato è adatto alla
sincronizzazione successiva; non equivale a uno streaming Bluetooth.
Non tutti i dati mostrati nell'app del produttore sono necessariamente
accessibili a un'app esterna.

## Messaggio da usare nella nuova chat sul Mac

> Leggi CONVENTIONS.md, CONTINUA-DA-MAC.md, MOBILE.md e la sezione iPhone
> di LAVORI.md. Vogliamo trasformare TheBoyz in un'app iOS con Capacitor
> per il mio iPhone 16e, poi aggiungere uno Strava personale che unisca
> GPS del telefono e dati del mio Fitbit Air. La base Capacitor è già
> preparata. Verifica i file presenti e aiutami a compilare e installare
> la prima versione con Xcode sul mio iPhone via USB-C; poi proseguiamo
> con la registrazione sportiva. Non considerare già implementati GPS
> e Fitbit e non pubblicare sullo store senza una richiesta.
