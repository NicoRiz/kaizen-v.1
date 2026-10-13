# Kaizen — Fase 1

Implementazione locale, verificata il 13 ottobre 2026. Nessun push, deploy,
intervento su Supabase o chiamata AI reale. Dipendenze invariate.

## Comportamento implementato

- Inbox: elementi aperti, con accesso al primo elemento da chiarire.
- Prossime Azioni: solo azioni incomplete; il badge porta alla lista operativa.
- Abitudini: due gruppi distinti, quotidiane previste oggi e obiettivi settimanali
  (lunedì–domenica). Il numero indica abitudini/obiettivi ancora incompleti,
  non il totale delle sessioni. Le quantità devono raggiungere il target.
- Le abitudini completate restano modificabili. La sessione settimanale di oggi
  può essere annullata. Le note esistenti sopravvivono alle registrazioni rapide.
- Progetti: conteggio delle azioni incomplete sul pulsante che apre ogni progetto.
  I progetti rinviati non producono richiami nella navigazione.
- Home/Focus e GTD: richiami di navigazione quando ci si trova altrove.
  Sono riepiloghi delle rispettive sezioni, non nuove attività da sommare.
- I badge spariscono a zero. Calendario, note, archivio e progetti rinviati non
  aggiungono conteggi generici: pianificare la stessa azione più volte non crea
  ulteriori attività da completare.
- Data aggiornata a mezzanotte, al ritorno nella finestra e alla riattivazione
  della pagina, usando il calendario locale del dispositivo (anche con ora legale).

I conteggi sono derivati dallo stato condiviso e non vengono salvati né
sincronizzati separatamente. La sostituzione dei dati dopo la sincronizzazione
ricalcola gli stessi indicatori. Due dispositivi con dati e data locale uguali
producono gli stessi conteggi; dispositivi ancora offline possono differire.

Per le registrazioni della stessa abitudine/giornata create da dispositivi diversi,
la lettura sceglie il record con `updatedAt` più recente e, a parità, con ID maggiore
in ordine lessicografico. Una copia di conflitto non sostituisce il proprio originale
ancora presente. Nessun record viene cancellato o migrato. Le copie di conflitto
delle azioni restano visibili, ma la famiglia viene contata una sola volta se contiene
un'azione incompleta. La risoluzione definitiva dei conflitti resta nel flusso esistente.

## Endpoint Journal

`api/analyze-journal.js` ora richiede `Authorization: Bearer <access_token Supabase>`.
La sessione viene verificata presso `/auth/v1/user` prima di contattare OpenAI;
sessioni mancanti, non valide o anonime sono respinte. Se la verifica non è
disponibile, l'endpoint non esegue l'analisi.

Usa le variabili già previste: `VITE_SUPABASE_URL`,
`VITE_SUPABASE_PUBLISHABLE_KEY`, `OPENAI_API_KEY`, `OPENAI_MODEL`.
La chiave OpenAI resta sul server. Provider, modello predefinito e schema della
risposta sono conservati. Nessuna nuova funzione AI viene attivata nell'interfaccia:
il componente legacy DailyNotes non è collegato a un chiamante attivo in App.
Un eventuale client esterno/legacy deve inviare il token di sessione; richieste
anonime prima accettate ricevono intenzionalmente 401.

Protezioni locali per utente e per istanza server:

- una sola analisi contemporanea;
- massimo due tentativi in 60 secondi e dieci in un'ora;
- i tentativi falliti consumano il limite, senza retry automatici;
- timeout di verifica sessione di 8 secondi e di analisi di 25 secondi;
- risposte non memorizzabili in cache e messaggi distinti per quota/credito
  indisponibile, eccesso di richieste e timeout.

**Limite residuo:** i contatori risiedono nella memoria della singola istanza.
Non sono un limite globale di spesa: si azzerano al riavvio e non sono condivisi
tra istanze Vercel. Per chiudere questo punto serve autorizzare un archivio
condiviso con aggiornamenti atomici (ad esempio una funzione/tavola dedicata in
Supabase con accesso protetto). Nessuna migrazione o configurazione esterna è
stata effettuata. La sola autenticazione non impone un budget complessivo a tutti
gli utenti del progetto. Le funzioni non AI non dipendono da questo endpoint.

Riferimenti verificati: [verifica utente Supabase](https://supabase.com/docs/reference/javascript/auth-getuser)
e [gestione errori OpenAI](https://developers.openai.com/api/docs/guides/error-codes).

## Verifiche eseguite

| Controllo | Esito |
| --- | --- |
| `npm test` | 92 test superati, zero fallimenti |
| `npm run build` | Superata; avviso bundle JavaScript oltre 500 kB |
| `npm run test:visual` | Superato a 1280×900 e 390×844; nessun overflow orizzontale nelle sezioni controllate |
| Interazioni browser | Completa/riapri azioni e progetti, target quantitativo, sessioni settimanali, click sui badge |
| Cambio data | Ritorno all'app nel giorno e nella settimana successivi; storico invariato |
| `npm run test:offline` | Apertura offline, navigazione, modifica locale, badge Inbox e coda preservati dopo reload |
| Sincronizzazione simulata | Round trip, aggiornamenti offline, conflitti conservati, conteggi uguali sui due dispositivi simulati |
| API con risposte simulate | Autenticazione, configurazione mancante, limiti, credito, timeout, risposta valida e malformata |

Browser isolati con dati sintetici; nessun test ha modificato i dati personali.
La prova con due dispositivi fisici e l'API effettivamente pubblicata resta da fare
dopo un deploy autorizzato. Il test API non prova disponibilità del modello o saldo.
Le segnalazioni di quota localStorage nella suite sono errori simulati attesi.

Screenshot e dettagli del browser: `outputs/phase1/` (file locali ignorati da Git).

## Come provare

1. Avvia `npm run dev` e apri l'indirizzo locale indicato. Per una prova offline
   usa `npm run build` e `npm run preview`, così viene attivata la PWA.
2. Crea due abitudini quotidiane e una settimanale con target 1. Completa una
   quotidiana: il badge di oggi deve scendere da 2 a 1. Completale entrambe:
   il badge scompare. Riaprine una: torna a 1.
3. Registra la sessione settimanale e poi annullala: il relativo badge scompare
   e ricompare senza cambiare quello quotidiano.
4. Completa e riapri un'azione in Focus e una nel progetto. Controlla i badge
   delle sezioni e i richiami Home/GTD quando navighi altrove; cliccali.
5. Pianifica più volte una stessa azione: il numero delle attività non aumenta.
6. Con la PWA già caricata, passa offline, modifica un'attività e ricarica.
   La modifica e il badge devono restare presenti. Dopo il ritorno online e
   la sincronizzazione, confronta un secondo dispositivo sulla stessa data.
7. Al giorno successivo le quotidiane ripartono; le settimanali ripartono lunedì.
   Non occorre cancellare registrazioni o ricaricare manualmente la pagina.

Per ripetere i test browser automatici, lascia in esecuzione
`npm run preview -- --host 127.0.0.1 --port 4176`, poi usa gli script di test.
Richiedono Chrome locale; `CHROME_PATH`, `TARGET_URL` e `OUT_DIR` (solo visual)
permettono di adattare i percorsi. Non usare un URL di produzione come TARGET_URL.

## File modificati o aggiunti

- `src/App.jsx`: data reattiva e distribuzione dei conteggi.
- `src/lib/attention.js`: selettori condivisi dei badge.
- `src/lib/habits.js`: lettura deterministica delle registrazioni e conservazione delle note.
- `src/hooks/useToday.js`, `src/utils/date.js`: cambio giornata.
- `src/components/AttentionBadge.jsx`: badge riutilizzabile e navigazione locale.
- `src/components/Home.jsx`, `TodayHabits.jsx`, `GtdPage.jsx`, `BottomNav.jsx`,
  `HomeSectionNav.jsx`: collocazione e aggiornamento degli indicatori.
- `src/styles.css`: stile coerente con i contatori esistenti.
- `api/analyze-journal.js`, `server/journalSecurity.js`: protezione endpoint.
- `tests/attention.test.js`, `tests/journalSecurity.test.js`: nuovi test automatici.
- `scripts/visual-check.mjs`, `scripts/offline-check.mjs`: interazioni badge e controlli offline.
- `PHASE1.md`: questa consegna.

Fase 2 non iniziata. Nessuna sotto-azione, nuova priorità, Time Blocking,
riconoscimento dei traguardi o nuovo Indice Kaizen è stato implementato.
