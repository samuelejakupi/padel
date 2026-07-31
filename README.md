# Padel House

Un piccolo club digitale per tenere lo storico delle partite di padel tra amici. Include:

- accesso email/password con Supabase;
- massimo 10 profili;
- foto profilo;
- partite 2 contro 2 con due o tre set;
- ranking Elo aggiornato automaticamente;
- classifica, win rate, serie positiva/negativa e storico;
- layout responsive per telefono e desktop;
- pubblicazione automatica su GitHub Pages.

Il progetto non contiene dati dimostrativi: senza credenziali Supabase mostra una
schermata di configurazione e non simula utenti o partite.

## 1. Prepara Supabase

1. Crea un progetto su Supabase.
2. Apri **SQL Editor**, crea una nuova query e incolla tutto il contenuto di `supabase/schema.sql`.
3. Esegui la query.
4. In **Authentication → URL Configuration**, imposta **Site URL** con l’indirizzo GitHub Pages finale, per esempio:
   `https://nomeutente.github.io/nome-repository/`
5. In **Project Settings → API**, copia:
   - Project URL
   - anon / publishable key

Lo script crea anche il contenitore `avatars`, le regole di sicurezza e il limite di 10 membri.

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

## 3. Pubblica su GitHub Pages

1. Crea un repository GitHub e carica questo progetto sul branch `main`.
2. Nel repository apri **Settings → Secrets and variables → Actions → Variables**.
3. Aggiungi:
   - `SUPABASE_URL`
   - `SUPABASE_ANON_KEY`
4. Apri **Settings → Pages** e seleziona **GitHub Actions** come origine.
5. Il workflow incluso pubblica automaticamente il sito a ogni aggiornamento del branch `main`.

Il percorso del repository viene rilevato automaticamente, quindi il sito funziona sia su
`nomeutente.github.io` sia su `nomeutente.github.io/nome-repository`.

## Comandi utili

```bash
npm run dev
npm run build
npm test
npm run lint
```
