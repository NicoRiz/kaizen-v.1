import { useRef, useState } from "react";

const STATUS_LABELS = {
  checking: "Sincronizzazione...",
  syncing: "Sincronizzazione...",
  synced: "Sincronizzato",
  offline: "Offline",
  error: "Errore sync",
  localOnly: "Solo locale",
  unauthenticated: "Login richiesto",
};

export default function SyncStatus({ sync }) {
  const [isOpen, setIsOpen] = useState(false);
  const [importMessage, setImportMessage] = useState("");
  const [isImportingLocal, setIsImportingLocal] = useState(false);
  const [isAnalyzingDuplicates, setIsAnalyzingDuplicates] = useState(false);
  const [isReplacingLocal, setIsReplacingLocal] = useState(false);
  const [showLegacyRecovery, setShowLegacyRecovery] = useState(false);
  const fileInputRef = useRef(null);
  const label = STATUS_LABELS[sync.status] || "Sync";
  const localRecordCount =
    sync.diagnostics?.localCount ?? sync.diagnostics?.legacyCount ?? 0;
  const remoteRecordCount = sync.diagnostics?.remoteCount ?? "n/d";
  const deviceMigration = sync.diagnostics?.deviceMigration;
  const preImportSnapshot = sync.diagnostics?.preImportSnapshot;
  const deviceMigrationLabel = deviceMigration?.deviceMigrationCompletedAt
    ? "Completata"
    : deviceMigration?.deviceMigrationStartedAt
      ? "In corso"
      : "In attesa";
  const canImportLocal =
    sync.isAuthenticated &&
    showLegacyRecovery &&
    !sync.ignoreLocalForCloudImport &&
    localRecordCount > 0 &&
    typeof sync.importLocalDataIntoAccount === "function";

  async function handleImport(event) {
    const file = event.target.files?.[0];

    if (!file) {
      return;
    }

    try {
      const result = await sync.importBackup(file);
      setImportMessage(
        `Import completato: ${result.importedCount} record letti, ${result.conflictCount} conflitti conservati.`,
      );
    } catch (error) {
      console.error("Kaizen backup import error", error);
      setImportMessage("Backup non importato: file non valido.");
    } finally {
      event.target.value = "";
    }
  }

  async function handleLocalImport() {
    setIsImportingLocal(true);
    setImportMessage("");

    try {
      const result = await sync.importLocalDataIntoAccount();
      setImportMessage(
        `Import locale: importati ${result.importedCount}, gia' presenti ${result.alreadyPresentCount}, conflitti conservati ${result.conflictCount}, totale account ${result.totalCount}. Queue: ${result.queuedCount}.`,
      );
    } catch (error) {
      console.error("Kaizen local import error", error);
      setImportMessage("Import locale non completato. I dati locali e gli snapshot restano salvati.");
    } finally {
      setIsImportingLocal(false);
    }
  }

  async function handleDuplicateAnalysis() {
    setIsAnalyzingDuplicates(true);
    setImportMessage("");

    try {
      const result = await sync.analyzeAccountDuplicates();
      setImportMessage(
        `Analisi duplicati: record totali ${result.totalCount}, unici stimati ${result.uniqueCount}, duplicati rilevati ${result.duplicateCount}.`,
      );
    } catch (error) {
      console.error("Kaizen duplicate analysis error", error);
      setImportMessage("Analisi duplicati non riuscita. Nessun dato e' stato modificato.");
    } finally {
      setIsAnalyzingDuplicates(false);
    }
  }

  async function handleReplaceLocalWithAccount() {
    setIsReplacingLocal(true);
    setImportMessage("");

    try {
      const result = await sync.replaceLocalDataWithAccount();
      setImportMessage(
        `Dati ricaricati dall'account: ${result.remoteCount} record. Snapshot creato: ${result.snapshotKey ? "si" : "no"}.`,
      );
    } catch (error) {
      console.error("Kaizen replace local error", error);
      setImportMessage("Sostituzione locale non riuscita. Nessun dato remoto e' stato cancellato.");
    } finally {
      setIsReplacingLocal(false);
    }
  }

  function handleExportPreImportSnapshot() {
    const result = sync.exportLatestPreImportSnapshot?.();

    if (result?.exported) {
      setImportMessage("Snapshot pre-import esportato. Nessun dato remoto e' stato modificato.");
      return;
    }

    setImportMessage("Nessuno snapshot pre-import disponibile su questo dispositivo.");
  }

  return (
    <>
      <button
        className={`sync-status sync-status--${sync.status}`}
        onClick={() => setIsOpen(true)}
        type="button"
      >
        <span aria-hidden="true" />
        {label}
      </button>

      {isOpen && (
        <div className="modal-backdrop" role="presentation">
          <section
            aria-labelledby="sync-modal-title"
            aria-modal="true"
            className="modal sync-modal"
            role="dialog"
          >
            <div className="modal-heading">
              <div>
                <p className="eyebrow">Dati</p>
                <h2 id="sync-modal-title">Account e backup</h2>
              </div>
              <button
                aria-label="Chiudi"
                className="ghost-button"
                onClick={() => setIsOpen(false)}
                type="button"
              >
                x
              </button>
            </div>

            <div className="sync-detail-list">
              <p>
                <strong>Stato</strong>
                <span>{label}</span>
              </p>
              <p>
                <strong>Account</strong>
                <span>{sync.user?.email || "Non connesso"}</span>
              </p>
              <p>
                <strong>Ultimo sync</strong>
                <span>{sync.lastSuccessfulSyncAt || "Non ancora completato"}</span>
              </p>
              <p>
                <strong>Migrazione</strong>
                <span>
                  {deviceMigration?.deviceMigrationCompletedAt
                    ? `Device completato ${deviceMigration.deviceMigrationCompletedAt}`
                    : "Device in attesa"}
                </span>
              </p>
            </div>

            <div className="sync-diagnostics">
              <p className="eyebrow">Diagnostica</p>
              <dl>
                <div>
                  <dt>Device ID</dt>
                  <dd>{sync.diagnostics?.deviceId || "n/d"}</dd>
                </div>
                <div>
                  <dt>Record locali</dt>
                  <dd>{localRecordCount}</dd>
                </div>
                <div>
                  <dt>Record remoti</dt>
                  <dd>{remoteRecordCount}</dd>
                </div>
                <div>
                  <dt>Queue</dt>
                  <dd>{sync.diagnostics?.queueCount ?? sync.pendingCount ?? 0}</dd>
                </div>
                <div>
                  <dt>Ultimo snapshot</dt>
                  <dd>{sync.diagnostics?.snapshotKey ? "presente" : "assente"}</dd>
                </div>
                <div>
                  <dt>Snapshot pre-import</dt>
                  <dd>{preImportSnapshot ? preImportSnapshot.createdAt : "assente"}</dd>
                </div>
                <div>
                  <dt>Migrazione dispositivo</dt>
                  <dd>{deviceMigrationLabel}</dd>
                </div>
                <div>
                  <dt>Ultimo sync</dt>
                  <dd>{sync.lastSuccessfulSyncAt || "n/d"}</dd>
                </div>
                <div>
                  <dt>Fonte UI corrente</dt>
                  <dd>{sync.diagnostics?.source || "n/d"}</dd>
                </div>
              </dl>
            </div>

            {sync.message && <p className="form-error">{sync.message}</p>}
            {importMessage && <p className="empty-state">{importMessage}</p>}

            <div className="sync-import-box">
              <p>
                <strong>Ricarica dati dall'account</strong>
                <span>
                  Scarica Supabase e ricostruisce la cache locale senza caricare dati locali.
                </span>
              </p>
              <button
                className="secondary-button"
                disabled={isReplacingLocal || !sync.isAuthenticated}
                onClick={handleReplaceLocalWithAccount}
                type="button"
              >
                {isReplacingLocal
                  ? "Ricarica..."
                  : "Ricarica dati dall'account"}
              </button>
            </div>

            <div className="sync-import-box">
              <p>
                <strong>Diagnostica avanzata</strong>
                <span>Recovery legacy protetta: non usarla nel normale utilizzo.</span>
              </p>
              <button
                className="secondary-button"
                onClick={() => setShowLegacyRecovery((isShown) => !isShown)}
                type="button"
              >
                {showLegacyRecovery ? "Nascondi recovery legacy" : "Recovery legacy"}
              </button>
              <button
                className="secondary-button"
                disabled={!preImportSnapshot}
                onClick={handleExportPreImportSnapshot}
                type="button"
              >
                Esporta snapshot pre-import
              </button>
            </div>

            {preImportSnapshot && (
              <div className="sync-import-box">
                <p>
                  <strong>Snapshot pre-import piu' recente</strong>
                  <span>{preImportSnapshot.createdAt}</span>
                </p>
                <small>
                  Device {preImportSnapshot.deviceId || "n/d"} · {preImportSnapshot.recordCount} record · {preImportSnapshot.sizeBytes} byte · {preImportSnapshot.fingerprint}
                </small>
              </div>
            )}

            {showLegacyRecovery && (
              <div className="sync-import-box danger-zone">
                <p>
                  <strong>Importa dati locali in questo account</strong>
                  <span>
                    Funzione legacy di recovery. Puo' creare duplicati se i dati sono gia' in Supabase.
                  </span>
                </p>
                <button
                  className="secondary-button"
                  onClick={() =>
                    sync.setLocalCloudImportDisabled(!sync.ignoreLocalForCloudImport)
                  }
                  type="button"
                >
                  {sync.ignoreLocalForCloudImport
                    ? "Sblocca import legacy"
                    : "Blocca import legacy"}
                </button>
                {canImportLocal && (
                  <button
                    className="submit-button"
                    disabled={isImportingLocal}
                    onClick={handleLocalImport}
                    type="button"
                  >
                    {isImportingLocal
                      ? "Importazione..."
                      : "Importa dati locali in questo account"}
                  </button>
                )}
              </div>
            )}

            <div className="sync-import-box">
              <p>
                <strong>Deduplica sicura</strong>
                <span>
                  {sync.diagnostics?.duplicateAnalysis
                    ? `Totali ${sync.diagnostics.duplicateAnalysis.totalCount}, unici ${sync.diagnostics.duplicateAnalysis.uniqueCount}, duplicati ${sync.diagnostics.duplicateAnalysis.duplicateCount}`
                    : "Analisi solo lettura, nessuna cancellazione automatica"}
                </span>
              </p>
              <button
                className="secondary-button"
                disabled={isAnalyzingDuplicates}
                onClick={handleDuplicateAnalysis}
                type="button"
              >
                {isAnalyzingDuplicates ? "Analisi..." : "Analizza duplicati"}
              </button>
              <button className="secondary-button danger-button" disabled type="button">
                Rimuovi duplicati
              </button>
            </div>

            {sync.diagnostics?.snapshotSummaries?.length > 0 && (
              <div className="sync-snapshot-list">
                <p className="eyebrow">Snapshot disponibili</p>
                <ul>
                  {sync.diagnostics.snapshotSummaries.slice(0, 8).map((snapshot) => (
                    <li key={snapshot.key}>
                      <strong>{snapshot.recordCount} record</strong>
                      <span>{snapshot.createdAt}</span>
                      <small>
                        {snapshot.reason || "snapshot"} · {snapshot.deviceId || "device n/d"} · {snapshot.sizeBytes} byte
                      </small>
                    </li>
                  ))}
                </ul>
              </div>
            )}

            <div className="modal-actions">
              <button
                className="secondary-button"
                onClick={sync.exportBackup}
                type="button"
              >
                Esporta backup Kaizen
              </button>
              <button
                className="secondary-button"
                onClick={() => fileInputRef.current?.click()}
                type="button"
              >
                Importa backup
              </button>
              <button
                className="secondary-button danger-button"
                onClick={sync.signOut}
                type="button"
              >
                Logout
              </button>
            </div>

            <input
              accept="application/json"
              className="visually-hidden"
              onChange={handleImport}
              ref={fileInputRef}
              type="file"
            />
          </section>
        </div>
      )}
    </>
  );
}
