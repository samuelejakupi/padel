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

### Tre agganci CSS morti
`theme-dark`, `.app-shell-hub` e `.is-open` hanno regole in `globals.css` ma
nessun JavaScript le applica più: sono avanzi di quando esisteva la schermata
di smistamento e la classifica in home si apriva sul posto. Comprese le
regole dentro i blocchi mobile. Non fanno danni, ma chi legge il CSS ci
perde tempo. Da togliere in un commit a parte, quando non c'è altro in volo.

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

### La classifica in home è un bersaglio solo
Erano tre cose da toccare nello stesso riquadro — lo switch player/team, le
righe dei giocatori e il tasto "Vedi tutti" — dove ne bastava una. Ora tutta
la card apre la classifica completa. Lo switch resta solo lì dentro e nella
pagina del ranking; in home si passa da Player a Team con lo swipe, sinistra
Player e destra Team, come se le due classifiche fossero affiancate.

Conseguenza da tenere presente: dalla home non si apre più la scheda di un
singolo giocatore toccandone la riga. Ci si arriva dalla classifica completa.
Era il prezzo per avere un bersaglio solo — dentro un tasto non ci possono
stare altri tasti, né come HTML né per chi usa VoiceOver.

L'ultima riga visibile sfuma verso il basso. Non è decorazione: tolto il
tasto "Vedi tutti", è l'unico segno che l'elenco continua.

### La striscia sotto la Dynamic Island la disegniamo noi
Era in sospeso perché sembrava una modifica di layout. Si è rivelata più
piccola del previsto: `viewport-fit: cover` più `black-translucent` portano il
viewport fino ai bordi fisici, e da lì il velo del foglio (`.sheet-backdrop`,
già `inset: 0`) copre anche l'isola senza toccarlo. Lo spazio che prima
riservava iOS lo riserva ora `env(safe-area-inset-top)` nel padding di
`.content`.

La fascia scura non sparisce, la disegna `.app-shell::before`: l'ora e le
icone di sistema restano bianche anche con la barra traslucida, quindi sopra
serve comunque qualcosa di scuro. È al 72% e non piena apposta — un colore
pieno non ha niente da sfocare, e la striscia sarebbe rimasta l'unica zona
nitida dello schermo, che era esattamente il difetto da togliere.

Restano scoperti i lati in orizzontale: con `cover` il padding laterale di
`.content` non tiene conto di `safe-area-inset-left/right`. In verticale non
si vede, e il telefono si usa così.

### Lo scorrimento laterale non muove più nulla dove non porta da nessuna parte
Complemento della decisione qui sotto. La navigazione era stata tolta, ma il
trascinamento restava attivo con resistenza elastica: in Padel, Pizza e
Profilo la pagina si spostava comunque di lato scoprendo lo sfondo, e
sembrava un difetto invece di un limite. Ora il gesto non parte proprio se
`mobileDestination` non trova un'uscita in nessuna delle due direzioni.
Negli archivi l'elastico resta sulla direzione cieca: lì la resistenza
significa qualcosa, perché nell'altro verso il gesto funziona davvero.

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
