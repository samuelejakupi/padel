# Regole e convenzioni del progetto

Documento di riferimento per chiunque (persona o assistente AI) modifichi questa repo. Obiettivo: cambiamenti piccoli e coerenti con quello che c'e gia, senza rompere build, test o deploy.

## Stack e vincoli

- Next.js 16 (App Router) in modalita static export (`output: "export"` in `next.config.ts`): niente API route, server actions, middleware o ISR, tutto gira lato client.
- Il sito e pubblicato automaticamente su Vercel a ogni push su `main`; gli altri branch ricevono un URL di anteprima. Ogni push su main e una release in produzione. Il workflow GitHub Pages (`.github/workflows/deploy-pages.yml`) resta come fallback eseguibile a mano, ma non parte piu a ogni push.
- Dati e logica di business vivono in Supabase (Postgres + Auth + Storage), non nel frontend.
- TypeScript in modalita strict, React 19, Tailwind 4 importato in `globals.css` ma non usato con classi utility in JSX: lo stile e tutto CSS custom (vedi sotto).

## Struttura file

- `app/page.tsx` e un unico componente client (`"use client"`) che contiene tutte le sezioni (hub, padel, pizza, profilo) gestite con stato interno (`view`, `padelView`), non con route separate. Nuove sezioni vanno aggiunte come nuovo `View` piu blocco condizionale, seguendo lo stesso pattern.
- `app/layout.tsx`: solo metadata e struttura HTML root, non toccarlo per logica applicativa.
- `lib/supabase.ts`: client Supabase piu tipi condivisi (`Profile`, `PadelMatch`, `PadelSet`, `MatchPlayer`). Aggiungi qui i tipi che servono in piu punti.
- `supabase/schema.sql`: unica fonte di verita per DB, funzioni RPC e policy RLS. E scritto per essere idempotente (rieseguibile senza errori: `create table if not exists`, `create or replace function`, `drop policy if exists` + `create policy`). Ogni modifica allo schema va fatta con lo stesso stile.
- `app/chatgpt-auth.ts` non e collegato a nulla nel frontend attuale (nessun import in `page.tsx`): lasciarlo stare, non fa parte del flusso di autenticazione reale (quello e Supabase Auth in `page.tsx` / `LoginScreen`).

## Convenzioni di naming

- Componenti React e tipi TypeScript: PascalCase.
- Funzioni, variabili, costanti: camelCase.
- Classi CSS: kebab-case, raggruppate per sezione con prefisso (`hub-*`, `pizza-*`, `match-*`, `ranking-*`, ecc.).
- Tabelle, colonne, funzioni SQL: snake_case.

## Accesso ai dati

- Tutte le scritture (nuova partita, eliminazione partita, nuova pizzeria, voto pizzeria) passano da funzioni RPC Postgres (`record_match`, `delete_match`, `create_pizza_restaurant`, `save_pizza_vote`) chiamate via `supabase.rpc(...)`. Non fare insert/update diretti dal client sulle tabelle `matches`, `match_players`, `match_sets`, `pizza_restaurants`, `pizza_votes`: le policy RLS li bloccano comunque per `authenticated`.
- Le letture usano `supabase.from(...).select(...)`.

## Account e autenticazione

- Roster fisso di utenti, definito in due punti che vanno tenuti sincronizzati: l'array `groupUsers` in `app/page.tsx` e la lista di email in `handle_new_user()` dentro `supabase/schema.sql`. Ogni utente e `{nome}@theboyz.local`.
- Registrazione pubblica disattivata volontariamente (vedi `handle_new_user`): non reintrodurre `supabase.auth.signUp`.
- Limite di profili gestito lato SQL (`member_count >= 8`): se cambia il numero di membri, aggiornare anche quel controllo.

## Stile e CSS

- Niente classi utility Tailwind in JSX: aggiungi le nuove classi in `app/globals.css`, riusando le CSS custom properties gia definite in `:root` (`--ink`, `--blue`, `--lime`, `--paper`, ecc.) invece di hardcodare nuovi colori.
- Segui i breakpoint gia presenti (`@media (max-width: 1050px)` e `@media (max-width: 780px)`) per il responsive, non introdurne di nuovi senza motivo.

## Test e verifica prima di committare

- `tests/rendered-html.test.mjs` esegue `npm run build` e poi controlla, con regex molto specifiche, sia l'HTML generato sia il contenuto sorgente di `schema.sql`, `page.tsx` e il workflow. Frasi come "ELO V2", "Bonus Fabio", "Registrazione pubblica disabilitata" o testi come "Gioca la prima partita per entrare nella classifica" devono restare identici, a meno di aggiornare consapevolmente anche il test.
- Prima di considerare una modifica finita: `npm run lint` e `npm test`.
- Non rinominare o rimuovere componenti, funzioni RPC, classi CSS o colonne esistenti senza aver controllato dove sono usate.

## Regola generale

Cambiamenti piccoli e additivi, che riusano pattern e stile gia presenti. In caso di dubbio tra fare qualcosa di nuovo e pulito o adattarsi a come e gia scritto il codice, vince la coerenza con l'esistente.
