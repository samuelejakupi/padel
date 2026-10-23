# Regole di stile · TheBoyz

Questo file esiste perché il sito lo tocchiamo in due. Le regole qui sotto non
sono gusti personali: servono a far sì che una schermata scritta da uno non
sembri di un altro sito rispetto a quella scritta dall'altro.

Tutti i valori vivono in `:root`, in cima a `app/globals.css`. **Prima di
scrivere un numero nuovo, controlla se esiste già la variabile.**

---

## 1. Colori

| Variabile | Valore | Quando si usa |
|---|---|---|
| `--ink` | `#0b1b2c` | Testo principale, blocchi scuri, barra di stato |
| `--ink-soft` | `#183346` | Etichette dei campi |
| `--paper` | `#f3f5f1` | Fondo della pagina |
| `--white` | `#ffffff` | Card e pannelli |
| `--blue` | `#18dfe4` | Accento del marchio, 2° e 3° posto |
| `--blue-dark` | `#05aeb7` | Stesso accento quando serve contrasto su bianco |
| `--blue-deep` | `--blue-dark` verso `--ink` | Testo azzurro piccolo su carta o bianco (occhielli), contrasto 5:1 |
| `--lime` | `#efff00` | 1° posto, trofei rari, voce attiva su fondo scuro |
| `--line` | `#dce2dc` | Bordi e separatori |
| `--muted` | `#5f6b76` | Testo secondario |
| `--danger` | `#d94b49` | Errori, record negativi, uscita (fondi, barre, pallini) |
| `--positive` | `#299b66` | Guadagni Elo, serie positive (fondi, barre, pallini) |
| `--danger-text` | `--danger` verso `--ink` | Rosso usato **come testo** |
| `--positive-text` | `--positive` verso `--ink` | Verde usato **come testo** |

**Colore e testo non sono la stessa cosa.** `--blue-dark`, `--positive` e
`--danger` pieni, come testo piccolo su bianco o carta, non arrivano al
contrasto minimo (4.5:1): per il testo si usano `--blue-deep`,
`--positive-text` e `--danger-text`. I colori pieni restano per fondi, barre,
bordi e pallini. Anche `--muted` è stato scurito da `#72808c` a `#5f6b76` per
lo stesso motivo.

Le card delle sezioni in home non hanno un colore ciascuna: sono tutte
chiare col filo animato azzurro-lime dei tasti `cta-aurora`.

Per le tinte intermedie ci sono i **veli**, cioè il blu scuro a bassa opacità:

| Variabile | Uso |
|---|---|
| `--veil-1` | Fondo dell'hover su bianco |
| `--veil-2` | Tasti secondari, separatori di riga |
| `--veil-3` | Hover dei tasti secondari, tracce di progresso |
| `--ink-30` | Testo disattivato, segni grafici |
| `--ink-45` | Testo non classificato |

**Non si scrivono colori in esadecimale nelle regole.** Se serve una tinta più
chiara o più scura di una esistente, si usa un velo, `rgba()` sul colore di
base, oppure `color-mix()`:

```css
/* sì */   color: var(--ink-45);
/* sì */   background: rgba(217, 75, 73, 0.1);
/* no */   color: #6e7a85;
```

Eccezioni ammesse, perché rappresentano un dato e non un'interfaccia: i quattro
colori delle categorie della pizza, le rarità degli accessori delle build
(`--rarity-*`) e il gradiente di riempimento degli avatar senza foto.

Il motivo è pratico: cinque grigi quasi uguali scritti a mano non si notano
uno per uno, ma insieme fanno sembrare la pagina sporca — e il giorno che si
cambia il blu del marchio restano indietro tutti.

Le uniche eccezioni ammesse sono i colori che rappresentano un dato e non
un'interfaccia: le categorie della pizza, per esempio.

---

## 2. Angoli

| Variabile | Valore | Cosa |
|---|---|---|
| `--radius-sm` | `4px` | Chip, etichette, badge della serie |
| `--radius-md` | `7px` | Tasti e campi di testo |
| `--radius` | `9px` | Card, righe di classifica, pannelli |
| `--radius-lg` | `18px` | Modali, barra mobile |
| `--radius-pill` | `999px` | Pillole e interruttori |
| `50%` | — | Solo per cerchi veri: avatar, tasti tondi |

Cinque gradini bastano. Un 6px in mezzo a dei 7px non si vede da solo ma si
vede quando due elementi sono affiancati.

---

## 3. Spaziature

| Variabile | Valore | Uso tipico |
|---|---|---|
| `--space-1` | `4px` | Fra numero ed etichetta |
| `--space-2` | `8px` | Dentro una card |
| `--space-3` | `10px` | **Passo base**: fra card, fra righe di un elenco |
| `--space-4` | `12px` | Fra colonne di una riga |
| `--space-5` | `16px` | Fra gruppi dentro una sezione |
| `--space-6` | `22px` | Padding interno delle card |
| `--space-7` | `28px` | Fra sezioni |
| `--space-8` | `40px` | Fra blocchi grandi di pagina |

La regola che conta più di tutte: **il passo fra due elementi della stessa
famiglia è sempre lo stesso**. Se fra la seconda e la terza card ci sono 10px,
fra la prima e la seconda non possono essercene 28 solo perché in mezzo
finisce il bordo di un contenitore.

---

## 4. Testo

Il font è **Inter**, caricato da Google Fonts con questi pesi e nessun altro:

```
400 · 600 · 700 · 800 · 900   (+ corsivo 700, 800, 900)
```

**Usa solo questi cinque numeri.** Scrivere `font-weight: 950` non produce un
peso intermedio: il browser non ha quel file e arrotonda al più vicino
disponibile, quindi `950` e `1000` disegnano esattamente lo stesso testo di
`900`. Sono numeri che danno l'illusione di una scala che non esiste.

Scala tipografica in uso:

| Dimensione | Peso | Cosa |
|---|---|---|
| `clamp(34px, 4vw, 56px)` | 900 | Titolo di pagina |
| `27px` | 900 | Titolo di sezione |
| `15px` | 400 | Testo corrente |
| `13px` | 700 | Numeri delle statistiche |
| `12px` | 900 | Tasti, nomi in classifica |
| `10px` | 800/900 | Occhielli, etichette, unità di misura |

Le etichette in maiuscolo vogliono sempre `letter-spacing` fra `0.4px` e
`1px`: il maiuscolo senza spaziatura si legge male.

**Mai sotto i 9px.**

---

## 5. Movimento

- Transizione standard: `160ms ease`. Per le cose grandi (modali, pannelli in
  vetro) si arriva a `220ms`.
- **L'hover ingrandisce, non sposta**: `transform: scale(1.02)`, mai
  `translateY`. Gli spostamenti fanno "saltare" la pagina.
- Ogni effetto `:hover` va dentro `@media (hover: hover)` oppure neutralizzato
  in `@media (hover: none)`. Su touch il `:hover` resta attaccato dopo il tocco
  e l'elemento rimane ingrandito finché non tocchi altrove.
- Chi ha attivato la riduzione del movimento non deve vedere animazioni: c'è
  già un blocco `@media (prefers-reduced-motion: reduce)` in fondo al file.
  Ogni animazione nuova va fermata anche lì.

### Il filo aurora

È l'unico effetto animato "di marca": un bordo con gradiente conico
azzurro-lime che gira in 6 secondi su un fondo bianco. Si ottiene con le
classi `button cta-new-match cta-aurora` (variante `button-lime` per il filo
che parte dal lime). Si usa **solo** per:

- i tasti d'azione principali di una sezione (Nuovo match, Nuovo torneo,
  Carica GB, Aggiungi build);
- le card delle sezioni in home (stesso filo, partenze sfasate);
- il contorno delle icone delle armi nelle build.

Non va su tasti secondari, filtri o elementi che si ripetono in elenchi
lunghi: se gira tutto, non spicca niente. Con la riduzione del movimento il
filo resta, smette solo di girare.

---

## 6. Accessibilità

Il minimo è WCAG 2.1 AA. In pratica:

- **Contrasto**: 4.5:1 per il testo normale, 3:1 per il testo grande (dai
  24px, o 19px in grassetto) e per bordi e icone che servono a capire. Vedi
  le varianti `-text` dei colori sopra.
- **Bersagli da 44px**: tasti, filtri, tendine (`summary`) e tasti a icona
  sono alti almeno 44px. Il tasto di chiusura delle modali è 44×44.
- **Tastiera**: tutto ciò che si clicca si raggiunge col Tab e mostra il
  focus (`:focus-visible`). Un'area che scorre di lato (tabelle) prende
  `tabIndex={0}`, `role="region"` e un `aria-label`.
- **Gruppi di tasti** (modalità, filtri): contenitore con `role="group"` e
  `aria-label`; il tasto scelto ha `aria-pressed`. Senza `role`, l'etichetta
  del contenitore non la legge nessuno.
- **Titoli in ordine**: un `h1` per pagina, poi `h2`, poi `h3`, senza saltare
  livelli. Mai un titolo dentro un `button`: si usa uno `span` con la classe
  del titolo.
- **Ruoli giusti**: `role="button"` va su un `div`, non su `article`;
  `role="tooltip"` va su un `div`, non su `aside`.
- **Decorazioni**: numeri e segni puramente decorativi prendono
  `aria-hidden="true"`, ma devono comunque restare leggibili (3:1).
- **Moduli**: ogni campo ha la sua `label`; gli errori stanno in un
  elemento con `role="alert"` e dicono cosa correggere.

---

## 7. Come si scrive una regola

- **Proprietà in ordine alfabetico** dentro il blocco. È la convenzione già
  usata in tutto il file: serve a trovare le cose senza leggerle tutte.
- **Un commento sopra le scelte non ovvie**, in italiano, che spieghi *perché*
  e non *cosa*. `/* margin-bottom: 0 */` non serve a nessuno; "il blocco scuro
  perde il margine perché il passo lo porta il pannello sotto" sì.
- **Niente `!important`.** Se serve, vuol dire che il selettore va reso più
  specifico o che la regola sta nel posto sbagliato.
- **Niente stili inline** nel JSX, salvo valori calcolati a runtime (larghezza
  di una barra di progresso, immagine di sfondo che arriva dai dati).

---

## 8. Struttura

- Le classi seguono il blocco a cui appartengono: `.match-card`,
  `.match-card-link`, `.match-history-list`. Niente nomi generici come
  `.box` o `.wrapper`.
- Le varianti si scrivono come classe aggiuntiva, non come selettore
  posizionale: `.ranking-row-gold`, non `.ranking-row:first-child`. La
  posizione cambia, il significato no.
- Tailwind è importato ma **non lo usiamo nel JSX**: lo stile sta in
  `globals.css`. Meglio una convenzione sola applicata male che due applicate
  bene.
- Eccezione: le parti grandi e a sé, con componenti propri, possono avere un
  CSS module accanto (`app/loadouts/Loadouts.module.css`,
  `app/CodProfile.module.css`). Stesse variabili, stesse regole di questo
  file; nei module i `@keyframes` sono locali.

---

## 9. Immagini delle armi (Gaming)

- Ogni arma ha in `public/gaming/loadouts/weapons/`: `<id>.png` (1024×1024,
  trasparente, arma quasi monocromatica con contorno e glow), `<id>.svg`
  (sagoma, un solo tracciato pieno), `<id>-body.png` e `<id>-outline.png`
  (arma e contorno separati, per il filo aurora).
- **Non si disegnano a mano**: si mette l'immagine laterale dell'arma in
  `scripts/weapon-sources/<id>.png` e si lancia
  `python3 scripts/weapon-icons.py`. Le icone degli slot e le sagome di
  categoria si rigenerano con `scripts/render-weapon-icons.mts`.
- L'inclinazione (-11°) la dà il CSS, non il file.

---

## 10. Prima di aprire una pull request

- [ ] Nessun colore esadecimale nuovo
- [ ] Angoli e spaziature presi dalle variabili
- [ ] Pesi del testo solo fra 400, 600, 700, 800, 900
- [ ] Testo colorato con le varianti `-text` / `--blue-deep`, non coi colori pieni
- [ ] Tasti e filtri alti almeno 44px, con focus visibile
- [ ] Titoli in ordine, niente titoli dentro i tasti
- [ ] Animazioni nuove fermate in `prefers-reduced-motion`
- [ ] Provato su mobile stretto (360px) e su desktop
- [ ] Gli hover non spostano nulla e non restano attaccati su touch
