import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { COLLECTIONS, MIGRATION_VERSION } from "../lib/kaizenData.js";
import { supabase, supabaseConfig } from "../lib/supabaseClient.js";
import {
  applyChangedRecords,
  createLegacyBackup,
  dataFromRecords,
  deserializeRecordFromSupabase,
  diffCollectionRecords,
  mergeRecords,
  normalizeLegacyData,
  queueFromRecords,
  readLegacyData,
  readSyncCache,
  readSyncMeta,
  readSyncQueue,
  recordsFromData,
  serializeRecordForSupabase,
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
  const [authError, setAuthError] = useState("");
  const recordsRef = useRef(readSyncCache().records || []);
  const queueRef = useRef(readSyncQueue());
  const hasBootstrappedRef = useRef(false);
  const applyingRemoteRef = useRef(false);
  const flushPromiseRef = useRef(null);

  const user = session?.user || null;
  const canUseCloud = Boolean(supabase && user);

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
      const queue = queueRef.current;

      if (queue.length === 0) {
        setStatus(STATUS.synced);
        return true;
      }

      setStatus(STATUS.syncing);

      try {
        const { data: remoteRows, error: fetchError } = await supabase
          .from("kaizen_records")
          .select("collection,id,data,created_at,updated_at,deleted_at,version")
          .eq("user_id", user.id);

        if (fetchError) {
          throw fetchError;
        }

        const pendingRecords = queue.map((item) => item.record);
        const remoteRecords = (remoteRows || []).map(deserializeRecordFromSupabase);
        const merged = mergeRecords(pendingRecords, remoteRecords);
        const rows = merged.remoteUpserts.map((record) =>
          serializeRecordForSupabase(record, user.id),
        );

        if (rows.length > 0) {
          const { error } = await supabase
            .from("kaizen_records")
            .upsert(rows, { onConflict: "user_id,collection,id" });

          if (error) {
            throw error;
          }
        }

        const nextRecords = applyChangedRecords(recordsRef.current, merged.mergedRecords);
        replaceFromRecords(nextRecords);
        queueRef.current = [];
        writeSyncQueue([]);
        const timestamp = new Date().toISOString();
        const currentMeta = readSyncMeta();
        const migrationCompletionPatch = currentMeta.migrationCompletedAt
          ? {}
          : {
              migrationVersion: MIGRATION_VERSION,
              migrationCompletedAt: timestamp,
            };
        setLastSuccessfulSyncAt(timestamp);
        setMigrationInfo((current) => ({
          ...current,
          ...migrationCompletionPatch,
          lastSuccessfulSyncAt: timestamp,
        }));
        writeSyncMeta({
          ...migrationCompletionPatch,
          lastSuccessfulSyncAt: timestamp,
        });
        await supabase.from("kaizen_sync_state").upsert({
          user_id: user.id,
          migration_version: MIGRATION_VERSION,
          migration_completed_at:
            currentMeta.migrationCompletedAt ||
            migrationCompletionPatch.migrationCompletedAt ||
            timestamp,
          last_successful_sync_at: timestamp,
        });
        setStatus(STATUS.synced);
        setMessage("");
        return true;
      } catch (error) {
        console.error("Kaizen sync queue error", error);
        setStatus(navigator.onLine ? STATUS.error : STATUS.offline);
        setMessage("Alcune modifiche sono salvate localmente e verranno ritentate.");
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
        return;
      }

      queueRef.current = [...queueRef.current, ...queueFromRecords(records)];
      writeSyncQueue(queueRef.current);
      flushQueue();
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

      const rawLocal = readLegacyData();
      const backupKey = createLegacyBackup(rawLocal);
      const normalized = normalizeLegacyData(rawLocal);
      writeLegacyData(normalized.data);

      try {
        const { data: remoteRows, error } = await supabase
          .from("kaizen_records")
          .select("collection,id,data,created_at,updated_at,deleted_at,version")
          .eq("user_id", user.id);

        if (error) {
          throw error;
        }

        const localRecords = recordsFromData(normalized.data);
        const remoteRecords = (remoteRows || []).map(deserializeRecordFromSupabase);
        const merged = mergeRecords(localRecords, remoteRecords);

        if (cancelled) {
          return;
        }

        replaceFromRecords(merged.mergedRecords);
        hasBootstrappedRef.current = true;

        const nextMeta = {
          migrationVersion: MIGRATION_VERSION,
          migrationStartedAt: new Date().toISOString(),
          lastSuccessfulSyncAt,
          legacyBackupKey: backupKey,
          conflictCount: merged.conflicts.length,
          warnings: normalized.warnings,
        };
        setMigrationInfo((current) => ({ ...current, ...nextMeta }));
        writeSyncMeta(nextMeta);

        if (merged.remoteUpserts.length > 0) {
          enqueueRecords(merged.remoteUpserts);
        } else {
          const completedAt = new Date().toISOString();
          setMigrationInfo((current) => ({
            ...current,
            migrationVersion: MIGRATION_VERSION,
            migrationCompletedAt: completedAt,
          }));
          writeSyncMeta({
            migrationVersion: MIGRATION_VERSION,
            migrationCompletedAt: completedAt,
          });
          setStatus(STATUS.synced);
        }
      } catch (error) {
        console.error("Kaizen initial sync error", error);
        hasBootstrappedRef.current = true;
        const localRecords = recordsFromData(normalized.data);
        recordsRef.current = localRecords;
        writeSyncCache(localRecords);
        queueRef.current = [...queueRef.current, ...queueFromRecords(localRecords)];
        writeSyncQueue(queueRef.current);
        setStatus(navigator.onLine ? STATUS.error : STATUS.offline);
        setMessage("Uso i dati locali. La sincronizzazione riprovera' appena possibile.");
      }
    }

    bootstrap();

    return () => {
      cancelled = true;
    };
  }, [
    authReady,
    canUseCloud,
    enqueueRecords,
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
    const payload = {
      exportedAt: new Date().toISOString(),
      migrationVersion: MIGRATION_VERSION,
      syncMeta: readSyncMeta(),
      data: readLegacyData(),
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
      canUseCloud,
      config: supabaseConfig,
      exportBackup,
      importBackup,
      isAuthenticated: Boolean(user),
      isOnline,
      lastSuccessfulSyncAt,
      message,
      migrationInfo,
      pendingCount: queueRef.current.length,
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
      isOnline,
      lastSuccessfulSyncAt,
      message,
      migrationInfo,
      status,
      trackCollectionChange,
      user,
    ],
  );

  return sync;
}
