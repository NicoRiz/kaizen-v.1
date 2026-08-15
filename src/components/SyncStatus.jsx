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
  const fileInputRef = useRef(null);
  const label = STATUS_LABELS[sync.status] || "Sync";

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
                  {sync.migrationInfo?.migrationCompletedAt
                    ? `v${sync.migrationInfo.migrationVersion} completata`
                    : "In attesa"}
                </span>
              </p>
            </div>

            {sync.message && <p className="form-error">{sync.message}</p>}
            {importMessage && <p className="empty-state">{importMessage}</p>}

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
