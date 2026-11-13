# TheBoyz su iPhone

La prima versione Capacitor include la web app esistente nel progetto iOS.
I file dell'interfaccia sono locali; accesso e dati richiedono la connessione
al backend esistente. GPS, registrazione degli allenamenti e collegamento
Fitbit non sono ancora implementati.

## Prima installazione su iPhone 16e

Servono un Mac, Node.js 22 o superiore, Xcode 26 o superiore e un cavo USB-C
che supporti il trasferimento dati. Apri Xcode almeno una volta e completa
l'installazione dei componenti richiesti. Il progetto usa Swift Package
Manager: CocoaPods non serve.

1. Copia la cartella del progetto sul Mac, oppure recupera il branch che
   contiene queste modifiche. Non copiare `node_modules`, `.next` e `out`
   da Windows: le dipendenze vanno installate sul Mac.
2. Nel terminale, entra nella cartella `padel` ed esegui `npm ci`.
3. Crea `.env.local` nella stessa cartella, usando Project URL e chiave
   pubblica dello stesso progetto backend usato dal sito:

   ```dotenv
   NEXT_PUBLIC_SUPABASE_URL=https://IL-PROGETTO.supabase.co
   NEXT_PUBLIC_SUPABASE_ANON_KEY=LA-CHIAVE-PUBBLICA
   NEXT_PUBLIC_SITE_URL=https://IL-DOMINIO-DEL-SITO
   ```

   Non usare service role key o password. Il file non va committato.
   Le variabili `NEXT_PUBLIC_*` sono incluse nella build e sono pubbliche.
   Senza URL e chiave l'app mostra la schermata di configurazione.
4. Prepara l'app e apri il progetto:

   ```sh
   npm run ios:sync
   npm run ios:open
   ```

5. In Xcode seleziona il progetto **App**, poi il target **App** e
   **Signing & Capabilities**. Attiva **Automatically manage signing** e
   seleziona il tuo **Team**. Puoi aggiungere il tuo account Apple in
   **Xcode > Settings > Accounts**. Il bundle identifier iniziale è
   `it.theboyz.hq`: se Xcode lo segnala già occupato, scegline uno univoco
   e aggiorna anche `appId` in `capacitor.config.json`.
6. Collega e sblocca l'iPhone; autorizza il Mac quando richiesto. Attiva
   **Impostazioni > Privacy e sicurezza > Modalità sviluppatore** e
   completa l'eventuale riavvio. Se la voce manca, prova prima ad avviare
   l'app da Xcode e segui la richiesta sul telefono.
7. Seleziona il tuo iPhone come destinazione in Xcode e premi **Run**.
   Se richiesto da iOS, autorizza il profilo sviluppatore in
   **Impostazioni > Generali > VPN e gestione dispositivo**.

L'app resta installata quando stacchi il cavo. Con il Personal Team gratuito
la firma di sviluppo ha durata limitata: Xcode può richiedere una nuova
installazione. Non occorre pubblicare sull'App Store per questa prova.

## Aggiornamenti

Dopo una modifica al codice o alle variabili di ambiente:

```sh
npm run ios:sync
npm run ios:open
```

Poi premi nuovamente Run in Xcode. `ios:sync` ricostruisce sempre i file
prima di copiarli. Il comando di build mobile forza il basePath vuoto,
anche se il sito usa un prefisso per GitHub Pages. La build del sito resta
`npm run build`.

Il controllo degli aggiornamenti web è disattivato dentro Capacitor: i
deploy del sito non sostituiscono automaticamente il codice installato.
Le cartelle `ios/App/App/public` e le configurazioni generate da Capacitor
sono escluse da Git; il progetto Xcode, gli asset e Package.swift si
conservano invece nel repository. Non aggiungere nuovamente la piattaforma
con `cap add ios`: esiste già.

## Verifica sul telefono

- Accesso con un account esistente, chiusura e riapertura dell'app,
  persistenza della sessione e logout.
- Navigazione tra le sezioni e apertura dei fogli, senza elementi coperti
  dalla tacca, dalla tastiera o dall'indicatore Home.
- Link esterni (mappe, club e pagamenti) e selezione della foto profilo.
- Comportamento senza rete e recupero al ritorno della connessione.

La build JavaScript e la sincronizzazione si possono verificare su Windows;
compilazione Swift, firma e comportamento iOS richiedono Xcode e un iPhone
o simulatore. Non sono verificati dalla sola build web.

## Prossima fase: Sport

Prima si verifica questa base sul telefono. Poi si aggiungono registrazione
GPS con salvataggio locale e recupero delle interruzioni, storico e mappe.
Per lo schermo bloccato serve un plugin dedicato al GPS in background:
il plugin standard `@capacitor/geolocation` non basta. I permessi relativi
verranno aggiunti quando la funzione sarà presente.

Il collegamento Fitbit richiederà autorizzazione dell'account, un backend
per gestire le credenziali dell'integrazione e una prova dei dati disponibili.
L'abbinamento al percorso avverrà tramite gli orari dopo la sincronizzazione;
i battiti in diretta restano da verificare separatamente.

Riferimenti: [requisiti Capacitor](https://capacitorjs.com/docs/getting-started/environment-setup),
[modalità sviluppatore iOS](https://developer.apple.com/documentation/xcode/enabling-developer-mode-on-a-device),
[account Apple per test personali](https://developer.apple.com/help/account/basics/about-your-developer-account).
