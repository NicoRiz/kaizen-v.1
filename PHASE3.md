# Kaizen — Consegna Fase 3

Implementazione locale del 13 ottobre 2026. Nessun push, deploy, intervento SQL,
modifica ai servizi esterni, nuova dipendenza o chiamata AI. Journal AI e Indice
di Crescita non implementati.

## Checkpoint delle Fasi 1 e 2

Creato il commit locale autorizzato **a3266cf** (`Checkpoint verified Kaizen
phases 1 and 2`), dopo 106 test e build superati e controllo dei file da includere.
Esclusi `.codex/`, `.env`, dipendenze, build, profili browser e risultati temporanei.
La Fase 3 rimane nel working tree, senza un ulteriore commit. Lo stato precedente
è recuperabile dal checkpoint; non serve ripristinarlo per confrontare le modifiche.

## Sezione Focus

La gerarchia è **Le mie priorità → Abitudini di oggi → Altre attività**.

- Da una a cinque priorità facoltative; tre suggerite senza obbligo di riempimento.
- Selezione da Prossime Azioni, azioni dei progetti e abitudini pertinenti;
  creazione rapida di una nuova azione in `nextActions`.
- Riferimenti datati `{collection, id}`: nessuna copia dell'azione o abitudine.
- Riordino con frecce, rimozione dal piano, durata, stato e orario visibili.
- Completamento/riapertura di oggi direttamente sul record originale; per le
  abitudini sul log del giorno, conservando la logica quantitativa/settimanale.
- Checklist di progetto condivisa; completarli tutti non chiude il genitore.
- Le azioni prioritarie non sono ripetute in Altre attività. I badge contestuali
  contano gli elementi della rispettiva lista; una priorità di progetto entra
  nel totale Focus una sola volta, senza essere sommata al totale GTD.
- Le abitudini mantengono i gruppi e badge quotidiani/settimanali della Fase 1.
- Selettore della data per pianificare altri giorni e leggere lo storico;
  indicazione esplicita di giornata di riposo o ancora non pianificata.
- Calendario giornaliero espandibile e disposizione verticale su mobile.

## Time Blocking locale

Prima di proporre gli orari occorre salvare la disponibilità della giornata,
espressa come fasce, per esempio `09:00-12:30, 14:00-18:00`. Pause, margine fra
impegni (predefinito 5 minuti) e riserva libera (predefinita 20%) sono modificabili.
Le impostazioni sono datate: non viene presunta disponibilità per giorni futuri.

L'algoritmo unisce gli intervalli occupati, sottrae eventi, blocchi già assegnati,
pause e margini alle fasce disponibili. Colloca le priorità in ordine, mantenendo
le durate scelte e rispettando eventuali orari minimi/massimi e scadenze. Il budget
di assegnazione tiene conto anche dei margini consumati e della riserva libera.
Una priorità che non entra resta segnalata, senza accorciamenti automatici.

**Proponi orari** colloca le attività ancora senza blocco. **Riorganizza il resto
della giornata** può ricollocare quelle incomplete, preservando eventi fissi,
attività completate e blocchi in corso. Se un'attività non trova una nuova
collocazione, il blocco precedente resta e il calcolo delle altre viene rifatto
considerandolo occupato. Entrambi i comandi mostrano un'anteprima da confermare.
Una modifica ai dati dopo la proposta la rende non confermabile fino al ricalcolo.

La pianificazione manuale permette di scegliere orario e durata e rimuovere solo
il blocco. Il comando Verifica orario mostra l'anteprima e gli eventuali vincoli
violati; le eccezioni manuali richiedono una conferma esplicita. Riprogramma sposta
il riferimento a un altro giorno, conservando la motivazione nello storico.

I blocchi sono proiezioni dei piani nella vista calendario: non vengono scritti
duplicati in `calendarItems`. Cliccando un blocco prioritario si apre il relativo
piano, dove modificarlo; il trascinamento di questi blocchi nel calendario è
disabilitato. Gli eventi ordinari mantengono il comportamento precedente.

## Tempo, dati e conflitti

- I piani conservano data civile e fuso IANA. I blocchi conservano istanti ISO,
  visualizzati nel fuso del piano in Oggi e nel fuso del dispositivo nel calendario.
- Le ore ambigue o inesistenti durante il cambio dell'ora vengono rifiutate con
  un messaggio. I giorni di 23/25 ore sono trattati come intervalli reali.
- Gli eventi che attraversano mezzanotte occupano entrambi i giorni interessati.
  Gli eventi tutto il giorno occupano la giornata; quelli senza ora finale certa
  riservano prudentemente il tempo fino a mezzanotte e generano un avviso.
- Gli eventi storici senza fuso sono orari civili: il pianificatore li interpreta
  nel fuso salvato nel piano, in modo coerente tra dispositivi. Non è stata
  inventata o applicata una conversione retroattiva dei vecchi dati.
- Sovrapposizioni, anche introdotte da nuovi dati remoti, sono segnalate: nessun
  evento o piano viene eliminato automaticamente.

La nuova collezione `dayPlans` usa il contenitore JSONB e la coda di sincronizzazione
già esistenti. Lo schema SQL presente nel repository accetta collezioni testuali:
non occorre una migrazione. Nessuna conversione distruttiva dei dati precedenti.

Ogni revisione ha un ID univoco e indica le revisioni sostituite. Modifiche
concorrenti alla stessa giornata restano come versioni da confrontare; l'utente
sceglie esplicitamente quale usare. Entrambe restano nello storico. Giornate
diverse non si sovrascrivono. Le revisioni sono escluse dalla deduplicazione
basata sul contenuto, come già avviene per le sotto-azioni.

Lo storico registra priorità, orari, esiti osservati, riprogrammazioni e riposo,
senza punti. Un giorno senza piano resta distinguibile da un giorno incompleto.
La riapertura di un'azione in un giorno successivo non riscrive l'esito storico.
Gli esiti sono quelli osservati dall'app: non certificano attività mai registrate
o informazioni che un dispositivo non aveva ancora ricevuto.

## Spazio locale

Lettura e proposta non creano revisioni. Salvataggi invariati vengono ignorati,
anche per rinomina/ricollegamento di una sotto-azione. Le modifiche scrivono le
sole collezioni interessate, cache e coda; una coda già salvata non viene rigenerata.

Se una scrittura locale fallisce per quota, il gruppo di scritture viene annullato
e lo stato visualizzato resta quello precedente. Un avviso persistente offre
l'esportazione del backup. Non vengono cancellati automaticamente dati o storico.
Il recupero da errore sincrono è verificato; `localStorage` non offre una transazione
atomica contro la chiusura improvvisa del processo fra due chiavi.

Misura sintetica: cinque priorità e cento modifiche significative producono
105 revisioni, circa **110 kB** di JSON per `dayPlans`, prima delle copie di cache
e coda. Lo storico cresce nel tempo: questa fase non introduce compattazione
o rimozione automatica. Il limite effettivo dipende dal browser e dagli altri dati.

## Verifiche

| Controllo | Esito |
| --- | --- |
| Suite completa | 129 test superati: 106 precedenti + 23 nuovi |
| Build di produzione | Superata; resta l'avviso del bundle JavaScript oltre 500 kB |
| Desktop/mobile | Prove integrate a 1280×900 e 390×844, senza overflow nelle viste controllate |
| Flusso priorità | Selezione, nuova azione, riordino, completa/riapri sul genitore, log abitudine, checklist invariata |
| Pianificazione | Disponibilità obbligatoria, anteprima senza scritture, annulla/conferma, modifica orario/durata, elimina solo blocco, riorganizza |
| Calendario | Blocchi visibili senza record duplicati; apertura del piano corretto |
| Offline | Reload e modifiche con connessione disattivata; piani e revisioni persistenti; test offline precedente superato |
| Conflitti | Simulazioni di due dispositivi e corse di upload; versioni concorrenti visibili e risolvibili nel browser |
| Memoria piena | Scrittura respinta, dati precedenti invariati, avviso visibile; ripresa dopo la rimozione del limite sintetico |
| Tempo | Giorno/settimana, eventi sovrapposti, mezzanotte, assenza di durata, tutto il giorno, DST e fusi diversi |
| Integrità | Azioni non duplicate o eliminate; sotto-azioni e badge delle fasi precedenti verificati |

I test usano profili Chrome temporanei e dati sintetici. Il primo avvio del browser
ha richiesto un percorso temporaneo accessibile e il server locale fuori dal
sandbox; non è stata modificata la configurazione dell'app per risolverlo.
Le prove cloud su due dispositivi fisici restano da eseguire dopo un eventuale
deploy autorizzato. Nessun account reale è stato usato per scrivere dati di test.

## Come provare

1. Avvia l'app in locale e apri **Home → Focus**.
2. Aggiungi una o due priorità esistenti oppure crea un'azione; prova le frecce
   e il completamento. Nel progetto ritrovi lo stesso stato e la stessa checklist.
3. Apri **Imposta disponibilità**, indica fasce e pause e salva. Per testare
   senza dipendere dall'ora attuale, seleziona il giorno successivo.
4. Apri **Orario, durata e riprogrammazione** per impostare durate e vincoli.
5. Premi **Proponi orari**: niente è salvato fino a **Conferma il piano**.
6. Apri il calendario e clicca una priorità per tornare al suo piano. Prova
   **Verifica orario**, **Rimuovi solo il blocco** e **Riprogramma**.
7. Aggiungi un evento interno sovrapposto e prova **Riorganizza il resto della
   giornata**, controllando l'anteprima prima di confermare.
8. Per l'offline usa la build con anteprima, carica l'app almeno una volta,
   disconnetti la rete, modifica il piano e ricarica.

Comandi: `npm test`, `npm run build`; con anteprima locale sulla porta 4176,
`npm run test:visual` e `npm run test:offline`. Per un'altra porta imposta
`TARGET_URL`. `OUT_DIR` indica dove salvare gli screenshot; `KAIZEN_TEST_TMPDIR`
può indicare una cartella temporanea nella directory di lavoro. Non usare un URL
di produzione per queste prove. Risultati locali: `outputs/phase3/`, ignorati da Git.

## File della Fase 3

Nuovi:

- `src/lib/dayPlans.js` — riferimenti, comandi, revisioni ed esiti.
- `src/lib/timeBlocking.js` — intervalli, fusi, proposte e proiezione calendario.
- `src/components/TodayPlan.jsx` — interfaccia Oggi e gestione piani.
- `tests/dayPlans.test.js` — 23 test di dominio, sincronizzazione e quota.
- `scripts/day-plan-check.mjs` — prove funzionali browser.
- `PHASE3.md` — questo report.

Aggiornati:

- `src/App.jsx` — collegamenti ai record originali, comandi, riprogrammazione, esiti.
- `src/components/Home.jsx` — gerarchia Focus e lista delle altre attività.
- `src/components/TodayHabits.jsx` — titolo coerente con la nuova gerarchia.
- `src/components/HomeCalendarPage.jsx`, `src/components/CalendarPanel.jsx` — blocchi prioritari nel calendario e apertura del piano.
- `src/components/SyncStatus.jsx` — avviso visibile per mancato salvataggio locale.
- `src/hooks/useKaizenSync.js`, `src/utils/storage.js` — scritture controllate, rollback su quota e riduzione delle scritture.
- `src/lib/kaizenData.js` — registrazione della collezione `dayPlans`.
- `src/lib/attention.js` — priorità di progetto contate una volta nei badge.
- `src/lib/syncCore.js` — esclusione delle revisioni giornaliere dalla deduplicazione.
- `src/lib/subActions.js` — nessuna nuova versione quando titolo/collegamento sono invariati.
- `src/styles.css` — stile coerente e layout mobile della sezione.
- `scripts/visual-check.mjs`, `scripts/offline-check.mjs` — integrazione verifiche e profili temporanei configurabili.

Fase 4 non iniziata. Le modifiche della Fase 3 attendono revisione e approvazione.
