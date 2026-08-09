# Stato dei lavori · TheBoyz

Questo file esiste perché il progetto lo portiamo avanti in due, da computer
diversi e in momenti diversi. Il codice racconta *cosa* fa l'app; qui sta il
*perché* delle scelte e cosa è rimasto aperto — le due cose che altrimenti si
perdono passando da una sessione all'altra.

**Aggiornarlo fa parte del lavoro.** Quando chiudi qualcosa, spostala da
"in sospeso" a "deciso". Quando scarti una strada, scrivi perché: serve a non
ripercorrerla fra un mese.

Ultimo aggiornamento: 9 agosto 2026

---

## In sospeso

### Il tabellone dei campi liberi non funziona finché non lo si accende
Servono due cose, tutte e due da fare a mano una volta sola:

1. `supabase/migration-wansport-cache.sql` nel SQL Editor. Senza, la Edge
   Function funziona lo stesso — la cache è un risparmio, non una dipendenza —
   ma ogni apertura della vista è una chiamata al sito del club.
2. `supabase functions deploy wansport-slots` con la CLI di Supabase. Senza
   questo il tasto "Campi liberi" si apre su un errore. Va rifatto a ogni
   modifica di `supabase/functions/wansport-slots/index.ts`.

Prima Edge Function del progetto, quindi la cartella `supabase/functions/` è
nuova. È esclusa da `tsconfig.json` e da ESLint: gira su Deno, importa da URL e
usa il global `Deno`, cose che il build di Next non sa compilare e che in
produzione esistono benissimo.

### Quattro club su cinque mostrano il tabellone solo ai loro iscritti
Funziona **solo Corcuera**. Don Quique, Oneglia, Riviera e Diano rispondono
`{"success": false}` a chi non è registrato presso di loro, e il blocco vale
anche sul dato, non solo sulla pagina: è un'impostazione che ogni centro
decide per sé. Nell'app restano in elenco con la loro spiegazione e il link al
sito, invece di sparire — sapere *perché* non si vede è meglio che non vederlo.

Da provare, e serve un account: se dopo il login su quei centri l'endpoint
risponde, la funzione si estende quasi senza modifiche (tenere una sessione
lato Edge Function). Da valutare in parallelo la strada pulita, cioè chiedere
a Wansport un accesso da partner facendosi presentare da uno dei club.

### `migration-pareggi.sql` va eseguita prima che i pareggi funzionino
Finché non gira nel SQL Editor, il sito continua a funzionare come prima: le
colonne `incomplete` e `draws` non esistono, le query che le cercano falliscono
da sole senza portarsi dietro il resto, e provare a salvare un 1-1 dà errore
dal database. La migrazione finisce con un `recalculate_padel_ratings()`: i
risultati già registrati non cambiano — i pareggi non esistevano — serve solo a
riempire `draws`.

Nota emersa scrivendola: `record_match` in produzione accetta `p_video_url`, ma
quella firma non era in nessun file di `supabase/`. Qualcuno l'ha modificata
direttamente nel SQL Editor senza portarsi dietro il file. La migrazione la
riscrive per intero, quindi da qui in avanti torniamo allineati — ma vale la
pena ricordarsi che era successo.

### I dati di prova vanno tolti a mano da Supabase
`supabase/pulizia-dati-di-prova.sql` toglie tutti i tornei e tutte le partite
tranne le prime due registrate, poi rilancia `recalculate_padel_ratings()`.
Va eseguito una volta sola nel SQL Editor, e il primo blocco è una SELECT che
mostra quali due partite resterebbero: da guardare prima di far partire il
resto. Finché non è stato eseguito, in app si vedono partite e tornei che non
sono mai esistiti.

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

### Gli orari dei campi si leggono quando li chiedi, non ogni minuto
Il primo istinto era un lavoro periodico che tiene aggiornato il tabellone.
Sbagliato per due motivi. Il primo è di misura: un giro al minuto su cinque
club sono settemiladuecento chiamate al giorno a un sito che non è nostro, e in
qualsiasi registro di accessi quella riga si vede. Chiedendo il tabellone solo
quando qualcuno apre la vista, il traffico è quello di sei persone che
guardano gli orari — indistinguibile da sei persone che li guardano davvero,
perché è esattamente quello che sta succedendo.

Il secondo è che il polling risolveva un problema che non abbiamo: nessuno
guarda i campi liberi in background. La domanda arriva la sera, prima di
decidere dove giocare.

La cache a un minuto (`wansport_cache`) serve al caso opposto: in tre che
aprono l'app insieme, una chiamata sola. Sessanta secondi perché un campo
appena prenotato non deve restare verde a lungo.

### Con Wansport si parla da una Edge Function, non dal browser
Non è una scelta di stile, sono due vincoli che si sommano. Il sito è uno
static export: `output: "export"` significa niente API route, quindi non
esiste un posto nostro dove far girare del codice server. E anche volendo, dal
browser la chiamata a `wansport.com` la blocca il CORS. La Edge Function di
Supabase è l'unico posto rimasto — e per fortuna, perché è anche l'unico in cui
un domani si possono tenere delle credenziali senza spedirle a tutti dentro al
bundle.

L'elenco dei club sta **dentro** la funzione e non nella richiesta. Se il
sottodominio arrivasse dal client, quella funzione sarebbe un proxy aperto
verso qualunque indirizzo: chiunque abbia la nostra anon key potrebbe usarla
per far partire richieste da un'infrastruttura che risponde al nostro nome.

### I nomi di chi ha prenotato non escono dalla Edge Function
La risposta di Wansport contiene nome e cognome di chi ha preso il campo, in
chiaro e senza bisogno di autenticarsi. Sono dati personali di gente che non ci
conosce e non ci ha chiesto niente: `normalizza()` li guarda solo per contarli
— zero organizzazioni vuol dire slot libero — e quello che prosegue verso la
cache e verso l'app è la sola griglia libero/occupato.

Vale come regola e non come dettaglio di questa versione: se domani serve
qualcos'altro da quella risposta, si estrae il minimo lì dentro e si scarta il
resto lì dentro. `wansport_cache` ha RLS attiva e nessuna policy proprio per
questo: ci scrive solo la funzione con la service role key, e dal client quella
tabella non si legge nemmeno da autenticati.

### Il tabellone è una tabella, non un elenco di fasce
Prima le mezz'ore contigue venivano riassunte in una fascia sola con la durata
accanto, un campo sotto l'altro. Era più corto da leggere ma perdeva la cosa
per cui si guarda un tabellone: il confronto fra un campo e l'altro alla
stessa ora. Al club si scende lungo l'ora e si vede chi è libero, e l'elenco
di fasce quel movimento non lo permetteva.

Ora è una tabella vera: una riga per campo, una colonna per mezz'ora, che
scorre di lato. La colonna dei nomi resta ferma mentre le ore scorrono, senza
la quale dopo due schermate non sai più che riga stai guardando. L'etichetta
sta solo sulle ore piene: una scritta ogni mezz'ora diventava un muro di
numeri, e la mezza si riconosce lo stesso dalla casella. Ora e mezz'ora hanno
la stessa identica misura — allargare l'ora piena avrebbe fatto sembrare la
mezza meno prenotabile, che non è vero — e a dire dove comincia l'ora è una
riga sottile nello stacco fra le due caselle, disegnata da uno pseudo-elemento
proprio per non toccare le larghezze. Le caselle sono staccate di 2px invece
di condividere i bordi: una griglia di linee continue somigliava a un foglio
di calcolo.

Tre colori e non due: verde dove è libero, rosso tenue dove è occupato, grigio
dove l'ora è già passata. Il rosso c'era stato scartato una prima volta come
troppo allarmista, ma senza di esso l'occupato e lo scaduto finivano dello
stesso grigio e la riga non si leggeva più. Tenue e non pieno, perché di
caselle ce ne sono trenta.

La colonna dei nomi non ha una fascia sotto e nemmeno un riquadro sopra: il
fondo è quello del foglio e serve solo a coprire le caselle che le passano
dietro mentre si scorre. I nomi vanno a capo su due righe invece di essere
tagliati — "Campo centrale coperto" su una riga sola mangiava mezzo tabellone.

Lo stato di attesa non esiste come variabile: la risposta si porta dietro la
domanda a cui rispondeva (`club|giorno`), e se quella in mano è di un'altra
domanda stiamo aspettando. Serviva a togliere un `setState` sincrono dentro
l'effetto — che `react-hooks/set-state-in-effect` rifiuta — ma sistema anche
una corsa: cambiando club due volte di fila, la prima risposta poteva arrivare
per ultima e sovrascrivere quella giusta.

Gli slot già passati restano visibili, spenti in grigio. Nasconderli faceva
partire la giornata da un punto diverso a ogni ora, e la mattina serve lo
stesso: si guarda anche per capire se un campo è pieno da stamattina. L'ora si
legge sul fuso di Roma e non su quello del dispositivo: un telefono col fuso
sbagliato chiederebbe il tabellone di ieri senza che nessuno se ne accorga.

### Se il tabellone si rompe, la vista porta al sito del club
Quell'endpoint è di Wansport e può cambiare quando vogliono, senza avvisarci.
Il giorno che succede la schermata non deve diventare un errore: mostra il
link al `bookingspanel` del centro, dove l'informazione c'è comunque. Vale
anche per i club che chiedono il login — stessa uscita, motivo diverso.

### La pagina chiede la viewport grande, non quella piccola
Mezza giornata su una barra del menu che non voleva stare a 11px dal vetro, e
la causa era una riga: `html, body { height: 100% }`. Il `100%` eredita la
**viewport piccola**, quella che Safari usa quando la pagina non può scorrere —
e questa non scorre, perché a scorrere è `.content`. In app salvata sulla
schermata Home la viewport piccola vale **797px su uno schermo da 844**,
allineata in alto: la pagina copre la barra di stato ma perde 47px in fondo, e
lì dentro non si disegna. `height: 100lvh` chiede la viewport grande, cioè
tutto lo schermo, e la barra è tornata al suo posto da sola.

Come si è arrivati (e come non arrivarci di nuovo): il sintomo è stato inseguito
per ore sulla barra, che era l'unica cosa a posto. Quello che ha sbloccato è
stato smettere di dedurre dagli screenshot e mettere in pagina un riquadro con
`window.innerHeight`, `screen.height` e le `env()`. Il numero `797 = 844 − 47`
diceva già tutto. **Se qualcosa sembra fuori posto ai bordi dello schermo, il
sospettato non è l'elemento: è l'altezza della finestra che lo contiene** —
e si misura, non si indovina.

Due cose trovate per strada, tenute perché servono davvero:

- `apple-mobile-web-app-capable` è scritto a mano in `layout.tsx`: Next 16 non
  lo emette più (da `appleWebApp.capable` genera solo `mobile-web-app-capable`)
  e iOS lo vuole ancora. C'è un test che fallisce se sparisce.
- `statusBarStyle: "black-translucent"` — senza, la pagina non passa sotto
  l'orologio e `.system-blur` non ha niente da sfocare. Il prezzo è l'ora
  bianca fissa.

Vicolo cieco da non ripercorrere: ancorare barra e fasce a `.app-shell` alto
`100dvh` invece di lasciarle `fixed` (commit `48cfc92`, annullato). Stessa
trappola vista da un'altra angolazione — `dvh` non è lo schermo.

### Un set a testa è un pareggio, e il terzo interrotto si scrive lo stesso
Si gioca al meglio dei tre set, ma il campo scade prima della fine più spesso
di quanto ci piaccia ammettere. Prima quel risultato non si poteva registrare:
o si inventava un vincitore, o la partita spariva. Ora un 1-1 nei set è un
pareggio — `winner_team = 0`, contorno giallo invece che verde e rosso — e il
terzo set interrotto si inserisce comunque, marcato `incomplete`.

Quel set non assegna il set a nessuno, ma i suoi giochi non sono buttati: il
pareggio parte da mezzo punto e si sposta al massimo di 0,15 verso chi ha
vinto più giochi in tutta la partita (`padel_draw_tilt`). Con 7-6 6-3 2-1 fra
squadre pari sono tre punti a chi conduceva, contro i diciannove della stessa
partita chiusa 6-2 al terzo: i giochi contano, ma un pareggio resta un
pareggio. Il tetto a 0,15 è lì apposta — senza, un pareggio molto sbilanciato
avrebbe pagato quanto una vittoria di misura.

Il pareggio non spezza le serie: le mette in pausa. Chi aveva tre vittorie di
fila se le ritrova alla prossima vinta. E nel win rate vale mezza vittoria,
perché contarlo come sconfitta punirebbe chi non ha perso e tenerlo fuori dal
totale premierebbe chi non ha vinto.

I tornei restano fuori: il girone all'italiana assegna i punti sulle vittorie,
quindi `assign_tournament_match` rifiuta i pareggi finché non decidiamo quanto
valgono là dentro.

### Il campo non deve ereditare il carattere dell'etichetta
`form label` è maiuscolo, in peso 900 e spaziato, e `input`/`select` hanno
`font: inherit`: risultato, quello che si scriveva dentro ai campi usciva
nerissimo e tutto maiuscolo, e il testo suggerito sembrava urlato. Ora il
valore è in 600 senza trasformazioni e il segnaposto in 400 grigio: il
suggerimento deve leggersi come un suggerimento, non come una risposta già
data.

### L'intestazione del foglio è alta uguale con e senza switch
I fogli che hanno l'interruttore nell'angolo sono alti quanto lui; quelli che
non ce l'hanno — registra una partita, crea un torneo — tenevano il titolo
qualche pixel più in alto, e passando dall'uno all'altro l'etichetta si
spostava. Ora `.sheet-head` ha un'altezza minima di 36px, che è la misura
dell'interruttore.

### I moduli sono fogli dal basso, non riquadri al centro
"Registra una partita" e "Crea un torneo" erano finestre centrate con la
crocetta nell'angolo, mentre tutto il resto del padel si apre in un foglio
che sale dal basso. Ora usano lo stesso `BottomSheet` di partite e
classifica: stesso titolo-etichetta, stesso trascinamento per chiudere,
stesso velo. La crocetta è sparita — si chiude tirando giù o toccando fuori,
come in tutti gli altri fogli — e con lei l'occhiello sopra al titolo, che
ripeteva quello che il titolo diceva già.

Ci si guadagna anche lo scorrimento laterale bloccato: `.sheet-body` ha già
`touch-action: pan-y` e `overflow-x: hidden`, quindi il modulo non si sposta
più di lato mentre lo si compila.

### Le card della home non hanno più un'insegna
"Classifica Elo · Singolo" e "Partite · Tutti" cambiavano insieme al
contenuto, e dicevano a parole quello che i pallini dicono con un segno. Su
mobile il titolo è sparito da tutte e due le card; il riquadro dei tornei lo
tiene, perché quello ha una faccia sola. Il punto di riferimento con cui la
pagina tiene ferma la posizione mentre la card cambia faccia non è più
l'insegna ma la card stessa, che il carosello conosce già.

### Il carosello è uno solo, scritto una volta
Classifica e partite fanno la stessa cosa — più facce nella stessa card, si
cambia con lo swipe o da sole ogni cinque secondi — e per un po' è stata la
stessa cosa scritta due volte. Ora c'è `useCardCarousel`: gli si passa la
fila delle facce nell'ordine dei pallini e cosa fare quando cambia. Il cambio
automatico va avanti e indietro lungo la fila invece di riavvolgersi, così
ogni movimento corrisponde a uno swipe che si potrebbe fare davvero. Sulle
partite gira solo da telefono: su desktop non ci sono i pallini, e una card
che cambia da sola senza niente che lo spieghi sembra un difetto.

### I pallini stanno sotto la card, non accanto al titolo
Tolta l'insegna non avevano più niente accanto a cui stare. Ora sono
centrati sotto l'ultima riga, dove si guarda per capire quante facce ha una
card — come sotto le foto di un profilo.

### Le partite di torneo non hanno una sezione, hanno un segno
Erano state messe dietro a un terzo filtro, insieme a "le mie" e "tutte".
Sbagliato: una partita di torneo è una partita come le altre, conta nell'Elo
e sta nel suo mese — separarla in un elenco suo la faceva sembrare un'altra
cosa. Ora la si riconosce da un filo lime sul fianco della card. Una partita
è "di torneo" se porta con sé il turno da cui è nata
(`tournament_fixture_id`): non serve interrogare i calendari, la partita sa
già da sola di appartenere a uno.

**Dentro ai fogli sono rimasti gli interruttori a icone**, non i pallini: lì
c'è lo spazio per un comando vero, e la faccia di chi guarda dice "queste
sono le tue" meglio di un punto. I pallini restano sulle card, dove sono
un'indicazione e non un tasto.

### "+ NUOVA PARTITA" sta in cima, sotto la card di chi guarda
Aprire una partita nuova è la prima cosa che si fa entrando: prima il tasto
stava fra la classifica e le partite e bisognava scorrere per trovarlo.

**Scorrendolo di lato compare "+ NUOVO TORNEO".** È lo stesso carosello
delle card, con due tasti al posto di due elenchi. Non gira da solo, però:
una card che cambia da sola si guarda, un tasto che cambia da solo si preme
per sbaglio. Il tasto del torneo era sparito dal riquadro degli ultimi
tornei e su mobile non c'era più modo di crearne uno: adesso c'è, e sta dove
sta l'altro comando che apre qualcosa di nuovo.

**Niente pallini sotto: ogni cinque secondi si sporge e torna.** I pallini
dicevano meglio che c'era un secondo tasto, ma erano una riga in più fra due
card, in una schermata che vive di passi tutti uguali. L'accenno di
movimento verso il lato da cui arriva l'altro tasto dice la stessa cosa
senza occupare spazio. Si ferma se il dito lo sta già spostando, a scheda
nascosta, e con la riduzione del movimento attiva.

**`overflow-x: clip` su `html`.** Mentre il nastro scorre il tasto esce dai
fianchi dello schermo, e senza ritaglio la pagina si allargava. `clip` e non
`hidden`: `hidden` farebbe di `html` un contenitore di scorrimento e gli
elementi fissi — la barra in basso, la fascia in cima — smetterebbero di
essere fissi. Il ritaglio sta sulla radice e non sul carosello perché
l'alone colorato del tasto esce dai suoi bordi di una trentina di pixel, e
ritagliarlo lì lo spegnerebbe.

### Su touch non si seleziona il testo
Tenere premuto faceva comparire la selezione e la lente con "Copia", e la
pagina sembrava un documento invece di un'app. La selezione resta accesa solo
nei campi in cui si scrive, dove serve per correggere, e solo dove non c'è un
puntatore: col mouse selezionare è un gesto normale e toglierlo sarebbe una
perdita.

### La pastiglia della barra resta schiacciata finché premi
Prima faceva un rimbalzo di durata fissa: tenendo premuto risaliva da sola
dopo due decimi e sembrava che il tocco fosse già finito mentre il dito era
ancora lì. Ora si comporta come il tasto della nuova partita. Non può usare
`transform` — quello lo scrive il gesto per posizionarla — quindi si schiaccia
con la proprietà `scale`, che si somma alla traslazione invece di
sostituirla, e la transizione arriva dallo stile inline scritto in
`page.tsx`: lì `transition` viene riscritto a ogni spostamento e una regola
nel CSS verrebbe comunque sovrascritta.

### Gli slot vuoti non hanno linee, e nemmeno la riga sopra di loro
L'anteprima tiene sempre tre righe, anche quando le squadre in classifica
sono due: senza, passando da singolo a squadre la card si accorciava e la
home si muoveva sotto il dito. Gli slot vuoti erano già senza linea di fondo,
ma restava quella dell'ultima squadra vera: non divideva due coppie, divideva
una coppia dal niente, e sembrava che sotto ci fosse una terza squadra ancora
da caricare. Ora la perde anche lei.

### La fascia di sistema è sfocatura sfumata, senza colore
La campitura chiara sopra alla Dynamic Island si vedeva come una fascia
posticcia appena sotto le passava un blocco scuro o una foto. Adesso quello
che scorre sotto non viene coperto, viene solo appannato — sempre di più
salendo verso l'ora e le icone di sistema.

**È alta quanto l'area sicura, non di più.** Prima scendeva trenta pixel
sotto e arrivava a sfumare il bordo della prima card anche a pagina ferma:
la sfocatura è della barra di sistema, non della pagina.

**Sono due veli sovrapposti, non uno.** Una sfocatura sola, tagliata di netto
in fondo alla fascia, lascia un gradino visibile. Il secondo velo sfoca di
più e si spegne prima, e nella sovrapposizione il passaggio diventa continuo.
Due e non quattro: ogni velo è una superficie che il telefono ridisegna a
ogni fotogramma mentre la pagina scorre, e sopra a due si sente.

**Il contenitore è fisso ma non sfoca: sfocano i figli, che sono in
posizione assoluta.** È la stessa precauzione già presa per la barra in
basso. Su iOS un elemento fisso con `backdrop-filter` viene ricomposto in
ritardo durante lo scorrimento inerziale, e tutto quello che è fisso sembra
scivolare e riassestarsi — barra di navigazione compresa, anche se il
difetto non è suo.

### Sotto l'isola c'è lo stesso bordo che ai lati
Il passo in alto era 24px sommati all'area sicura, contro i 14 dei fianchi:
la prima card risultava molto più staccata da sopra che di lato. Ora la card
comincia dove finisce l'area sicura e basta: l'area sicura è già più bassa
della Dynamic Island di una decina di pixel, quindi lo stacco che si vede è
quello dei fianchi. Sommarci ancora i 14px lo raddoppiava.

### Su mobile non scorre la pagina, scorre il contenuto
Durante il rimbalzo elastico iOS trascina tutta la pagina, e con lei anche
gli elementi fissi: la barra in basso si staccava dal fondo ogni volta che si
arrivava in cima o in fondo. Il primo rimedio era stato togliere il rimbalzo
(`overscroll-behavior-y: none`), ma senza rimbalzo la pagina si ferma secca e
sembra bloccata.

Ora lo scorrimento sta dentro a `.content`, alto `100dvh` e con
`overflow-y: auto`, come nelle app native: il rimbalzo avviene lì dentro e
gli elementi fissi — barra e sfocatura di sistema — restano dove sono.
`overscroll-behavior-y: contain` impedisce che il rimbalzo si propaghi fuori,
che era esattamente la propagazione che portava via la barra.

Conseguenze da ricordare, perché non sono ovvie leggendo il CSS:

- `window.scrollTo` e `window.scrollBy` non muovono più niente. Ci sono
  `scrollPageTo` e `scrollPageBy`, che chiedono a `pageScroller()` chi sta
  scorrendo davvero: su desktop `.content` non ha overflow e si torna alla
  finestra, e lo si riconosce dall'overflow calcolato invece di ripetere il
  breakpoint anche in JavaScript.
- Lo spazio per la barra in fondo lo mette `.content`, non più `body`.
- `scroll-behavior: smooth` è passato da `html` a `.content`.
- Il foglio dal basso blocca lo scorrimento togliendo l'overflow al
  contenitore, una riga sola: la ginnastica di fissare il `body` e rimetterlo
  dov'era serve solo dove a scorrere è la pagina intera.
- La copia congelata della pagina che esce durante lo swipe fra sezioni deve
  farsi ridare lo `scrollTop`: un clone nasce sempre in cima.
- **Barra, sfocatura di sistema e dissolvenza in fondo restano `fixed`.** Era
  stato provato ad ancorarle a `.app-shell` alto `100dvh` (commit `48cfc92`,
  annullato lo stesso giorno). Sembrava più solido e invece rompeva tutto: in
  standalone `100dvh` vale 797 su uno schermo da 844, quindi l'interfaccia si
  stringeva dentro a 797 e i 47px avanzati diventavano una fascia — la barra
  sembrava alta, e in cima compariva il `themeColor` blu dove prima la barra
  di stato era trasparente sul contenuto. `fixed` misura sulla finestra vera,
  che in standalone è tutto lo schermo, ed è l'unica misura che regge. Se
  qualcosa sembra fuori posto in fondo allo schermo, il sospettato non è la
  barra: è l'altezza del contenitore che la ospita.

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
