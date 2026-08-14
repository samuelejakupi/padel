# Stato dei lavori · TheBoyz

Questo file esiste perché il progetto lo portiamo avanti in due, da computer
diversi e in momenti diversi. Il codice racconta *cosa* fa l'app; qui sta il
*perché* delle scelte e cosa è rimasto aperto — le due cose che altrimenti si
perdono passando da una sessione all'altra.

**Aggiornarlo fa parte del lavoro.** Quando chiudi qualcosa, spostala da
"in sospeso" a "deciso". Quando scarti una strada, scrivi perché: serve a non
ripercorrerla fra un mese.

Ultimo aggiornamento: 14 agosto 2026

---

## In sospeso

### ~~Il tabellone dei campi liberi non funziona finché non lo si accende~~
**Chiuso il 10 agosto 2026: tutti e cinque i centri si vedono.** Le tre
migrazioni sono state eseguite, i secret `WANSPORT_USER` / `WANSPORT_PASS`
sono nel Dashboard, la funzione è deployata. Verificato che
`wansport_sessioni` si riempie davvero: una riga per club chiuso, nessun
duplicato, e Corcuera giustamente assente perché non apre nessuna sessione.

Resta da fare, quando capita: spostare le credenziali dai secret al Vault
(punto 4), che ora è possibile perché `migration-wansport-accesso.sql` è
girata. I secret restano come via di servizio.

I passaggi restano scritti qui sotto perché servono a chi rifà tutto da zero
— un altro ambiente, o il giorno che si azzera il progetto Supabase.

1. `supabase/migration-wansport-cache.sql` nel SQL Editor. Senza, la Edge
   Function funziona lo stesso — la cache è un risparmio, non una dipendenza —
   ma ogni apertura della vista è una chiamata al sito del club.
2. `supabase/migration-wansport-sessioni.sql`, sempre nel SQL Editor. Serve ai
   club dove entriamo con un account nostro: senza, si rifà il login a ogni
   richiesta invece di riusare la sessione.
3. `supabase/migration-wansport-accesso.sql`, sempre nel SQL Editor: prepara
   il Vault e le tre funzioni con cui ci si parla. Senza, il riquadro nel
   profilo non riesce a salvare.
4. Le credenziali dell'account Wansport del gruppo, **dal profilo dentro
   l'app** — non in un file, e nemmeno in chat. Sono due e valgono per tutti i
   centri: l'account Wansport è uno solo e sono i club a tesserarti.
   In alternativa restano i secret della funzione (`WANSPORT_USER` /
   `WANSPORT_PASS`, dal Dashboard), che valgono come via di servizio se il
   Vault non è ancora pronto. Se mancano tutti e due, i club chiusi tornano a
   dire "richiede login" e non succede nient'altro.
5. `supabase functions deploy wansport-slots`, o l'editor delle Edge Functions
   nel Dashboard. Senza questo il tasto "Campi liberi" si apre su un errore.
   Va rifatto a ogni modifica di
   `supabase/functions/wansport-slots/index.ts`.

Prima Edge Function del progetto, quindi la cartella `supabase/functions/` è
nuova. È esclusa da `tsconfig.json` e da ESLint: gira su Deno, importa da URL e
usa il global `Deno`, cose che il build di Next non sa compilare e che in
produzione esistono benissimo.

### Nei club chiusi si entra con un account solo, non con quello di ognuno
Don Quique, Oneglia, Riviera e Diano rispondono `{"success": false}` a chi
arriva da fuori senza sessione, e il blocco vale anche sul dato, non solo
sulla pagina.

> **Corretto il 10 agosto 2026.** Qui sotto, fino alla sezione successiva, si
> dava per scontato che servisse essere *tesserati presso ciascun centro*.
> Non è vero, e per un giorno ci ha mandati a cercare la soluzione dalla parte
> sbagliata (chiedere ai club di iscriverci, o comprare le API). Basta un
> account Wansport qualunque: quello che cambia non è chi sei, è **da quale
> porta entri** — vedi "Il pannello dei loggati è un altro componente" più
> sotto. Le decisioni sull'account unico e sul Vault restano valide come sono
> scritte; è la spiegazione del perché a essere stata sbagliata.

La prima idea era un tasto "accedi" nell'app, con ognuno che mette le proprie
credenziali Wansport. È stata scartata: per rigiocarsi quel login la funzione
deve conservare le password in chiaro o comunque decifrabili — non si possono
hashare, serve il valore vero — e da quel momento nel nostro Supabase ci sono
le password di quattro persone per un servizio che non è nostro, con la gente
che ricicla le password. Un bucco lì esce dal padel.

Quello che si fa invece: **un account solo, del gruppo**, messo una volta dal
riquadro in fondo al profilo. Nessuno consegna all'app la propria password, e
in caso di guaio il danno è un account che si blocca.

Le credenziali finiscono nel **Vault** di Supabase e non in una tabella: il
Vault cifra sul disco e tiene la chiave di cifratura fuori dal database, così
un dump o un backup non contengono niente di leggibile. Ci si arriva solo per
tre funzioni `security definer` con l'esecuzione revocata ad `anon` e
`authenticated` — dal telefono non si chiamano nemmeno da loggati — e la sola
che restituisce la password in chiaro, `accesso_wansport()`, va trattata come
il punto delicato del file: se un giorno diventasse chiamabile dal client
sarebbe finita.

Dal profilo si può sapere se un accesso c'è e sostituirlo, **non rileggerlo**:
non esiste una chiamata che restituisca la password, nemmeno mascherata, e i
due campi partono sempre vuoti apposta. Salvando si cancellano anche tutte le
sessioni aperte, se no per un quarto d'ora si continuerebbe a usare il vecchio
accesso e sembrerebbe che il salvataggio non abbia funzionato. Subito dopo si
fa una prova di login e si dice se passa: salvato e funzionante sono due cose
diverse, e la differenza è meglio saperla lì che davanti al campo.

Chi può metterlo: chiunque abbia un account nell'app. La funzione controlla
che ci sia una persona vera dietro la richiesta — la chiave anonima da sola
non basta, ed è un controllo che serve perché le Edge Function accettano
quella chiave come JWT valido — ma non distingue fra noi. Siamo in quattro e
la password non si rilegge: il rischio è che qualcuno la sovrascriva, non che
la porti via. Se un giorno servisse stringere, basta confrontare l'id di chi
chiama con un secret.

L'account Wansport è unico e vale su tutti i sottodomini — ci si iscrive a
Wansport, e sono poi i singoli club a tesserarti — quindi la coppia di secret
è una sola e non una per centro. Su un club dove non siamo tesserati il login
riesce lo stesso ma il pannello risponde `success: false`, che è il caso già
gestito: quel club dice "richiede login" e mostra il link al sito. Per questo
nel client non c'è più nessun elenco di club "fuori portata" da tenere
allineato a mano: si chiede e basta, e il giorno che un centro si apre quel
centro si accende da solo.

### Il pannello dei loggati è un altro componente
Misurato il 10 agosto 2026 leggendo le XHR del sito di Don Quique da loggato,
dopo un giorno passato a dedurre la cosa sbagliata.

Gli anonimi passano da `option=com_wsinit`. Quella porta è aperta solo sui
club che hanno acceso il pannello pubblico — Corcuera sì, gli altri quattro
no, e rispondono
`{"success":false,"errCode":401,"errMsg":"Il pannello non è attivo"}`.
Quel messaggio non parla di tesseramento e non parla di noi: dice solo che da
fuori quella porta è chiusa.

Chi ha una sessione passa invece da `option=com_wansport`, stesso `task`, più
`isWannaplay=0`. Con un account Wansport qualsiasi — **senza essere tesserati
al centro** — Don Quique restituisce `success: true` e la griglia intera, le
due sedi comprese. È la stessa porta che usa l'app, ed è il motivo per cui
dall'app i campi si vedevano mentre dal browser no.

Quindi il componente lo sceglie il cookie, non il club: con sessione
`com_wansport`, senza sessione `com_wsinit`.

Due cose emerse per strada, che valgono più della sezione:

- **Un account creato con Google non ha una password**, quindi il login
  email+password falliva in silenzio. Va impostata una password vera da
  "password dimenticata" prima di metterla nel Vault. Questo, sommato al fatto
  che una credenziale sbagliata è indistinguibile da un pannello chiuso,
  è tutto il mistero: non stava fallendo il pannello, stava fallendo il login.
- **QUPOLA non è un club a sé**: è la sede "DON QUIQUE PONTEDASSIO" dentro lo
  stesso sottodominio di Don Quique. I campi sono COURT 1, COURT 2, GARDEN
  COURT 3, GARDEN COURT 4, QUPOLA 1 (INDOOR), QUPOLA 2 (INDOOR).
  `PADEL_COURTS` in `app/page.tsx` invece va lasciato com'è: è l'elenco dei
  *posti dove si gioca* per registrare una partita, e Qupola come posto esiste
  eccome. Sono due liste diverse e non vanno allineate.

### Aperto: il tabellone di Don Quique mescola due sedi lontane 10 km
`normalizza()` nella Edge Function appiattisce `dati.sedi[]` in un unico
elenco di campi e butta via il nome della sede — scelta giusta finché un club
aveva una sede sola (su Corcuera la sede si chiama come la parrocchia
proprietaria, che non dice niente a nessuno).

Su Don Quique non regge più: sotto l'etichetta "DON QUIQUE - IMPERIA"
finiscono anche QUPOLA 1 e QUPOLA 2, che sono a Pontedassio. I nomi dei campi
lo lasciano intuire, ma chi guarda per decidere dove andare merita di meglio.

Da decidere insieme, perché tocca la vista mobile: portare `sede` nel payload
e mostrarla come intestazione di gruppo solo quando le sedi sono più di una.
Non l'ho fatto di mia iniziativa il 10 ago perché non potevo verificarlo a
schermo — e in quella colonna gli ordini sono espliciti, quindi un elemento
nuovo senza `order` risale in cima a tutto.

Rimane da verificare, quando capita: se le altre tre società si comportano
come Don Quique. Il login è per sottodominio, quindi vanno provate una per una
— ma se una non va, l'app degrada da sola sul link al sito e non si rompe
niente.

Il login è quello standard di Joomla: POST alla radice con `option=com_users`,
`task=user.login` e un token anti-CSRF che va pescato dalla pagina appena
prima (campo nascosto, nome di 32 cifre esadecimali, valore `1`). Il redirect
si intercetta a mano, perché Joomla rigenera l'id di sessione proprio al login
e seguendolo si perderebbe il cookie buono. La sessione si riusa per quindici
minuti: rifare il login a ogni richiesta riempirebbe il loro registro accessi
di centinaia di righe a nome nostro, che è il modo più rapido per farsi
notare.

Se le credenziali mancano, sono sbagliate o il club chiude il pannello, la
risposta torna a essere `richiede-login` e l'app si comporta come prima: non
c'è un caso in cui l'utente veda un errore. Il rovescio è che una credenziale
sbagliata non si distingue da un club chiuso — se un centro smette di
funzionare senza motivo, è la prima cosa da guardare, nei log della funzione.

Resta aperta la strada pulita: chiedere a Wansport un accesso da partner
facendosi presentare da uno dei club. È l'unica che non dipende da un account
personale e non rischia niente.

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

### L'account di Mene va creato a mano dal Dashboard
Il roster è cresciuto a nove: `groupUsers` in `app/page.tsx` e
`handle_new_user()` in `supabase/schema.sql` sono già allineati, e il limite di
profili è passato da 8 a 9. Manca l'account vero, che non si crea dall'app —
`supabase.auth.signUp` è disattivato di proposito e non va reintrodotto.

Nell'ordine:

1. `supabase/migration-mene.sql` nel SQL Editor. Senza, il trigger
   `on_auth_user_created` rifiuta l'account nuovo con "Registrazione pubblica
   disabilitata".
2. Authentication → Users → Add user nel Dashboard Supabase, con email
   `mene@theboyz.local` e la password concordata, spuntando la conferma
   automatica dell'email: sul dominio `.local` non arriva nessun messaggio, e
   senza la spunta l'account resta non confermato e il login non passa.

Finché il punto 2 non è fatto, "Mene" compare nella tendina del login ma il
suo accesso non funziona.

---

### `migration-titoli.sql` va eseguita prima che i titoli funzionino
Finché non gira nel SQL Editor di Supabase, il tasto "VOTA I TITOLI" in fondo
al foglio della classifica risponde con un avviso invece di aprirsi. Le due
query dei titoli falliscono da sole e non si portano dietro il resto del
caricamento, quindi l'app continua a funzionare come prima: è lo stesso
comportamento delle migrazioni dei pareggi e delle plays.

---

## Deciso, e perché

### La card partita mostra sempre tre set
Anche quelle finite al primo. Le caselle che avanzano sono `0—0` sbiadite, come
i set interrotti: con una casella sola la card veniva larga la metà delle altre
e la fila non tornava più. Il punteggio è la parte che si legge a colpo
d'occhio, e a colpo d'occhio le card devono avere tutte la stessa forma.

Sbiadite e non piene perché un `0—0` normale sarebbe un set giocato e finito a
zero, che è un'altra cosa: la forma è uguale, il colore dice che lì non si è
giocato.

### Faccia e nome vanno a paripasso
La squadra di destra è specchiata (`direction: rtl`) per portare le facce verso
il centro. Quel rovescio però riguarda le colonne, non l'ordine dei giocatori:
la fila delle facce si girava insieme al contenitore, e sulla destra la prima
faccia finiva sopra al secondo nome. Su mobile, dove i nomi stanno incolonnati e
le facce in riga, l'inversione si vedeva ancora meglio. `.team-right
.mini-avatars` torna in `ltr`: le colonne restano specchiate, i giocatori no.

### L'MVP è una corona che batte, non un secondo anello
La pastiglia oro tiene una corona nera al posto della parola "MVP": tre lettere
in corpo 7 sopra un avatar da 36px si leggevano solo sapendo già cosa c'era
scritto.

Il contorno dell'avatar batte invece di raddoppiarsi, e il colore lo decide
dove sei: nella card della home l'esito è già scritto nel bordo (verde, rosso,
giallo) e batte quello — un anello oro sotto a un anello colorato faceva
sembrare l'avatar staccato dalla card. Nel foglio partite, dove l'esito sta
scritto accanto ai nomi, il battito è oro come la pastiglia. Prima le due viste
mostravano lo stesso riconoscimento in due modi diversi.

Il colore del battito è una variabile (`--mvp-glow`) che chi ospita l'avatar
imposta: l'avatar non sa dove si trova. Con `prefers-reduced-motion` corona e
contorno restano, smettono solo di battere.

### La testata del profilo è la card della home, aperta
Erano due cose diverse che dicevano le stesse cose a due schermate di distanza:
card scura con i KPI in home, card a due colonne con l'Elo in un riquadro lime
nel profilo. Ora il profilo è la stessa card — stesso fondo, stessa sfumatura,
posizione e foto sulla stessa riga — solo più alta, perché in fondo ci stanno i
numeri di carriera.

"Numeri in campo · Carriera" non è più un riquadro bianco sotto alla card: sta
dentro, staccato da una riga sola, con i numeri in lime come i KPI della home.
L'Elo apre la fila e prende il posto del riquadro lime, che diceva la stessa
cosa in un altro modo. I riquadri diventano cinque (sei per chi ha pareggi);
su mobile vanno a due per riga e quello che resta spaiato prende tutta la riga.

### I titoli si votano dal fondo della classifica
La classifica è l'unico punto dell'app dove il gruppo è tutto in fila, quindi è
lì che si vota: si finisce di leggere chi va forte e si passa a dire chi è cosa.
Il tasto sta in fondo al **foglio** della classifica, non nella card della home
— `.ranking-preview` è tutta un `<button>` e dentro un tasto non ci va un altro
tasto — e non nella pagina classifica intera, che sarebbe stato un secondo
posto da tenere allineato.

Il foglio dei titoli **sostituisce** quello della classifica invece di
sovrapporsi: `sheet` tiene un foglio solo, e due `BottomSheet` aperti insieme si
contenderebbero il trascinamento e l'animazione della fascia in cima allo
schermo. Chiudendo si torna alla home, non alla classifica.

### La votazione dei titoli è sempre aperta, e il voto è segreto
Niente sessioni e niente stagioni: un voto per titolo a testa, correggibile
quando si vuole. Un titolo dice cosa pensi di una persona, e quello cambia da
solo — congelarlo a fine anno avrebbe trasformato un'opinione in un verdetto.

I voti sono anonimi e questo **non** si ottiene con una policy. Se il telefono
potesse leggere i voti per contarli, chi legge potrebbe anche guardarli: la
policy di lettura lascia quindi vedere a ognuno solo la propria riga, e i totali
arrivano già sommati da `title_standings()`, che gira come proprietario e
restituisce numeri, mai nomi di votanti. Lo stesso motivo per cui la scrittura
passa da `save_title_vote()` invece che da un insert diretto.

### Non ci si vota da soli, e il voto si toglie ripremendolo
Il divieto di autovoto sta nel `check` della tabella e nella funzione, non nel
frontend: un vincolo che vive solo nel telefono non è un vincolo.

La scheda bianca c'era e l'abbiamo tolta: non votare e votare nessuno sono la
stessa cosa, e due modi per dirla erano uno di troppo — in fondo alla fila dei
nomi c'era una pastiglia in più che non aggiungeva niente. Il voto si annulla
ripremendo il nome già scelto, che è il gesto con cui si annulla una selezione
ovunque. `save_title_vote` con `p_target_id` nullo cancella la riga invece di
salvarne una vuota, e `target_id` è `not null`.

### A pari voti il titolo resta conteso
Con otto votanti i pareggi sono la norma, non l'eccezione. In cima restano
tutti i nomi a pari merito, con le facce accavallate: scegliere un vincitore
per ordine alfabetico o per id sarebbe stato un vincitore inventato dal codice.

### I due GOAT convivono
L'emblema GOAT della bacheca lo assegnano i numeri, il titolo GOAT lo assegna
il gruppo. Stesso nome, due strade diverse, ed è voluto: uno è il più forte,
l'altro è quello che tutti chiamano il più forte. Non si rinomina né si toglie
quello statistico.

### I club sono raccoglitori, non pastiglie
Con cinque centri la fila di pastiglie andava a capo, e quale fosse quello
aperto lo diceva solo il nero di una: cinque nomi in fila e sotto un tabellone
senza intestazione. Il raccoglitore invece tiene il nome attaccato al suo
contenuto.

È la stessa forma dei mesi del foglio delle partite, e soprattutto lo **stesso
componente**: `MonthGroup` è uscito da `page.tsx` ed è diventato
`app/MonthGroup.tsx`. Copiarlo voleva dire due animazioni da tenere uguali a
mano, che è il modo in cui diventano diverse. Il nome resta `MonthGroup` anche
se ora raccoglie pure i club, perché le classi CSS si chiamano `month-*` e
rinominare le une senza le altre farebbe più danno che chiarezza. Il conteggio
è diventato facoltativo: i mesi contano le partite, i club non hanno niente da
contare prima di essere aperti.

Il primo è già aperto quando il foglio sale — chi entra vuole vedere un
tabellone, non un elenco da aprire — e per fortuna il primo è Corcuera, l'unico
col pannello pubblico: quella chiamata automatica non tocca nessun account.
Richiudendo l'ultimo aperto restano tutti chiusi, come fanno i mesi.

Il corpo di un club resta montato anche da chiuso, se no la chiusura
collasserebbe su una scatola già vuota e riaprendo si ripartirebbe da "sto
guardando". Ma da chiuso non chiede niente: la chiamata parte solo se il
raccoglitore è aperto, se no aprire il foglio farebbe cinque chiamate ai club
per mostrarne una.

Le chip dei giorni sono passate dentro al raccoglitore aperto, dove valgono.
Il giorno scelto però resta cambiando centro: si sta cercando un giorno, non
un club.

### Il tabellone è diviso in mattino e pomeriggio
Dalle 8 alle 23 sono trenta mezz'ore: in una riga sola si leggevano solo
scorrendo di lato, e la casella che cerchi era larga tre millimetri. Due
blocchi impilati, e ogni metà ci sta quasi intera.

Il taglio è alle **14 e non alle 12**: a mezzogiorno si gioca ancora, e un
"mattino" che finisce col campo pieno non descrive niente. Dopo pranzo la
giornata cambia davvero, e chi cerca un campo sa già in quale metà guardare.

Ogni blocco tiene **tutti** i campi e metà delle ore: una fascia mostra meno
ore, non meno campi, se no il confronto fra un campo e l'altro — che è tutto
il motivo per cui questa è una tabella e non un elenco — si perderebbe a metà
pagina. Una fascia vuota non viene disegnata: un centro che apre alle 15 non
ha un mattino da mostrare, e un'intestazione sopra il nulla è peggio del
nulla.

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

### Chi corregge una partita, chi la elimina
Due regole diverse perché sono due cose diverse. **Correggere** lo può fare
chiunque abbia giocato quella partita, entro 24 ore dalla registrazione: uno
sbaglio di trascrizione lo vede chi era in campo, e chi era in campo deve poterlo
sistemare senza rincorrere chi ha battuto il risultato. Passate le 24 ore il
risultato è storia e non lo tocca più nessuno. **Eliminare** invece resta di chi
ha registrato, per sempre: correggere quello che c'è scritto è una cosa, far
sparire una partita è un'altra.

Le due regole stanno sul database (`migration-permessi-partite.sql`), non solo
nell'interfaccia: `delete_match` accetta solo l'autore, `delete_match_for_edit` i
partecipanti entro le 24 ore. Sono due porte sullo stesso corpo perché correggere
significa eliminare e riregistrare — è l'unico modo per far ricalcolare l'Elo in
ordine cronologico.

Chi ha registrato e quando **non si leggono da `matches`**: quella riga viene
rifatta a ogni correzione, quindi `created_by` e `created_at` parlano dell'ultima
modifica e la finestra non si chiuderebbe mai. Si leggono dalla riga `created` di
`match_events`, che è appesa alla discendenza e attraversa tutte le correzioni.

`migration-partite-modificabili-24h.sql` è la versione precedente della stessa
idea (solo l'autore, tutto entro 24 ore) e resta nel repo marcata come superata:
rilanciarla rimetterebbe le vecchie regole.

### Il motivo della correzione lo scrive il registro
Era una casella facoltativa da riempire a mano: restava quasi sempre vuota, e
quando non lo era ripeteva quello che si leggeva già dal punteggio. Adesso il
confronto fra il prima e il dopo lo fa `matchChangeSummary` — "punteggio 6-4 6-3
→ 6-4 7-5 · campo aggiunto" — e nessuno deve scrivere niente.

Lo storico resta comunque non riscrivibile: `match_events` non ammette modifiche
né cancellazioni.

### Il foglio della partita si apre a tutti
Anche a chi non può più correggere: lì dentro c'è lo storico, ed è l'unico posto
dove si legge come si è arrivati a quel risultato. Chi non può correggere trova
una scheda invece di un modulo.

### Il foglio della partita è un tabellone, non un modulo
Prima erano sette righe uguali — etichetta sopra, casella sotto — e sembrava un
form di iscrizione. Adesso segue la sezione Padel: superfici bianche, occhielli
azzurri, i numeri grandi come su una card di partita. L'ordine è quello con cui
si racconta una partita: quando e dove, chi, quanto.

Cosa è cambiato nel concreto:

- **Data, campo e video sono tre segni in fila**, non tre righe. Sono le cose che
  quasi sempre restano come sono (la data è oggi, il campo è quello di sempre, il
  video non c'è), quindi stanno chiuse e si aprono solo se le tocchi. Il giorno
  si legge come sulle card — `13 AGO`, niente anno.
- **Il campo si sceglie da un elenco**, non si scrive: sono i centri del
  tabellone dei campi liberi. Scritto a mano usciva ogni volta un po' diverso e
  le statistiche per campo non stavano in piedi. Un campo fuori elenco non si può
  più registrare — deciso così apposta.
- **Il video è l'icona di YouTube**: grigia se non c'è, rossa se c'è. È l'unico
  rosso dell'app che non vuol dire "attenzione": è il rosso del marchio, ed è per
  questo che sta scritto in esadecimale invece di venire dai colori di casa.
- **I quattro selettori partono vuoti**, con "Player 1" e "Player 2" scritti come
  suggerimento e non come nome scelto. Prima erano precompilati con i primi
  quattro profili: una squadra che nessuno aveva composto, che si confermava
  senza guardarla.
- **Il tabellone parte vuoto con lo zero suggerito** e passa da solo alla casella
  successiva. Il salto è immediato per lo zero e per le cifre dal 3 in su, che
  non possono diventare un numero più lungo; per l'1 e il 2 aspetta mezzo secondo,
  perché aprono a 10-20 (il super tie-break). Con un salto immediato su tutte le
  cifre un 10-8 finiva spezzato in due caselle; con un'attesa su tutte, un 6-4
  sembrava lento.
- **La nota non c'è più.** Restava vuota quasi sempre, e quello che di una
  partita vale la pena ricordare sta nel punteggio. Le note già scritte non si
  perdono: il valore continua a viaggiare al salvataggio.

Gli altri fogli — creazione torneo, votazione pizza — sono ancora quelli vecchi:
si rifanno uno alla volta, prendendo da qui.

### I due tasti in cima alla home sono un nastro, non una dissolvenza
`+ PLAY` e `+ TOURNAMENT` stanno uno accanto all'altro, staccati del passo della
colonna (10px, lo stesso fra un tasto e una card), e si scorre fra loro col dito.
Prima uno sfumava nell'altro e sembrava che il tasto si trasformasse; così si
vede che sono due. Il tasto che non è in scena esiste solo mentre il nastro si
muove: fermo sporgerebbe dallo schermo e `.content`, che scorre in verticale,
diventerebbe scorrevole anche di lato.

Lo spostamento del nastro è uno stato React e non una scrittura sullo stile,
così il cambio di faccia e lo spostamento finiscono nello stesso disegno: fatti
in due passaggi, per un fotogramma si vedrebbe il tasto nuovo già in scena e il
nastro ancora spostato, cioè il tasto fuori dallo schermo.

### Gli emblemi del profilo camminano da soli
Sul telefono non ci stanno in riga. Prima si trascinavano col dito, e chi non ci
provava vedeva sempre e solo i primi tre. Adesso la fila cammina da sola, senza
fine: è scritta due volte, e quando l'animazione torna a zero la copia sta dove
stava la prima. Se ci stanno tutti il nastro resta fermo. Con questo è sparito
anche lo scorrimento laterale della pagina del profilo: la striscia sporgeva di
venti pixel per lato con un margine negativo, e bastavano quelli.

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
