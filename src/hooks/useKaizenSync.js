import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLLECTIONS, MIGRATION_VERSION } from "../lib/kaizenData.js";
import { supabase, supabaseConfig } from "../lib/supabaseClient.js";
import {
  applyChangedRecords,
  analyzeDuplicateRecords,
  clearLocalKaizenDataForAccount,
  countDataItems,
  countRecords,
  createDeviceSnapshot,
  createLegacyBackup,
  countDataCollections,
  dataFromRecords,
  deserializeRecordFromSupabase,
  diffCollectionRecords,
  fingerprintRecords,
  getBestLocalRecoveryData,
  getOrCreateDeviceId,
  mergeBootstrapRecords,
  mergeRecords,
  mergeQueuedRecords,
  normalizeLegacyData,
  normalizeSyncQueue,
  planSupabaseFirstBootstrap,
  readLegacyData,
  readDeviceSnapshots,
  readLatestLegacyBackup,
  readLatestDeviceSnapshot,
  readLatestPreImportDeviceSnapshot,
  readSyncCache,
  readSyncMeta,
  readSyncQueue,
  recordsFromData,
  serializeRecordForSupabase,
  summarizeDeviceSnapshots,
  writeLegacyData,
  writeSyncCache,
  writeSyncMeta,
  writeSyncQueue,
} from "../lib/syncCore.js";

const STATUS = {
  checking: "checking",
  unauthenticated: "unauthenticated",
  synced: "synced",
  syncing: "syncing",
  offline: "offline",
  error: "error",
  localOnly: "localOnly",
};

function summarizePreImportSnapshot(snapshot) {
  if (!snapshot) {
    return null;
  }

  return {
    collectionCounts: snapshot.collectionCounts || countDataCollections(snapshot.data),
    createdAt: snapshot.createdAt,
    deviceId: snapshot.deviceId,
    fingerprint:
      snapshot.fingerprint ||
      fingerprintRecords(recordsFromData(normalizeLegacyData(snapshot.data).data)),
    key: snapshot.key,
    recordCount: snapshot.recordCount,
    sizeBytes: snapshot.sizeBytes,
  };
}

export function useKaizenSync({ data, onReplaceData }) {
  const [session, setSession] = useState(null);
  const [authReady, setAuthReady] = useState(false);
  const [status, setStatus] = useState(
    supabaseConfig.isConfigured ? STATUS.checking : STATUS.localOnly,
  );
  const [message, setMessage] = useState("");
  const [isOnline, setIsOnline] = useState(() => navigator.onLine);
  const [lastSuccessfulSyncAt, setLastSuccessfulSyncAt] = useState(
    () => readSyncMeta().lastSuccessfulSyncAt || "",
  );
  const [migrationInfo, setMigrationInfo] = useState(() => readSyncMeta());
  const [deviceContext] = useState(() => {
    const currentDeviceId = getOrCreateDeviceId();
    return {
      deviceId: currentDeviceId,
      initialSnapshotKey: "",
    };
  });
  const deviceId = deviceContext.deviceId;
  const [ignoreLocalForCloudImport, setIgnoreLocalForCloudImport] = useState(
    () => readSyncMeta().deviceSettings?.[deviceId]?.ignoreLocalForCloudImport !== false,
  );
  const [diagnostics, setDiagnostics] = useState(() => {
    const recovery = getBestLocalRecoveryData();
    const meta = readSyncMeta();
    const snapshotSummaries = summarizeDeviceSnapshots();
    const preImportSnapshot = summarizePreImportSnapshot(
      readLatestPreImportDeviceSnapshot(),
    );

    return {
      backupCount: recovery.backupCount,
      backupKey: recovery.backupKey,
      cacheCount: recovery.syncCacheCount,
      deviceId,
      deviceSettings: meta.deviceSettings?.[deviceId] || {},
      deviceMigration: meta.deviceMigrations?.[deviceId] || null,
      legacyCount: recovery.legacyCount,
      localCount: countDataItems(recovery.data),
      queueCount: normalizeSyncQueue(readSyncQueue()).length,
      preImportSnapshot,
      remoteCount: null,
      snapshotSummaries,
      snapshotCount: recovery.snapshotCount,
      snapshotKey: recovery.snapshotKey || deviceContext.initialSnapshotKey,
      source: recovery.source,
    };
  });
  const [authError, setAuthError] = useState("");
  const recordsRef = useRef(readSyncCache().records || []);
  const queueRef = useRef(normalizeSyncQueue(readSyncQueue()));
  const hasBootstrappedRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const flushPromiseRef = useRef(null);

  const user = session?.user || null;
  const canUseCloud = Boolean(supabase && user);

  async function fetchRemoteRecords() {
    const { data: remoteRows, error } = await supabase
      .from("kaizen_records")
      .select("collection,id,data,created_at,updated_at,deleted_at,version")
      .eq("user_id", user.id);

    if (error) {
      throw error;
    }

    return (remoteRows || []).map(deserializeRecordFromSupabase);
  }

  function writeDeviceMigrationMeta(patch) {
    const { accountPatch, ...devicePatch } = patch;
    const currentMeta = readSyncMeta();
    const currentDeviceMigration = currentMeta.deviceMigrations?.[deviceId] || {};
    const nextDeviceMigration = {
      ...currentDeviceMigration,
      deviceId,
      migrationVersion: MIGRATION_VERSION,
      ...devicePatch,
    };
    const nextMeta = {
      deviceId,
      deviceMigrationId: nextDeviceMigration.deviceMigrationId,
      deviceMigrationCompletedAt: nextDeviceMigration.deviceMigrationCompletedAt || "",
      deviceMigrations: {
        ...(currentMeta.deviceMigrations || {}),
        [deviceId]: nextDeviceMigration,
      },
      ...accountPatch,
    };

    writeSyncMeta(nextMeta);
    setMigrationInfo((current) => ({
      ...current,
      ...nextMeta,
    }));
    setDiagnostics((current) => ({
      ...current,
      deviceId,
      deviceMigration: nextDeviceMigration,
    }));
    return nextDeviceMigration;
  }

  function writeDeviceSettings(patch) {
    const currentMeta = readSyncMeta();
    const nextDeviceSettings = {
      ...(currentMeta.deviceSettings?.[deviceId] || {}),
      ...patch,
    };
    const nextMeta = {
      deviceSettings: {
        ...(currentMeta.deviceSettings || {}),
        [deviceId]: nextDeviceSettings,
      },
    };

    writeSyncMeta(nextMeta);
    setMigrationInfo((current) => ({
      ...current,
      ...nextMeta,
    }));
    setDiagnostics((current) => ({
      ...current,
      deviceSettings: nextDeviceSettings,
    }));
    setIgnoreLocalForCloudImport(Boolean(nextDeviceSettings.ignoreLocalForCloudImport));
    return nextDeviceSettings;
  }

  function markDeviceMigrationCompleted(patch = {}) {
    const completedAt = patch.completedAt || new Date().toISOString();
    return writeDeviceMigrationMeta({
      ...patch,
      deviceMigrationCompletedAt: completedAt,
      lastSuccessfulSyncAt: patch.lastSuccessfulSyncAt || completedAt,
      accountPatch: {
        lastSuccessfulSyncAt: patch.lastSuccessfulSyncAt || completedAt,
        migrationVersion: MIGRATION_VERSION,
        migrationCompletedAt: readSyncMeta().migrationCompletedAt || completedAt,
      },
    });
  }

  useEffect(() => {
    function handleOnline() {
      setIsOnline(true);
    }

    function handleOffline() {
      setIsOnline(false);
      setStatus(STATUS.offline);
    }

    window.addEventListener("online", handleOnline);
    window.addEventListener("offline", handleOffline);

    return () => {
      window.removeEventListener("online", handleOnline);
      window.removeEventListener("offline", handleOffline);
    };
  }, []);

  useEffect(() => {
    if (!supabase) {
      setAuthReady(true);
      setStatus(STATUS.localOnly);
      setMessage("Configura Supabase per attivare la sincronizzazione.");
      return undefined;
    }

    let isMounted = true;

    supabase.auth.getSession().then(({ data: sessionData, error }) => {
      if (!isMounted) {
        return;
      }

      if (error) {
        console.error("Supabase session error", error);
        setStatus(STATUS.error);
        setMessage("Sessione non recuperata. Effettua di nuovo il login.");
      }

      setSession(sessionData.session);
      setAuthReady(true);
      setStatus(sessionData.session ? STATUS.syncing : STATUS.unauthenticated);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((_event, nextSession) => {
      setSession(nextSession);
      setAuthReady(true);
      setStatus(nextSession ? STATUS.syncing : STATUS.unauthenticated);
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, []);

  const flushQueue = useCallback(async () => {
    if (!canUseCloud || !navigator.onLine) {
      setStatus(STATUS.offline);
      return false;
    }

    if (flushPromiseRef.current) {
      return flushPromiseRef.current;
    }

    flushPromiseRef.current = (async () => {
      const queue = normalizeSyncQueue(queueRef.current);
      queueRef.current = queue;

      if (queue.length === 0) {
        setStatus(STATUS.synced);
        setDiagnostics((current) => ({
          ...current,
          queueCount: 0,
        }));
        return true;
      }

      setStatus(STATUS.syncing);

      try {
        const rows = queue.map((item) =>
          serializeRecordForSupabase(item.record, user.id),
        );

        if (rows.length > 0) {
          const { error } = await supabase
            .from("kaizen_records")
            .upsert(rows, { onConflict: "user_id,collection,id" });

          if (error) {
            throw error;
          }
        }

        queueRef.current = [];
        writeSyncQueue([]);
        setDiagnostics((current) => ({
          ...current,
          cacheCount: countRecords(recordsRef.current),
          queueCount: 0,
          remoteCount: countRecords(recordsRef.current),
        }));
        const timestamp = new Date().toISOString();
        setLastSuccessfulSyncAt(timestamp);
        markDeviceMigrationCompleted({
          completedAt: timestamp,
          lastSuccessfulSyncAt: timestamp,
        });
        await supabase.from("kaizen_sync_state").upsert({
          user_id: user.id,
          migration_version: MIGRATION_VERSION,
          migration_completed_at: readSyncMeta().migrationCompletedAt || timestamp,
          last_successful_sync_at: timestamp,
        });
        setStatus(STATUS.synced);
        setMessage("");
        return true;
      } catch (error) {
        console.error("Kaizen sync queue error", error);
        setStatus(navigator.onLine ? STATUS.error : STATUS.offline);
        setMessage("Modifica in attesa di sincronizzazione. Riprovero' appena possibile.");
        return false;
      } finally {
        flushPromiseRef.current = null;
      }
    })();

    return flushPromiseRef.current;
  }, [canUseCloud, user?.id]);

  const enqueueRecords = useCallback(
    (records) => {
      if (records.length === 0) {
        return Promise.resolve(true);
      }

      queueRef.current = mergeQueuedRecords(queueRef.current, records);
      writeSyncQueue(queueRef.current);
      setStatus(navigator.onLine ? STATUS.syncing : STATUS.offline);
      setMessage(
        navigator.onLine
          ? "Sincronizzazione modifica..."
          : "Modifica in attesa di sincronizzazione.",
      );
      setDiagnostics((current) => ({
        ...current,
        queueCount: queueRef.current.length,
      }));
      return flushQueue();
    },
    [flushQueue],
  );

  const replaceFromRecords = useCallback(
    (records) => {
      applyingRemoteRef.current = true;
      recordsRef.current = records;
      writeSyncCache(records);
      const nextData = dataFromRecords(records);
      writeLegacyData(nextData);
      onReplaceData(nextData);
      window.setTimeout(() => {
        applyingRemoteRef.current = false;
      }, 0);
    },
    [onReplaceData],
  );

  useEffect(() => {
    if (!canUseCloud || !authReady || hasBootstrappedRef.current) {
      return;
    }

    let cancelled = false;

    async function bootstrap() {
      setStatus(navigator.onLine ? STATUS.syncing : STATUS.offline);

      const timestamp = new Date().toISOString();
      const snapshotKey = "";
      const rawLocal = readLegacyData();
      const recovery = getBestLocalRecoveryData({
        includeRecoverySources: false,
        rawLegacy: rawLocal,
      });
      const localCount = countDataItems(recovery.data);
      const sourceFingerprint = fingerprintRecords(recovery.records);
      const previousDeviceMigration = readSyncMeta().deviceMigrations?.[deviceId] || {};
      const backupKey = previousDeviceMigration.legacyBackupKey || "";
      const deviceMigrationId = `${deviceId}:${timestamp}`;
      const cacheRecords = readSyncCache().records || [];
      const cacheCount = countRecords(cacheRecords);

      if (cacheCount > 0) {
        replaceFromRecords(cacheRecords);
      }

      setDiagnostics((current) => ({
        ...current,
        backupCount: recovery.backupCount,
        backupKey: recovery.backupKey || backupKey,
        cacheCount,
        deviceId,
        deviceMigration: {
          deviceId,
          deviceMigrationId,
          deviceMigrationStartedAt: timestamp,
          migrationVersion: MIGRATION_VERSION,
        },
        legacyCount: recovery.legacyCount,
        localCount,
        preImportSnapshot: summarizePreImportSnapshot(readLatestPreImportDeviceSnapshot()),
        queueCount: queueRef.current.length,
        snapshotSummaries: summarizeDeviceSnapshots(),
        snapshotCount: recovery.snapshotCount,
        snapshotKey,
        source: cacheCount > 0 ? "cache" : "empty-cache",
      }));
      writeDeviceMigrationMeta({
        deviceMigrationId,
        deviceMigrationStartedAt: timestamp,
        deviceSnapshotKey: snapshotKey,
        legacyBackupKey: backupKey,
        localImportIgnored: true,
        localRecordCount: localCount,
        recoverySource: cacheCount > 0 ? "cache" : "empty-cache",
        requiresExplicitImport: false,
        sourceAlreadyImported: Boolean(previousDeviceMigration.deviceMigrationCompletedAt),
        sourceFingerprint,
      });

      try {
        const remoteRecords = await fetchRemoteRecords();
        const plan = planSupabaseFirstBootstrap({
          cacheRecords,
          remoteRecords,
        });
        const remoteCount = plan.remoteCount;

        if (cancelled) {
          return;
        }

        replaceFromRecords(plan.authoritativeRecords);
        hasBootstrappedRef.current = true;

        const nextMeta = {
          migrationVersion: MIGRATION_VERSION,
          migrationStartedAt: new Date().toISOString(),
          lastSuccessfulSyncAt,
          legacyBackupKey: backupKey,
          deviceId,
          deviceMigrationId,
          deviceSnapshotKey: snapshotKey,
          conflictCount: 0,
          localImportIgnored: true,
          localRecordCount: localCount,
          remoteRecordCount: remoteCount,
          recoveredRecordCount: remoteCount,
          recoverySource: plan.source,
          requiresExplicitImport: false,
          sourceAlreadyImported: Boolean(previousDeviceMigration.deviceMigrationCompletedAt),
          sourceFingerprint,
          warnings: recovery.warnings,
        };
        setMigrationInfo((current) => ({ ...current, ...nextMeta }));
        writeSyncMeta(nextMeta);
        setDiagnostics((current) => ({
          ...current,
          cacheCount: remoteCount,
          localCount,
          preImportSnapshot: summarizePreImportSnapshot(readLatestPreImportDeviceSnapshot()),
          queueCount: queueRef.current.length,
          remoteCount,
          snapshotSummaries: summarizeDeviceSnapshots(),
          snapshotKey,
          source: plan.source,
        }));
        writeDeviceMigrationMeta({
          conflictCount: 0,
          deviceMigrationId,
          deviceMigrationStartedAt: timestamp,
          deviceSnapshotKey: snapshotKey,
          importedRecordCount: 0,
          legacyBackupKey: backupKey,
          localImportIgnored: true,
          localRecordCount: localCount,
          remoteRecordCount: remoteCount,
          recoveredRecordCount: remoteCount,
          recoverySource: plan.source,
          requiresExplicitImport: false,
          sourceAlreadyImported: Boolean(previousDeviceMigration.deviceMigrationCompletedAt),
          sourceFingerprint,
          warnings: recovery.warnings,
        });

        const completedAt = new Date().toISOString();
        markDeviceMigrationCompleted({
          completedAt,
          conflictCount: 0,
          deviceMigrationId,
          importedRecordCount: 0,
          localImportIgnored: true,
          localRecordCount: localCount,
          remoteRecordCount: remoteCount,
          recoveredRecordCount: remoteCount,
          sourceFingerprint,
        });
        setStatus(STATUS.synced);
        setMessage("");
      } catch (error) {
        console.error("Kaizen initial sync error", error);
        hasBootstrappedRef.current = true;
        recordsRef.current = cacheRecords;
        writeSyncCache(cacheRecords);
        setDiagnostics((current) => ({
          ...current,
          cacheCount,
          localCount,
          queueCount: queueRef.current.length,
          snapshotKey,
          source: cacheCount > 0 ? "cache-offline" : "empty-cache",
        }));
        writeDeviceMigrationMeta({
          deviceMigrationId,
          deviceMigrationStartedAt: timestamp,
          deviceSnapshotKey: snapshotKey,
          error: error.message || "Sync iniziale non riuscita",
          legacyBackupKey: backupKey,
          localImportIgnored: true,
          localRecordCount: localCount,
          recoverySource: cacheCount > 0 ? "cache-offline" : "empty-cache",
          requiresExplicitImport: false,
          sourceAlreadyImported: Boolean(previousDeviceMigration.deviceMigrationCompletedAt),
          sourceFingerprint,
        });
        setStatus(navigator.onLine ? STATUS.error : STATUS.offline);
        setMessage("Uso la cache locale. Supabase resta la fonte autorevole e verra' ricaricato appena possibile.");
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    canUseCloud,
    deviceId,
    lastSuccessfulSyncAt,
    replaceFromRecords,
    user?.id,
  ]);

  useEffect(() => {
    if (!canUseCloud || !hasBootstrappedRef.current || !isOnline) {
      return;
    }

    flushQueue();
  }, [canUseCloud, flushQueue, isOnline]);

  useEffect(() => {
    if (!canUseCloud || !hasBootstrappedRef.current) {
      return undefined;
    }

    const channel = supabase
      .channel(`kaizen-records-${user.id}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "kaizen_records",
          filter: `user_id=eq.${user.id}`,
        },
        (payload) => {
          const row = payload.new || payload.old;

          if (!row) {
            return;
          }

          const incoming = deserializeRecordFromSupabase(row);
          const nextRecords = applyChangedRecords(recordsRef.current, [incoming]);
          replaceFromRecords(nextRecords);
        },
      )
      .subscribe((subscriptionStatus) => {
        if (subscriptionStatus === "CHANNEL_ERROR") {
          console.warn("Kaizen realtime channel error");
        }
      });

    return () => {
      supabase.removeChannel(channel);
    };
  }, [canUseCloud, replaceFromRecords, user?.id]);

  const trackCollectionChange = useCallback(
    (collectionName, value) => {
      const collection = COLLECTIONS.find((item) => item.name === collectionName);

      if (!collection) {
        return;
      }

      writeLegacyData({ ...data, [collectionName]: value });

      if (!hasBootstrappedRef.current || applyingRemoteRef.current) {
        return;
      }

      const changes = diffCollectionRecords(
        recordsRef.current,
        value,
        collectionName,
      );

      if (changes.length === 0) {
        return;
      }

      recordsRef.current = applyChangedRecords(recordsRef.current, changes);
      writeSyncCache(recordsRef.current);
      enqueueRecords(changes);
    },
    [data, enqueueRecords],
  );

  async function signIn(email, password, mode) {
    if (!supabase) {
      setAuthError("Configurazione Supabase mancante.");
      return false;
    }

    setAuthError("");
    const credentials = { email, password };
    const { error } =
      mode === "signup"
        ? await supabase.auth.signUp(credentials)
        : await supabase.auth.signInWithPassword(credentials);

    if (error) {
      console.error("Supabase auth error", error);
      setAuthError(error.message || "Login non riuscito.");
      return false;
    }

    return true;
  }

  async function importLocalDataIntoAccount() {
    if (!canUseCloud) {
      setMessage("Effettua il login prima di importare i dati locali.");
      return {
        alreadyPresentCount: 0,
        conflictCount: 0,
        importedCount: 0,
        queuedCount: queueRef.current.length,
        totalCount: countRecords(recordsRef.current),
      };
    }

    if (ignoreLocalForCloudImport) {
      setMessage("Import locale disattivato per questo dispositivo.");
      return {
        alreadyPresentCount: 0,
        conflictCount: 0,
        importedCount: 0,
        queuedCount: queueRef.current.length,
        totalCount: countRecords(recordsRef.current),
      };
    }

    const timestamp = new Date().toISOString();
    const deviceMigrationId = `${deviceId}:manual:${timestamp}`;
    const snapshotKey = createDeviceSnapshot({
      deviceId,
      reason: "pre-import",
      timestamp,
    });
    const rawLocal = readLegacyData();
    const backupKey = createLegacyBackup(rawLocal, timestamp);
    const recovery = getBestLocalRecoveryData({
      includeRecoverySources: false,
      rawLegacy: rawLocal,
    });
    const localRecords = recovery.records;
    const localCount = countDataItems(recovery.data);
    const sourceFingerprint = fingerprintRecords(localRecords);

    if (localCount > 0) {
      writeLegacyData(recovery.data);
      onReplaceData(recovery.data);
      recordsRef.current = localRecords;
      writeSyncCache(localRecords);
    }

    writeDeviceMigrationMeta({
      deviceMigrationId,
      deviceMigrationStartedAt: timestamp,
      deviceSnapshotKey: snapshotKey,
      legacyBackupKey: backupKey,
      localRecordCount: localCount,
      manualImport: true,
      recoverySource: recovery.source,
      sourceFingerprint,
    });
    setStatus(navigator.onLine ? STATUS.syncing : STATUS.offline);

    let remoteRecords = [];
    let remoteFetchSucceeded = false;

    try {
      if (!navigator.onLine) {
        throw new Error("Offline");
      }

      remoteRecords = await fetchRemoteRecords();
      remoteFetchSucceeded = true;
    } catch (error) {
      console.warn("Kaizen manual import remote fetch skipped", error);
      setStatus(STATUS.offline);
      setMessage("Dati locali salvati. L'import andra' in coda finche' torna la connessione.");
    }

    const merged = mergeBootstrapRecords({
      localRecords,
      recoverySource: recovery.source,
      remoteRecords,
      warnings: recovery.warnings,
    });
    const mergedCount = merged.mergedCount;
    const remoteCount = remoteFetchSucceeded ? merged.remoteCount : null;
    const alreadyPresentCount = Math.max(0, localCount - merged.remoteUpserts.length);

    replaceFromRecords(merged.mergedRecords);
    setDiagnostics((current) => ({
      ...current,
      backupKey,
      cacheCount: mergedCount,
      deviceId,
      legacyCount: recovery.legacyCount,
      localCount,
      preImportSnapshot: summarizePreImportSnapshot(readLatestPreImportDeviceSnapshot()),
      queueCount: queueRef.current.length,
      remoteCount,
      snapshotSummaries: summarizeDeviceSnapshots(),
      snapshotCount: recovery.snapshotCount,
      snapshotKey,
      source: merged.source || recovery.source,
    }));
    writeDeviceMigrationMeta({
      conflictCount: merged.conflicts.length,
      deviceMigrationId,
      deviceMigrationStartedAt: timestamp,
      deviceSnapshotKey: snapshotKey,
      importedRecordCount: merged.remoteUpserts.length,
      legacyBackupKey: backupKey,
      localRecordCount: localCount,
      manualImport: true,
      remoteRecordCount: remoteCount,
      recoveredRecordCount: mergedCount,
      recoverySource: merged.source || recovery.source,
      sourceFingerprint,
      warnings: recovery.warnings,
    });

    let flushed = true;

    if (merged.remoteUpserts.length > 0) {
      flushed = await enqueueRecords(merged.remoteUpserts);
    } else if (remoteFetchSucceeded) {
      markDeviceMigrationCompleted({
        completedAt: new Date().toISOString(),
        conflictCount: merged.conflicts.length,
        deviceMigrationId,
        importedRecordCount: 0,
        localRecordCount: localCount,
        remoteRecordCount: remoteCount,
        recoveredRecordCount: mergedCount,
        sourceFingerprint,
      });
    }

    const queuedCount = queueRef.current.length;

    if (flushed) {
      setStatus(STATUS.synced);
      setMessage("");
    }

    return {
      alreadyPresentCount,
      conflictCount: merged.conflicts.length,
      importedCount: flushed ? merged.remoteUpserts.length : 0,
      queuedCount,
      snapshotKey,
      totalCount: mergedCount,
    };
  }

  function setLocalCloudImportDisabled(disabled) {
    return writeDeviceSettings({
      ignoreLocalForCloudImport: Boolean(disabled),
      ignoreLocalForCloudImportUpdatedAt: new Date().toISOString(),
    });
  }

  async function replaceLocalDataWithAccount() {
    if (!canUseCloud) {
      setMessage("Effettua il login prima di sostituire i dati locali.");
      return {
        remoteCount: 0,
        snapshotKey: "",
      };
    }

    const timestamp = new Date().toISOString();
    const snapshotKey = createDeviceSnapshot({
      deviceId,
      reason: "pre-replace-from-account",
      timestamp,
    });
    const remoteRecords = await fetchRemoteRecords();
    const remoteCount = countRecords(remoteRecords);

    clearLocalKaizenDataForAccount();
    replaceFromRecords(remoteRecords);
    writeDeviceSettings({
      ignoreLocalForCloudImport: true,
      replacedLocalFromAccountAt: timestamp,
      replacedLocalSnapshotKey: snapshotKey,
    });
    setDiagnostics((current) => ({
      ...current,
      cacheCount: remoteCount,
      localCount: remoteCount,
      remoteCount,
      snapshotKey,
      source: "remote",
    }));
    setMessage("Dati locali sostituiti con il dataset dell'account. Import locale disattivato su questo dispositivo.");

    return {
      remoteCount,
      snapshotKey,
    };
  }

  async function analyzeAccountDuplicates() {
    if (!canUseCloud) {
      const localAnalysis = analyzeDuplicateRecords(recordsRef.current);
      setDiagnostics((current) => ({
        ...current,
        duplicateAnalysis: localAnalysis,
      }));
      return localAnalysis;
    }

    const remoteRecords = await fetchRemoteRecords();
    const analysis = analyzeDuplicateRecords(remoteRecords);

    setDiagnostics((current) => ({
      ...current,
      duplicateAnalysis: analysis,
      remoteCount: countRecords(remoteRecords),
    }));

    return analysis;
  }

  async function signOut() {
    if (!supabase) {
      return;
    }

    const { error } = await supabase.auth.signOut();

    if (error) {
      console.error("Supabase logout error", error);
      setMessage("Logout non riuscito. Riprova.");
      return;
    }

    setSession(null);
    setStatus(STATUS.unauthenticated);
  }

  function exportBackup() {
    const recovery = getBestLocalRecoveryData();
    const recoveryWithBackups = getBestLocalRecoveryData({
      includeRecoverySources: true,
    });
    const latestBackup = readLatestLegacyBackup();
    const latestDeviceSnapshot = readLatestDeviceSnapshot();
    const deviceSnapshots = readDeviceSnapshots();
    const payload = {
      exportedAt: new Date().toISOString(),
      deviceId,
      migrationVersion: MIGRATION_VERSION,
      recovery: {
        backupCount: recovery.backupCount,
        backupKey: recovery.backupKey,
        cacheCount: recovery.syncCacheCount,
        legacyCount: recovery.legacyCount,
        snapshotCount: recovery.snapshotCount,
        snapshotKey: recovery.snapshotKey,
        source: recovery.source,
      },
      recoveryWithBackups: {
        backupCount: recoveryWithBackups.backupCount,
        backupKey: recoveryWithBackups.backupKey,
        cacheCount: recoveryWithBackups.syncCacheCount,
        legacyCount: recoveryWithBackups.legacyCount,
        snapshotCount: recoveryWithBackups.snapshotCount,
        snapshotKey: recoveryWithBackups.snapshotKey,
        source: recoveryWithBackups.source,
      },
      syncMeta: readSyncMeta(),
      syncCache: readSyncCache(),
      syncQueue: readSyncQueue(),
      latestLegacyBackup: latestBackup
        ? {
            createdAt: latestBackup.createdAt,
            key: latestBackup.key,
          }
        : null,
      latestDeviceSnapshot: latestDeviceSnapshot
        ? {
            createdAt: latestDeviceSnapshot.createdAt,
            deviceId: latestDeviceSnapshot.deviceId,
            key: latestDeviceSnapshot.key,
          }
        : null,
      deviceSnapshots,
      data: recovery.data,
      normalizedRecords: recovery.records,
      recoveryRecords: recoveryWithBackups.records,
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kaizen-backup-${payload.exportedAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
  }

  function exportLatestPreImportSnapshot() {
    const snapshot = readLatestPreImportDeviceSnapshot();

    if (!snapshot) {
      setMessage("Nessuno snapshot pre-import disponibile su questo dispositivo.");
      return {
        exported: false,
      };
    }

    const payload = {
      collectionCounts: snapshot.collectionCounts || countDataCollections(snapshot.data),
      createdAt: snapshot.createdAt,
      data: snapshot.data,
      deviceId: snapshot.deviceId,
      exportedAt: new Date().toISOString(),
      fingerprint:
        snapshot.fingerprint ||
        fingerprintRecords(recordsFromData(normalizeLegacyData(snapshot.data).data)),
      key: snapshot.key,
      migrationVersion: MIGRATION_VERSION,
      reason: snapshot.reason,
      recordCount: snapshot.recordCount,
      sizeBytes: snapshot.sizeBytes,
      type: "kaizen-pre-import-device-snapshot",
    };
    const blob = new Blob([JSON.stringify(payload, null, 2)], {
      type: "application/json",
    });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `kaizen-pre-import-snapshot-${payload.createdAt.slice(0, 10)}.json`;
    link.click();
    URL.revokeObjectURL(url);
    setMessage("Snapshot pre-import esportato. Nessun dato remoto e' stato modificato.");

    return {
      exported: true,
      snapshotKey: snapshot.key,
    };
  }

  async function importBackup(file) {
    const text = await file.text();
    const parsed = JSON.parse(text);
    const backupData = parsed.data || parsed;
    const normalized = normalizeLegacyData(backupData);
    const backupRecords = recordsFromData(normalized.data);
    const merged = mergeRecords(recordsRef.current, backupRecords);
    replaceFromRecords(merged.mergedRecords);
    enqueueRecords(merged.remoteUpserts);
    return {
      conflictCount: merged.conflicts.length,
      importedCount: backupRecords.length,
      warnings: normalized.warnings,
    };
  }

  const sync = useMemo(
    () => ({
      authError,
      authReady,
      analyzeAccountDuplicates,
      canUseCloud,
      config: supabaseConfig,
      exportBackup,
      exportLatestPreImportSnapshot,
      ignoreLocalForCloudImport,
      importBackup,
      importLocalDataIntoAccount,
      isAuthenticated: Boolean(user),
      isOnline,
      lastSuccessfulSyncAt,
      message,
      migrationInfo,
      diagnostics,
      pendingCount: queueRef.current.length,
      replaceLocalDataWithAccount,
      setLocalCloudImportDisabled,
      signIn,
      signOut,
      status,
      trackCollectionChange,
      user,
    }),
    [
      authError,
      authReady,
      canUseCloud,
      deviceId,
      ignoreLocalForCloudImport,
      isOnline,
      lastSuccessfulSyncAt,
      message,
      migrationInfo,
      diagnostics,
      status,
      trackCollectionChange,
      user,
    ],
  );

  return sync;
}
