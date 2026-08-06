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

**La sfumatura sotto è stata tolta.** Doveva dire "l'elenco continua", ma
nell'anteprima le righe sono tre e finiscono lì: sfumare un'intera riga per
promettere un seguito che in quella card non c'è la rendeva soltanto più
difficile da leggere. L'invito ad aprire ora è la card stessa, che si alterna
da sola e chiede di essere toccata.

**Si alterna da sola ogni cinque secondi.** Singolo e Squadra si scambiano
all'infinito con lo stesso movimento del dito — la home mostra tutte e due le
classifiche senza che nessuno la tocchi. Si ferma dove girare a vuoto non
avrebbe senso: fuori dalla home, con un foglio aperto, a scheda nascosta, o
quando il sistema chiede meno animazioni. E si ferma **per sempre** al primo
gesto sulla card: da lì comanda il dito, e continuare a cambiargliela sotto
sarebbe solo fastidioso.

Il riflesso sugli anelli del podio (`medal-sheen`) è agganciato all'arrivo, non
al momento del cambio: mentre l'elenco scivola dentro resta in pausa
(`.is-ranking-entering`) e riparte quando la classifica è al suo posto. Acceso
a metà corsa passerebbe inosservato, ed è lì proprio per dire "ecco la
classifica".

Le due si chiamano **Classifica Elo - Singolo** e **Classifica Elo - Squadra**,
non più Player e Team, e la stessa etichetta con lo stesso stile fa da titolo
al foglio: aprendolo il testo non deve cambiare faccia, deve sembrare lo
stesso che si è ingrandito. `.sheet-head h2` segue perciò la regola di
`.side-head h2` invece di averne una sua.

**Il cambio automatico si mette in pausa, non si spegne.** Prima bastava un
tocco e la card restava ferma per sempre; ora aspetta cinque secondi dopo
l'ultimo tocco e riprende. Se il dito è ancora appoggiato mentre scade il
timer, il giro si rimanda: strappare la classifica di mano a metà gesto era
il difetto da evitare.

Il nodo della card sta in uno `useState` e non in un `useRef`. Cambiando
sezione dalla barra la card viene smontata, e al ritorno è un elemento nuovo:
con un ref i listener del gesto restavano appesi a quello vecchio e la card
tornava muta — non rispondeva più nemmeno allo swipe fatto a mano. Con lo
stato l'effetto si riesegue e li riattacca.

### In home la classifica mostra le tre righe attorno a te
Non più le prime tre. Primo in classifica vedi comunque 1-2-3 perché sopra non
c'è niente, quinto vedi 4-5-6, ultimo vedi gli ultimi tre. La finestra la
calcola `rankingWindowStart`, e la posizione va letta sull'elenco intero
(`ranks[start + index]`): sulla finestra la prima riga direbbe sempre "1".

Per le squadre il centro non è ovvio, perché di coppie se ne può avere più
d'una in corso e nessuna è "la propria". Il riferimento è **l'ultima con cui
si è scesi in campo**: si scorrono le partite dalla più recente, si prende la
prima in cui compare chi guarda, e si cerca la squadra formata da quei due.
Le partite in singolo si saltano — non dicono niente sulle coppie.

### La card delle partite in home è un'anteprima, non un elenco
Due partite su una riga sola: data, le due coppie coi nomi in linea separati
da virgola, punteggio in mezzo. Cadono miniatura del video, campo e punti Elo,
che a quella misura sono segni e non informazioni. Il contorno dell'avatar
dice com'è finita — verde chi vince, rosso chi perde — al posto del bianco e
della scritta VITTORIA, che su una riga sola non ci stava.

Come per la classifica, tutto il riquadro è un bersaglio solo e apre il
foglio: le singole partite non portano più in modifica, ci si passa da lì.
Il tasto "Nuova partita" è uscito dal riquadro e sta fra la classifica e le
partite. Attenzione ai suoi margini: `.cta-in-panel` ne porta di suoi, che
servivano quando stava dentro al riquadro e qui si sommavano al gap della
colonna — da cui `.cta-in-panel.cta-between`, due classi per poterli azzerare.

**Vale solo sotto i 780px.** Su computer la card resta com'era, comprese le
anteprime e la modifica al tocco. La differenza non è solo di stile ma di
comportamento, e il CSS da solo non basta: da qui `useIsPhone`, che parte da
`false` e si corregge al primo effetto — durante la generazione statica non
c'è finestra da misurare, e la home compare comunque solo dopo i dati.

### Il foglio delle partite si apre sui mesi
Le partite si accumulano, e scorrerne cento per arrivare a maggio non è
cercare, è rassegnarsi. Il foglio si apre quindi con dei raccoglitori — un
mese ciascuno, col numero di partite dentro — tutti chiusi. Se ne apre uno per
volta: aprendone un altro il primo si chiude.

L'altezza è animata a mano perché da `0` ad `auto` il browser non sa
interpolare: si misura il contenuto, si va da una misura all'altra, e appena
arrivati si torna ad `auto`, se no un elenco che cambia resterebbe tagliato
sulla misura vecchia. Aperture più lente delle chiusure (420ms contro 280ms):
entrando c'è qualcosa da guardare arrivare, uscendo si toglie di mezzo.

In alto a destra lo switch fra tutte le partite e le proprie, con la faccia di
chi guarda al posto del secondo glifo. Cambiando insieme cambiano mesi e
conteggi, quindi si riparte da tutti chiusi.

### Il riflesso sugli anelli del podio gira invece di attraversare
Era una diagonale che scorreva, con una sosta fra un passaggio e l'altro. Su
una cosa tonda un riflesso in linea retta si vede per quello che è: una
striscia passata sopra. Ora è una maschera conica che ruota (`medal-orbit`,
7s lineari): l'arco acceso segue il bordo. Niente soste — un riflesso che
accelera, frena e aspetta richiama l'occhio a ogni ripartenza, mentre così
resta un fondo che si muove.

### Il foglio della classifica è stato alleggerito
Via il selettore di stagione: il foglio mostra la stagione in corso e basta,
lo storico troverà casa nel profilo. Via anche la maniglia in cima — diceva
"questo pannello si trascina", ma lo dicono già la forma e il fatto che si
muova appena lo tocchi.

`.dashboard-side` ora è `align-self: start`. La griglia allunga le celle, e
finché in fondo alla card c'era il tasto "Vedi tutti" spinto giù da
`margin-top: auto` quello spazio era occupato; tolto il tasto restava mezzo
riquadro di bianco sotto la terza riga.

**Attenzione a quella riga su mobile**, e ci siamo cascati: sotto i 780px la
home non è una griglia ma una colonna flex (`.dashboard-grid` diventa
`display: flex`), e in una colonna `align-self` guarda il lato corto, cioè la
larghezza. La card si è ristretta sul suo contenuto finché non l'abbiamo
rimessa a `stretch` nel blocco mobile. Il vuoto in fondo lì non veniva dalla
griglia — l'altezza era già quella del contenuto — ma dal padding inferiore
della card sommato al margine dell'elenco: ora sono `--space-3` e zero.

Il titolo del foglio e i due tasti dello switch stanno sulla stessa mezzeria
(`.sheet-head` è `align-items: center`): da quando il titolo è un'etichetta
bassa e maiuscola, allineare in alto lo lasciava appeso sopra i tasti.

### La barra del menu non somma più la safe area
Stava a `calc(11px + env(safe-area-inset-bottom))`. Con la barra di stato
opaca quel valore era zero e non si notava; da quando c'è `viewport-fit:
cover` è diventato l'altezza della zona dell'indicatore Home e la barra si era
alzata di una trentina di pixel da sola. Ora sono 11px fissi, gli stessi che
ha ai lati: è una pastiglia che galleggia e deve stare staccata dello stesso
tanto da tutte le parti.

### Rotazione bloccata in verticale
`"orientation": "portrait"` nel manifest. Vale dove il manifest viene
rispettato, cioè le web app su Android. **iOS lo ignora**: dal web non c'è
modo di bloccare la rotazione su iPhone, né col manifest né con
`screen.orientation.lock`, che Safari non implementa. Lì l'unica leva è il
blocco rotazione del telefono, dal Centro di Controllo.

**Lo swipe poi è stato rifatto perché segua il dito.** Prima decideva tutto al
`touchend`: fino al rilascio non si muoveva niente e la pagina intanto
continuava a scorrere su e giù, che era la cosa fastidiosa. Ora l'elenco è
dentro una finestra che ritaglia (`.ranking-preview-list`) e su un nastro che
si sposta (`.ranking-preview-track`), scritto direttamente sullo stile e non
passando da uno stato React: un valore di stato per ogni pixel di dito
ridisegnerebbe la schermata a ogni frame.

Due cose che non erano evidenti prima di farlo:

- i gestori sono **listener nativi non passivi**, non gli `onTouch` di React.
  React registra `touchmove` come passivo, e lì dentro `preventDefault` non fa
  niente: senza, non c'è modo di impedire alla pagina di scorrere. L'asse si
  decide una volta sola agli otto pixel e da lì non cambia più idea;
- `.ranking-preview` è finita fra i selettori esclusi dallo swipe di pagina.
  Altrimenti i due gesti partono insieme e si contendono lo stesso dito.

Oltre i due estremi — destra da Player, sinistra da Team — il nastro incontra
la stessa resistenza elastica dei fogli invece di scorrere nel vuoto.

### La striscia sotto la Dynamic Island la disegniamo noi
Era in sospeso perché sembrava una modifica di layout. Si è rivelata più
piccola del previsto: `viewport-fit: cover` più `black-translucent` portano il
viewport fino ai bordi fisici, e da lì il velo del foglio (`.sheet-backdrop`,
già `inset: 0`) copre anche l'isola senza toccarlo. Lo spazio che prima
riservava iOS lo riserva ora `env(safe-area-inset-top)` nel padding di
`.content`.

La fascia scura la disegnava `.app-shell::before` al 72%, perché con
`black-translucent` l'ora e le icone di sistema restano bianche e sopra serve
comunque qualcosa di scuro. Chiuso il foglio, però, quel rettangolo restava lì
su una pagina chiara e si leggeva come una tacca appiccicata in cima.

**Poi rifatto al contrario.** L'unica leva sul colore delle scritte di sistema
è `apple-mobile-web-app-status-bar-style`, che iOS legge all'avvio: la pagina
non può cambiarlo in corsa, e nemmeno invertirlo, perché quelle scritte iOS le
disegna sopra la web view, fuori dalla portata del CSS. Restava quindi solo la
scelta fra tenere scuro il fondo o scurire le scritte. Abbiamo scurito le
scritte (`statusBarStyle: "default"`), e da lì discende tutto il resto:

- la fascia prende `var(--scroll-edge)`, cioè il colore della pagina, e a
  riposo semplicemente non si vede;
- si ritira e rientra insieme al foglio, comandata da `--island` sulla radice
  del documento — gemella di `--veil`, che vive sul velo e che la fascia, non
  essendone figlia, non potrebbe leggere. Le muove lo stesso codice, quindi non
  si sfasano;
- il velo dei fogli **schiarisce** invece di scurire (velatura color carta più
  `brightness`): con le scritte scure, tutto quello che passa sotto di loro
  deve restare chiaro, foglio aperto compreso.

Il patto vale per tutta l'app. `.modal-backdrop` è ancora scuro al 72% e non è
stato convertito: finché resta così, con un modale aperto l'ora si legge male.
Da sistemare quando si tocca quella parte.

Su un telefono tenuto in modalità scura iOS rimette le scritte bianche e la
fascia chiara torna a essere il fondo sbagliato. Finché il tema scuro dell'app
non esiste davvero (vedi `theme-dark` fra gli agganci morti), è un caso che
accettiamo.

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
