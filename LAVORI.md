# Stato dei lavori · TheBoyz

Questo file esiste perché il progetto lo portiamo avanti in due, da computer
diversi e in momenti diversi. Il codice racconta *cosa* fa l'app; qui sta il
*perché* delle scelte e cosa è rimasto aperto — le due cose che altrimenti si
perdono passando da una sessione all'altra.

**Aggiornarlo fa parte del lavoro.** Quando chiudi qualcosa, spostala da
"in sospeso" a "deciso". Quando scarti una strada, scrivi perché: serve a non
ripercorrerla fra un mese.

Ultimo aggiornamento: 6 agosto 2026

---

## In sospeso

### Sfocatura sotto la Dynamic Island
Richiesta: quando si apre il foglio dal basso, sfocare anche la striscia in
alto. Oggi non è possibile: la web app dichiara la barra di stato opaca,
quindi il contenuto parte sotto e nessun effetto CSS ci arriva. Servirebbe
`viewport-fit: cover` più barra traslucida, che però sposta in alto tutto il
layout (intestazioni, safe-area, schermata di caricamento). Da valutare a
parte, non è un ritocco.

### Segnaposto da sostituire
Le icone animate di Flaticon sono provvisorie e caricate dal loro sito:
il trofeo del primo in classifica, la medaglia del podio pizza. Quando
arriveranno quelle definitive va tolto anche `mix-blend-mode: multiply`, che
serve solo a mascherare il loro fondo bianco.

### Notifiche push per le votazioni pizza
Concordate ma non fatte. Richiedono service worker, chiavi VAPID e una Edge
Function su Supabase che le invii; su iPhone funzionano solo con la web app
salvata sulla schermata Home. Per ora c'è il pallino sull'icona Pizza.

---

## Deciso, e perché

### Vercel è l'hosting di produzione
GitHub Pages compilava il progetto in circa trenta secondi ma diverse consegne
restavano bloccate fino al limite rigido di dieci minuti. Il 6 agosto 2026 il
progetto è stato migrato su Vercel, che pubblica automaticamente `main` e crea
anteprime per gli altri branch. Pages rimane solo come fallback manuale.

### Il Padel è la home
Non c'è più una schermata di smistamento: si entra nel court. Partite e
classifica si aprono in un foglio dal basso, non in pagine separate, quindi la
voce "Padel" nella barra è una sola.

### Parimerito densi (1, 1, 2)
Due primi a pari punti sono entrambi primi e chi segue è secondo. Nello sport
si usa spesso 1, 1, 3, ma qui la posizione è un gradino del podio, non un
piazzamento.

### Il podio si legge dall'anello, non dal fondo della riga
Oro, argento e bronzo sono un anello metallico attorno all'avatar. Colorare il
fondo delle righe era stato provato e scartato: con le righe adiacenti tre
fondi diversi spezzavano l'elenco invece di ordinarlo.

### Punteggio pizza: media pesata su 100
I pesi vengono dalle vecchie scale (21 location, 30 pizza, 12 dolce, 30
prezzo) riportate a 100 senza il bonus: 23, 32, 13, 32. Il bonus Fabio non è
più un punteggio ma un badge, positivo o negativo, che non entra nel totale.

### La media della votazione è nascosta dal database
Finché la sessione è aperta, i voti altrui si vedono solo se hai votato. Non è
una regola dell'interfaccia: è una policy, altrimenti basterebbe guardare le
chiamate di rete.

### Le partite non si eliminano
Si correggono, con un motivo facoltativo, e ogni correzione finisce in uno
storico consultabile. Uno storico che si può riscrivere non è uno storico:
`match_events` non ammette modifiche né cancellazioni.

### Niente scorrimento laterale fra le sezioni
Cambiava sezione per sbaglio mentre si leggeva. Resta solo il ritorno indietro
dagli archivi.

### Opacità sul gruppo, mai sul colore del tratto
Vale per tutte le icone disegnate a mano: un colore semitrasparente fa sommare
le trasparenze negli incroci e si vedono zone più scure. Si compone l'icona
piena e poi si sbiadisce tutta insieme.

---

## Come si lavora

- **Prima di iniziare**: `git pull`. Metà dei conflitti di oggi nascevano da
  lavori partiti da una base vecchia di ore.
- **Per pubblicare**: `git add . && git commit -m "..." && git pull && git push`
- **Accumulare le modifiche**: un push ogni tanto invece di uno per ritocco.
  Costa meno tempo e sta sotto il limite orario di Pages.
- **Le regole di stile** stanno in `STYLE.md`. Vanno lette prima di aggiungere
  un colore, un raggio o una spaziatura nuovi.
- **Migrazioni Supabase**: i file in `supabase/` si eseguono a mano nel SQL
  Editor. Sono idempotenti, rilanciarli non rompe nulla.

### Divisione del lavoro
Dani si occupa in prevalenza della vista mobile, Samuele del resto. Il CSS lo
permette davvero, perché il mobile vive quasi tutto dentro i blocchi
`@media (max-width: 780px)`. `app/page.tsx` invece è condiviso: lì i conflitti
sono inevitabili, e l'unico rimedio è pullare spesso e fare commit piccoli.
