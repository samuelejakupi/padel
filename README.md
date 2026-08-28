# TheBoyz · Group HQ

Il sito di gruppo dei TheBoyz. La prima versione include:

- home comune con le sezioni del gruppo;
- sezione Padel con storico e ranking;
- sezione Pizzeria Ranking con voto pesato per criterio e classifica aggiornata in tempo reale;
- accesso email/password con Supabase;
- massimo 8 profili;
- foto profilo;
- partite 2 contro 2 con due o tre set;
- ranking Padel Elo aggiornato automaticamente;
- classifica, win rate, serie positiva/negativa e storico;
- scheda giocatore con andamento Elo e storico personale;
- layout responsive per telefono e desktop;
- pubblicazione automatica su Vercel.

Il progetto non contiene dati dimostrativi: senza credenziali Supabase mostra una
schermata di configurazione e non simula utenti o partite.

Prima di modificare il progetto, leggi `CONVENTIONS.md`: raccoglie le regole e lo stile da seguire per restare coerenti con il codice esistente.

## Account riservati

La registrazione pubblica non è disponibile. Gli account previsti sono Samu,
Dani, Atti, Matte, Fabio, Alban, Mattia e Manu (massimo 8 profili). Il frontend converte il nome selezionato in
un’identità Supabase interna; gli indirizzi tecnici non vengono mostrati.

Gli account vanno amministrati direttamente dal pannello Supabase. La service
role key e le password non devono mai essere aggiunte alle Repository variables,
ai file `.env` pubblicati, alle GitHub Actions o al codice frontend.

## 1. Prepara Supabase

1. Crea un progetto su Supabase.
2. Apri **SQL Editor**, crea una nuova query e incolla tutto il contenuto di `supabase/schema.sql`.
3. Esegui la query.
4. Crea una seconda query con `supabase/migration-pizza-sessioni.sql` ed eseguila. Va rilanciata anche su un progetto esistente per sostituire il vecchio timer con i partecipanti.
5. Sui progetti esistenti esegui `supabase/migration-pizza-personale.sql` per aggiungere votazioni singole, classifica Personale e relative regole di privacy.
6. Esegui `supabase/migration-pizza-voti-0-10.sql` per uniformare i criteri a 0–10, calcolare il risultato nel backend e consentire al creatore di eliminare una votazione aperta.
7. Esegui anche `supabase/migration-tornei.sql` per abilitare tornei, calendario e moltiplicatore Elo.
8. Esegui `supabase/migration-partite-casuali.sql` dopo `supabase/migration-pareggi.sql` per creare partite con squadre casuali e registrarne il risultato in seguito.
9. Esegui `supabase/migration-partite-un-set.sql` per consentire partite secche da un set, con Elo e progressi degli emblemi dimezzati.
10. Esegui `supabase/migration-trofei-immagine.sql` per associare ai tornei le immagini della sala trofei.
11. In **Authentication → URL Configuration**, imposta **Site URL** con l’indirizzo Vercel finale, per esempio:
   `https://nome-progetto.vercel.app/`
12. In **Project Settings → API**, copia:
   - Project URL
   - anon / publishable key

Lo script crea anche il contenitore `avatars`, le regole di sicurezza e il limite di 8 membri.

## 2. Prova in locale

Copia `.env.example` in `.env.local` e inserisci Project URL e anon key:

```env
NEXT_PUBLIC_SUPABASE_URL=https://xxxxx.supabase.co
NEXT_PUBLIC_SUPABASE_ANON_KEY=xxxxx
NEXT_PUBLIC_BASE_PATH=
NEXT_PUBLIC_SITE_URL=http://localhost:3000
```

Poi avvia:

```bash
npm install
npm run dev
```

## 3. Pubblica su Vercel

1. Importa il repository GitHub in un nuovo progetto Vercel con preset **Next.js**.
2. In **Project Settings → Environment Variables** aggiungi per Production e Preview:
   - `NEXT_PUBLIC_SUPABASE_URL`
   - `NEXT_PUBLIC_SUPABASE_ANON_KEY`
   - `NEXT_PUBLIC_SITE_URL`, con il dominio Vercel di produzione.
3. Ogni aggiornamento del branch `main` viene pubblicato automaticamente; gli altri branch ricevono un URL di anteprima.

Il vecchio workflow GitHub Pages resta eseguibile manualmente come fallback, ma non parte più a ogni push.

## Comandi utili

```bash
npm run dev
npm run build
npm test
npm run lint
```
