# Kaizen — Consegna Fase 2

Implementazione locale del 13 ottobre 2026. Nessun commit, push, deploy,
nuova dipendenza, migrazione SQL o modifica a servizi esterni.

## Funzionalità

Dentro ogni azione di un progetto è disponibile una checklist a un solo livello:
creazione, rinomina, completamento/riapertura, eliminazione e riordino con frecce
utilizzabili anche da telefono e tastiera. Contatore completate/totale e barra
mostrano il progresso. A checklist completata compare **Completa anche l’azione**:
il genitore cambia stato solo con un comando dell’utente.

Completare un genitore non completa le sotto-azioni; riaprire una sotto-azione non
riapre automaticamente il genitore. Se i due stati divergono, compare un richiamo.

**Mostra in Prossime Azioni** rende disponibile la stessa azione in Focus. Non
viene creato un record in `nextActions`: resta il record originale in
`projectActions`, con lo stesso ID e i medesimi figli. Il progetto di origine è
indicato nella vista Focus. Completamento, checklist e riferimenti al calendario
continuano a usare questa identità. Rimuoverla da Prossime Azioni non la elimina.

Le sotto-azioni non ricevono punti e non entrano nei badge della Fase 1.
Un’azione condivisa contribuisce al riepilogo di navigazione di Focus, senza
essere sommata nuovamente al riepilogo GTD; nel suo progetto resta visibile il
contatore contestuale delle azioni incomplete. Le azioni non condivise mantengono
il comportamento precedente. Abitudini, cambio giornata e sicurezza AI non sono
stati modificati da questa fase.

## Dati, offline e conflitti

La nuova collezione `subActions` usa la tabella JSON già esistente
`kaizen_records` e la coda local-first. Non richiede modifiche a Supabase.
I dati preesistenti non ricevono sotto-azioni, flag o conversioni automatiche.

Ogni sotto-azione ha un `entityId` stabile e un `parentActionId`. Le modifiche
sono versioni immutabili con ID diversi e collegamenti `supersedes` alle versioni
viste dall’utente. Anche l’eliminazione è una versione: scompare dall’interfaccia,
senza cancellare lo storico necessario a ricostruire i conflitti.

Questo evita che due scritture concorrenti della stessa sotto-azione si
sovrascrivano, anche se avvengono entrambe dopo aver letto lo stesso stato remoto.
Le modifiche a figli diversi si uniscono; quelle concorrenti allo stesso figlio
restano visibili come versioni da confrontare. Il contatore conta una sola
sotto-azione logica. **Usa questa versione** conferma la scelta; **Scarta questa
versione** conserva l’alternativa. In caso di modifica contro eliminazione,
l’avviso lo esplicita. Il riordino e la proposta di completamento restano sospesi
finché la checklist contiene conflitti. La casella manuale del genitore resta
sempre disponibile.

Se l’azione o il progetto viene eliminato, le sotto-azioni superstiti compaiono
in **GTD → Progetti → Sotto-azioni da ricollegare**: possono essere assegnate a
un’altra azione o eliminate esplicitamente. Non vengono cancellate a cascata.

La lettura remota ora recupera tutte le pagine, evitando il troncamento di uno
storico oltre il limite per risposta. Un errore di pagina interrompe il recupero
prima di sostituire i dati locali. Le versioni delle sotto-azioni sono escluse
dalle proposte di rimozione dei duplicati basate sul contenuto.

La paginazione usa il conteggio esatto per fermarsi all’ultima pagina, senza
richiedere un intervallo fuori dal totale. Riferimenti:
[Supabase select](https://supabase.com/docs/reference/javascript/select) e
[PostgREST: intervallo oltre il totale](https://github.com/PostgREST/postgrest/issues/2824).

## Verifiche

| Verifica | Risultato |
| --- | --- |
| `npm test` | 106 test superati, zero fallimenti: 92 precedenti e 14 nuovi |
| `npm run build` | Superata; rimane l’avviso del bundle JavaScript oltre 500 kB |
| `npm run test:visual` | Desktop 1280×900 e mobile 390×844, senza overflow orizzontale nelle viste controllate |
| Checklist nel browser | Creazione, rinomina, frecce, completa/riapri, elimina, contatore e conferma del genitore |
| Identità condivisa | Modifica da Focus visibile nel progetto, nessuna copia in `nextActions` |
| Persistenza offline | Modifiche, ordine e cancellazione presenti dopo reload offline |
| Conflitti | Versioni concorrenti visualizzate e risolte dal browser; unit test anche per eliminazione/modifica e riordino/modifica |
| Compatibilità Fase 1 | Test di badge, ricorrenze, navigazione e script offline precedenti superati |
| Integrità | Genitori invariati durante la gestione dei figli; azioni legacy preservate nel round trip; recupero orfani |
| Sincronizzazione | Simulazioni di coda, riavvio, riconnessione, replay idempotente e due dispositivi; paginazione su 1.203 record |

Le prove usano dati sintetici e browser temporanei. Nessuna chiamata AI a pagamento.
Screenshot e risultati del browser sono in `outputs/phase2/`, ignorati da Git.

## Limiti e prova successiva

- La verifica con due dispositivi fisici sul servizio pubblicato non è stata
  eseguita, perché non è autorizzato un deploy. Per usare la nuova funzionalità
  su entrambi servirà la stessa versione dell’app.
- Lo storico delle versioni aumenta lo spazio locale e remoto. Non è stata
  introdotta una cancellazione automatica dello storico o una compattazione.
- L’architettura a versioni riguarda le nuove sotto-azioni. La gestione dei
  conflitti delle altre collezioni resta quella esistente.
- Non sono inclusi priorità quotidiane, Time Blocking, nuovi riconoscimenti AI
  o Indice di Crescita. Fase 3 non iniziata.

## Come provare

1. Avvia `npm run dev` e apri l’indirizzo locale indicato.
2. In **GTD → Progetti**, apri un progetto e poi **Sotto-azioni · aggiungi**
   dentro un’azione. Inserisci due elementi.
3. Rinomina un elemento e riordinali con **↑ / ↓**. Spunta e riapri una casella.
4. Completa entrambe: il genitore deve restare aperto. Premi **Completa anche
   l’azione** solo se vuoi chiuderlo, poi riaprilo dalla sua casella.
5. Premi **Mostra in Prossime Azioni**, apri **Home → Focus** e modifica la
   checklist. Tornando al progetto ritrovi la stessa modifica.
6. Per l’offline usa `npm run build` e `npm run preview`, carica l’app online
   almeno una volta, passa offline, modifica la checklist e ricarica.
7. Per le prove automatiche lascia aperto
   `npm run preview -- --host 127.0.0.1 --port 4176`, poi esegui
   `npm run test:visual` e `npm run test:offline`. Richiedono Chrome locale;
   non impostare un URL di produzione come `TARGET_URL`.

## File della Fase 2

Nuovi:

- `src/lib/subActions.js`: versioni, comandi, progresso e viste condivise.
- `src/lib/remoteRecords.js`: lettura remota paginata.
- `src/components/ProjectActionDetails.jsx`: checklist e recupero orfani.
- `tests/subActions.test.js`: dominio, integrità, conflitti e paginazione.
- `scripts/sub-actions-check.mjs`: controlli browser della Fase 2.
- `PHASE2.md`: questa consegna.

Aggiornati:

- `src/App.jsx`: comandi e stato condiviso; completamento dello stesso genitore.
- `src/components/GtdPage.jsx`: checklist nelle azioni del progetto.
- `src/components/Home.jsx`: azioni condivise e checklist in Focus.
- `src/lib/kaizenData.js`: registrazione della collezione locale `subActions`.
- `src/lib/attention.js`: conteggio unico delle azioni condivise nella navigazione.
- `src/lib/syncCore.js`: protezione dello storico nelle proposte di deduplicazione.
- `src/hooks/useKaizenSync.js`: uso della lettura paginata.
- `src/styles.css`: layout della checklist e dei conflitti su desktop/mobile.
- `scripts/visual-check.mjs`: aggiunta delle prove Fase 2 alle verifiche esistenti.

Le modifiche non ancora committate della Fase 1 restano nel workspace e non sono
state annullate. Nessun file di configurazione esterno è stato modificato.
