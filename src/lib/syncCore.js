import {
  COLLECTIONS,
  COLLECTION_BY_NAME,
  MIGRATION_VERSION,
  STORAGE_KEYS,
  cloneValue,
  createEmptyKaizenData,
} from "./kaizenData.js";
import { readStorage, writeStorage } from "../utils/storage.js";

const ISO_FALLBACK = "1970-01-01T00:00:00.000Z";
const DEVICE_SNAPSHOT_PREFIX = "kaizen_device_snapshot_";
const MAX_DEVICE_SNAPSHOTS = 5;
const QUEUE_VERSION = 2;

function defaultLegacyIdFactory(context = {}) {
  return createStableLegacyId(context.collection, context.item, context.index);
}

export function createId() {
  if (globalThis.crypto?.randomUUID) {
    return globalThis.crypto.randomUUID();
  }

  return `${Date.now()}-${Math.random().toString(16).slice(2)}`;
}

export function nowIso() {
  return new Date().toISOString();
}

export function readLegacyData() {
  return readLegacyDataFromStorage(getBrowserStorage());
}

export function readLegacyDataFromStorage(storage = getBrowserStorage()) {
  return Object.fromEntries(
    COLLECTIONS.map((collection) => [
      collection.name,
      readStorageFrom(storage, collection.storageKey, cloneValue(collection.fallback)),
    ]),
  );
}

export function writeLegacyData(data) {
  for (const collection of COLLECTIONS) {
    writeStorage(
      collection.storageKey,
      data[collection.name] ?? cloneValue(collection.fallback),
    );
  }
}

export function countDataItems(data) {
  if (!data || typeof data !== "object") {
    return 0;
  }

  return COLLECTIONS.reduce((count, collection) => {
    const value = data[collection.name];

    if (collection.kind === "array" || collection.kind === "arrayValue") {
      return count + (Array.isArray(value) ? value.length : 0);
    }

    if (collection.kind === "objectMap") {
      return count + (value && typeof value === "object" && !Array.isArray(value)
        ? Object.keys(value).length
        : 0);
    }

    return count + (isMeaningfulSingleton(value, collection.fallback) ? 1 : 0);
  }, 0);
}

export function countRecords(records) {
  return countDataItems(dataFromRecords(records || []));
}

export function readLegacyBackups(storage = getBrowserStorage()) {
  if (!storage) {
    return [];
  }

  const backups = [];

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);

      if (!key?.startsWith("kaizen_legacy_backup_")) {
        continue;
      }

      const rawValue = storage.getItem(key);
      const parsed = rawValue ? JSON.parse(rawValue) : null;
      const data = parsed?.data;

      if (!data || typeof data !== "object") {
        continue;
      }

      backups.push({
        key,
        createdAt: parsed.createdAt || key.replace("kaizen_legacy_backup_", ""),
        data,
      });
    }
  } catch (error) {
    console.warn("Kaizen legacy backup scan failed", error);
  }

  return backups.sort((left, right) =>
    String(right.createdAt || right.key).localeCompare(String(left.createdAt || left.key)),
  );
}

export function readLatestLegacyBackup(storage = getBrowserStorage()) {
  return findLatestBackupWithData(readLegacyBackups(storage));
}

export function getOrCreateDeviceId(storage = getBrowserStorage()) {
  if (!storage) {
    return "server";
  }

  const existing = storage.getItem(STORAGE_KEYS.deviceId);

  if (existing) {
    try {
      const parsed = JSON.parse(existing);
      return typeof parsed === "string" ? parsed : String(parsed);
    } catch {
      return existing;
    }
  }

  const deviceId = createId();
  safeStorageSet(storage, STORAGE_KEYS.deviceId, JSON.stringify(deviceId));
  return deviceId;
}

export function createDeviceSnapshot(options = {}) {
  const storage = options.storage || getBrowserStorage();
  const timestamp = options.timestamp || nowIso();
  const deviceId = options.deviceId || getOrCreateDeviceId(storage);
  const reason = options.reason || "manual";

  if (!storage) {
    return "";
  }

  pruneDeviceSnapshots(storage, MAX_DEVICE_SNAPSHOTS - 1);

  const snapshotData = readLegacyDataFromStorage(storage);
  const snapshotRecords = recordsFromData(normalizeLegacyData(snapshotData).data);
  const snapshot = {
    collectionCounts: countDataCollections(snapshotData),
    createdAt: timestamp,
    deviceId,
    fingerprint: fingerprintRecords(snapshotRecords),
    migrationVersion: MIGRATION_VERSION,
    reason,
    recordCount: countDataItems(snapshotData),
    data: snapshotData,
  };
  const snapshotKey = `${DEVICE_SNAPSHOT_PREFIX}${timestamp.replace(/[:.]/g, "-")}`;
  const serialized = safeSerialize(snapshot);

  if (!serialized) {
    console.warn("Kaizen device snapshot skipped: JSON serialization failed.");
    return "";
  }

  const firstAttempt = safeStorageSet(storage, snapshotKey, serialized);

  if (firstAttempt.ok) {
    return snapshotKey;
  }

  if (isQuotaError(firstAttempt.error)) {
    pruneDeviceSnapshots(storage, 1);
    const retry = safeStorageSet(storage, snapshotKey, serialized);

    if (retry.ok) {
      return snapshotKey;
    }

    console.warn("Kaizen device snapshot skipped after quota cleanup.", retry.error);
    return "";
  }

  console.warn("Kaizen device snapshot skipped.", firstAttempt.error);
  return "";
}

export function readDeviceSnapshots(storage = getBrowserStorage()) {
  if (!storage) {
    return [];
  }

  const snapshots = [];

  try {
    for (let index = 0; index < storage.length; index += 1) {
      const key = storage.key(index);

      if (!key?.startsWith(DEVICE_SNAPSHOT_PREFIX)) {
        continue;
      }

      const rawValue = storage.getItem(key);
      const parsed = rawValue ? JSON.parse(rawValue) : null;
      const data = parsed?.data;

      if (!data || typeof data !== "object") {
        continue;
      }

      const normalizedData = normalizeLegacyData(data).data;
      snapshots.push({
        collectionCounts: parsed.collectionCounts || countDataCollections(data),
        key,
        createdAt: parsed.createdAt || key.replace(DEVICE_SNAPSHOT_PREFIX, ""),
        data,
        deviceId: parsed.deviceId || "",
        fingerprint:
          parsed.fingerprint ||
          fingerprintRecords(recordsFromData(normalizedData)),
        reason: parsed.reason || "",
        recordCount: countDataItems(normalizedData),
        sizeBytes: rawValue?.length || 0,
      });
    }
  } catch (error) {
    console.warn("Kaizen device snapshot scan failed", error);
  }

  return snapshots.sort((left, right) =>
    String(right.createdAt || right.key).localeCompare(String(left.createdAt || left.key)),
  );
}

export function readLatestDeviceSnapshot(storage = getBrowserStorage()) {
  return findLatestBackupWithData(readDeviceSnapshots(storage));
}

export function readLatestPreImportDeviceSnapshot(storage = getBrowserStorage()) {
  return (
    readDeviceSnapshots(storage).find((snapshot) => snapshot.reason === "pre-import") ||
    null
  );
}

export function getBestLocalRecoveryData(options = {}) {
  const includeRecoverySources = Boolean(options.includeRecoverySources);
  const timestamp = options.timestamp || nowIso();
  const idFactory = options.idFactory || defaultLegacyIdFactory;
  const storage = options.storage || getBrowserStorage();
  const rawLegacy = options.rawLegacy || readLegacyDataFromStorage(storage);
  const normalizedLegacy = normalizeLegacyData(rawLegacy, timestamp, idFactory);
  const legacyCount = countDataItems(normalizedLegacy.data);
  const latestBackup =
    options.latestBackup || findLatestBackupWithData(readLegacyBackups(storage));
  const normalizedBackup = latestBackup?.data
    ? normalizeLegacyData(latestBackup.data, timestamp, idFactory)
    : null;
  const backupCount = normalizedBackup ? countDataItems(normalizedBackup.data) : 0;
  const latestSnapshot =
    options.latestSnapshot || findLatestBackupWithData(readDeviceSnapshots(storage));
  const normalizedSnapshot = latestSnapshot?.data
    ? normalizeLegacyData(latestSnapshot.data, timestamp, idFactory)
    : null;
  const snapshotCount = normalizedSnapshot ? countDataItems(normalizedSnapshot.data) : 0;
  const syncCacheRecords = options.syncCacheRecords || readSyncCache().records || [];
  const syncCacheCount = countRecords(syncCacheRecords);
  const sources = [];

  if (legacyCount > 0) {
    sources.push({
      count: legacyCount,
      name: "legacy",
      records: recordsFromData(normalizedLegacy.data, timestamp),
      warnings: normalizedLegacy.warnings,
    });
  }

  if (includeRecoverySources && backupCount > 0) {
    sources.push({
      count: backupCount,
      key: latestBackup.key,
      name: "legacyBackup",
      records: recordsFromData(normalizedBackup.data, timestamp),
      warnings: normalizedBackup.warnings,
    });
  }

  if (includeRecoverySources && snapshotCount > 0) {
    sources.push({
      count: snapshotCount,
      key: latestSnapshot.key,
      name: "deviceSnapshot",
      records: recordsFromData(normalizedSnapshot.data, timestamp),
      warnings: normalizedSnapshot.warnings,
    });
  }

  if (syncCacheCount > 0 && legacyCount === 0) {
    sources.push({
      count: syncCacheCount,
      name: "syncCache",
      records: syncCacheRecords,
      warnings: [],
    });
  }

  if (sources.length === 0) {
    return {
      backupCount,
      backupKey: latestBackup?.key || "",
      data: normalizedLegacy.data,
      legacyCount,
      records: recordsFromData(normalizedLegacy.data, timestamp),
      source: "emptyLegacy",
      snapshotCount,
      snapshotKey: latestSnapshot?.key || "",
      syncCacheCount,
      warnings: normalizedLegacy.warnings,
    };
  }

  const merged = mergeRecordSources(sources, timestamp, idFactory);

  return {
    backupCount,
    backupKey: latestBackup?.key || "",
    data: dataFromRecords(merged.records),
    legacyCount,
    records: merged.records,
    source: merged.source,
    snapshotCount,
    snapshotKey: latestSnapshot?.key || "",
    syncCacheCount,
    warnings: merged.warnings,
  };
}

export function createLegacyBackup(snapshot, timestamp = nowIso()) {
  const backupKey = `kaizen_legacy_backup_${timestamp.replace(/[:.]/g, "-")}`;
  const saved = writeStorage(backupKey, {
    createdAt: timestamp,
    migrationVersion: MIGRATION_VERSION,
    keys: Object.fromEntries(
      COLLECTIONS.map((collection) => [collection.name, collection.storageKey]),
    ),
    data: snapshot,
  });
  return saved ? backupKey : "";
}

export function readSyncCache() {
  return readStorage(STORAGE_KEYS.syncCache, { records: [] });
}

export function writeSyncCache(records) {
  writeStorage(STORAGE_KEYS.syncCache, { savedAt: nowIso(), records });
}

export function readSyncQueue() {
  return readStorage(STORAGE_KEYS.syncQueue, []);
}

export function writeSyncQueue(queue) {
  writeStorage(STORAGE_KEYS.syncQueue, queue);
}

export function readSyncMeta() {
  return readStorage(STORAGE_KEYS.syncMeta, {});
}

export function writeSyncMeta(patch) {
  writeStorage(STORAGE_KEYS.syncMeta, {
    ...readSyncMeta(),
    ...patch,
  });
}

export function normalizeLegacyData(input, timestamp = nowIso(), idFactory = defaultLegacyIdFactory) {
  const data = createEmptyKaizenData();
  const warnings = [];

  for (const collection of COLLECTIONS) {
    const value = input?.[collection.name] ?? cloneValue(collection.fallback);
    data[collection.name] = normalizeCollectionValue(
      collection,
      value,
      timestamp,
      idFactory,
      warnings,
    );
  }

  return { data, warnings };
}

function normalizeCollectionValue(collection, value, timestamp, idFactory, warnings) {
  if (collection.kind === "array") {
    if (!Array.isArray(value)) {
      warnings.push(`${collection.name}: valore non-array ignorato.`);
      return [];
    }

    return value
      .filter((item) => item && typeof item === "object")
      .map((item, index) => {
        const record = { ...item };

        if (!record.id) {
          record.id = idFactory({
            collection: collection.name,
            index,
            item: record,
          });
        }

        if (!record.createdAt) {
          record.createdAt = timestamp;
        }

        if (!record.updatedAt) {
          record.updatedAt = record.completedAt || record.archivedAt || record.createdAt;
        }

        return record;
      });
  }

  if (collection.kind === "objectMap") {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
      warnings.push(`${collection.name}: valore non-oggetto ignorato.`);
      return {};
    }

    return { ...value };
  }

  if (collection.kind === "arrayValue") {
    return Array.isArray(value) ? [...value] : [];
  }

  return value ?? cloneValue(collection.fallback);
}

export function recordsFromData(data, timestamp = nowIso()) {
  const records = [];

  for (const collection of COLLECTIONS) {
    const value = data[collection.name] ?? cloneValue(collection.fallback);

    if (collection.kind === "array") {
      for (const item of Array.isArray(value) ? value : []) {
        if (!item?.id) {
          continue;
        }

        records.push(toRecord(collection.name, item.id, item, timestamp, item));
      }
      continue;
    }

    if (collection.kind === "objectMap") {
      const entries = value && typeof value === "object" ? Object.entries(value) : [];

      for (const [key, entryValue] of entries) {
        records.push(
          toRecord(
            collection.name,
            key,
            { key, value: entryValue },
            timestamp,
            entryValue && typeof entryValue === "object" ? entryValue : null,
          ),
        );
      }
      continue;
    }

    records.push(
      toRecord(collection.name, collection.name, { value }, timestamp, null),
    );
  }

  return records;
}

function toRecord(collection, id, data, timestamp, source) {
  return {
    collection,
    id: String(id),
    data: cloneValue(data),
    created_at: pickDate(source?.createdAt, timestamp),
    updated_at: pickDate(source?.updatedAt, source?.completedAt, source?.archivedAt, source?.createdAt, timestamp),
    deleted_at: null,
    version: Number(source?.version) || 1,
  };
}

export function dataFromRecords(records) {
  const data = createEmptyKaizenData();

  for (const record of records) {
    if (record.deleted_at) {
      continue;
    }

    const collection = COLLECTION_BY_NAME[record.collection];

    if (!collection) {
      continue;
    }

    if (collection.kind === "array") {
      data[collection.name].push(record.data);
      continue;
    }

    if (collection.kind === "objectMap") {
      data[collection.name][record.id] =
        record.data && Object.hasOwn(record.data, "value")
          ? record.data.value
          : record.data;
      continue;
    }

    data[collection.name] =
      record.data && Object.hasOwn(record.data, "value")
        ? record.data.value
        : record.data;
  }

  for (const collection of COLLECTIONS.filter((item) => item.kind === "array")) {
    data[collection.name].sort(compareCollectionItems);
  }

  return data;
}

function compareCollectionItems(left, right) {
  const leftOrder = Number(left.order);
  const rightOrder = Number(right.order);

  if (Number.isFinite(leftOrder) && Number.isFinite(rightOrder) && leftOrder !== rightOrder) {
    return leftOrder - rightOrder;
  }

  return String(right.updatedAt || right.createdAt || "").localeCompare(
    String(left.updatedAt || left.createdAt || ""),
  );
}

export function mergeRecords(localRecords, remoteRecords, options = {}) {
  const timestamp = options.timestamp || nowIso();
  const idFactory = options.idFactory || createId;
  const byKey = new Map();
  const remoteUpserts = [];
  const merged = [];
  const conflicts = [];

  for (const record of localRecords) {
    byKey.set(recordKey(record), { local: record });
  }

  for (const record of remoteRecords) {
    const key = recordKey(record);
    byKey.set(key, { ...byKey.get(key), remote: record });
  }

  for (const { local, remote } of byKey.values()) {
    if (local && !remote) {
      merged.push(local);
      remoteUpserts.push(local);
      continue;
    }

    if (!local && remote) {
      merged.push(remote);
      continue;
    }

    if (recordsEqual(local, remote)) {
      merged.push(newerMetadata(local, remote));
      continue;
    }

    const winner = pickWinner(local, remote);

    if (winner === "local") {
      merged.push(local);
      remoteUpserts.push(local);
      continue;
    }

    if (winner === "remote") {
      merged.push(remote);
      continue;
    }

    const conflictRecord = createConflictRecord(local, remote, timestamp, idFactory);
    merged.push(remote, conflictRecord);
    remoteUpserts.push(conflictRecord);
    conflicts.push({
      collection: local.collection,
      id: local.id,
      preservedAs: conflictRecord.id,
    });
  }

  return {
    conflicts,
    mergedRecords: dedupeRecords(merged),
    remoteUpserts: dedupeRecords(remoteUpserts),
  };
}

export function mergeRecordSources(sources, timestamp = nowIso(), idFactory = createId) {
  const activeSources = sources.filter((source) => Array.isArray(source.records));
  const firstSource = activeSources[0];
  let records = firstSource?.records || [];
  const usedSources = firstSource ? [firstSource.name] : [];
  const warnings = [...(firstSource?.warnings || [])];
  let remoteUpserts = [];
  let conflicts = [];

  for (const source of activeSources.slice(1)) {
    const merged = mergeRecords(records, source.records, { timestamp, idFactory });
    records = merged.mergedRecords;
    remoteUpserts = [...remoteUpserts, ...merged.remoteUpserts];
    conflicts = [...conflicts, ...merged.conflicts];
    warnings.push(...(source.warnings || []));
    usedSources.push(source.name);
  }

  return {
    conflicts,
    records: dedupeRecords(records),
    remoteUpserts: dedupeRecords(remoteUpserts),
    source: usedSources.join("+") || "empty",
    warnings,
  };
}

export function mergeBootstrapRecords(options = {}) {
  const timestamp = options.timestamp || nowIso();
  const idFactory = options.idFactory || createId;
  const localRecords = options.localRecords || [];
  const remoteRecords = options.remoteRecords || [];
  const localCount = countRecords(localRecords);
  const remoteCount = countRecords(remoteRecords);
  const recoverySource = options.recoverySource || "local";

  if (localCount > 0 && remoteCount === 0) {
    return {
      conflicts: [],
      localCount,
      mergedCount: localCount,
      mergedRecords: localRecords,
      remoteCount,
      remoteUpserts: localRecords,
      source: recoverySource,
    };
  }

  if (localCount === 0 && remoteCount > 0) {
    return {
      conflicts: [],
      localCount,
      mergedCount: remoteCount,
      mergedRecords: remoteRecords,
      remoteCount,
      remoteUpserts: [],
      source: "remote",
    };
  }

  if (localCount === 0 && remoteCount === 0) {
    return {
      conflicts: [],
      localCount,
      mergedCount: 0,
      mergedRecords: localRecords,
      remoteCount,
      remoteUpserts: [],
      source: "empty",
    };
  }

  const merged = mergeRecordSources(
    [
      {
        name: recoverySource,
        records: localRecords,
        warnings: options.warnings || [],
      },
      {
        name: "remote",
        records: remoteRecords,
        warnings: [],
      },
    ],
    timestamp,
    idFactory,
  );
  const mergedCount = countRecords(merged.records);

  validateMigrationResult(localCount, mergedCount);

  return {
    conflicts: merged.conflicts,
    localCount,
    mergedCount,
    mergedRecords: merged.records,
    remoteCount,
    remoteUpserts: merged.remoteUpserts,
    source: merged.source,
  };
}

export function planBootstrapSync(options = {}) {
  const localRecords = options.localRecords || [];
  const remoteRecords = options.remoteRecords || [];
  const localCount = countRecords(localRecords);
  const remoteCount = countRecords(remoteRecords);
  const sourceFingerprint = fingerprintRecords(localRecords);
  const merged = mergeBootstrapRecords(options);
  const shouldReplaceLocal = localCount === 0 && remoteCount > 0;
  const localImportIgnored = localCount > 0 && Boolean(options.ignoreLocalForCloudImport);
  const requiresExplicitImport = localCount > 0 && !localImportIgnored;

  return {
    ...merged,
    localImportIgnored,
    requiresExplicitImport,
    shouldReplaceLocal,
    shouldUploadLocal: false,
    sourceFingerprint,
  };
}

export function planSupabaseFirstBootstrap(options = {}) {
  const remoteRecords = options.remoteRecords || [];
  const cacheRecords = options.cacheRecords || [];

  return {
    authoritativeRecords: remoteRecords,
    cacheCount: countRecords(cacheRecords),
    localImportIgnored: true,
    remoteCount: countRecords(remoteRecords),
    requiresExplicitImport: false,
    shouldReplaceLocal: true,
    shouldUploadLocal: false,
    source: "remote",
  };
}

export function createRemoteUserResetPlan(options = {}) {
  const userId = options.userId;
  const recordRows = options.recordRows || [];
  const syncStateRows = options.syncStateRows || [];

  if (!userId) {
    throw new Error("Reset remoto bloccato: user_id mancante.");
  }

  const kaizenRecords = recordRows.filter((row) => row.user_id === userId);
  const syncState = syncStateRows.filter((row) => row.user_id === userId);

  return {
    backup: {
      createdAt: nowIso(),
      kaizen_records: kaizenRecords,
      kaizen_sync_state: syncState,
      user_id: userId,
    },
    deleteCounts: {
      kaizen_records: kaizenRecords.length,
      kaizen_sync_state: syncState.length,
    },
    remainingRecords: recordRows.filter((row) => row.user_id !== userId),
    remainingSyncState: syncStateRows.filter((row) => row.user_id !== userId),
    user_id: userId,
  };
}

export function validateMigrationResult(localCount, mergedCount) {
  if (localCount > 0 && mergedCount === 0) {
    throw new Error(
      "Migrazione bloccata: esistono dati locali ma il merge ha prodotto zero record.",
    );
  }
}

export function diffCollectionRecords(previousRecords, nextData, collectionName, timestamp = nowIso()) {
  const previous = previousRecords.filter((record) => record.collection === collectionName);
  const nextRecords = recordsFromData({ [collectionName]: nextData }, timestamp).filter(
    (record) => record.collection === collectionName,
  );
  const previousById = new Map(previous.map((record) => [record.id, record]));
  const nextById = new Map(nextRecords.map((record) => [record.id, record]));
  const changes = [];

  for (const nextRecord of nextRecords) {
    const previousRecord = previousById.get(nextRecord.id);

    if (!previousRecord) {
      changes.push({ ...nextRecord, updated_at: timestamp });
      continue;
    }

    if (!recordsEqual(previousRecord, nextRecord)) {
      changes.push({
        ...nextRecord,
        created_at: previousRecord.created_at || nextRecord.created_at,
        updated_at: pickDate(nextRecord.updated_at, timestamp),
        version: Number(previousRecord.version || 0) + 1,
      });
    }
  }

  for (const previousRecord of previous) {
    if (!nextById.has(previousRecord.id) && !previousRecord.deleted_at) {
      changes.push({
        ...previousRecord,
        deleted_at: timestamp,
        updated_at: timestamp,
        version: Number(previousRecord.version || 0) + 1,
      });
    }
  }

  return changes;
}

export function diffDataRecords(
  previousRecords,
  nextData,
  collectionNames,
  timestamp = nowIso(),
) {
  let workingRecords = previousRecords;
  const changes = [];

  for (const collectionName of [...new Set(collectionNames)]) {
    const collectionChanges = diffCollectionRecords(
      workingRecords,
      nextData[collectionName],
      collectionName,
      timestamp,
    );
    changes.push(...collectionChanges);
    workingRecords = applyChangedRecords(workingRecords, collectionChanges);
  }

  return changes;
}

export function applyChangedRecords(currentRecords, changedRecords) {
  const byKey = new Map(currentRecords.map((record) => [recordKey(record), record]));

  for (const change of changedRecords) {
    const existing = byKey.get(recordKey(change));
    const winner = existing ? pickWinner(change, existing) : "local";

    if (!existing || winner === "local" || recordsEqual(change, existing)) {
      byKey.set(recordKey(change), change);
    }
  }

  return dedupeRecords([...byKey.values()]);
}

export function queueFromRecords(records, timestamp = nowIso()) {
  return operationsFromRecords(records, timestamp);
}

export function operationsFromRecords(records, timestamp = nowIso()) {
  return records.map((record) => ({
    id: createId(),
    createdAt: timestamp,
    attempts: 0,
    collection: record.collection,
    record,
    recordId: record.id,
    type: record.deleted_at ? "delete" : "upsert",
    version: QUEUE_VERSION,
  }));
}

export function normalizeSyncQueue(queue = []) {
  return queue
    .map((item) => {
      if (!item?.record) {
        return null;
      }

      return {
        id: item.id || createId(),
        createdAt: item.createdAt || nowIso(),
        attempts: item.attempts || 0,
        collection: item.collection || item.record.collection,
        record: item.record,
        recordId: item.recordId || item.record.id,
        type: item.type || (item.record.deleted_at ? "delete" : "upsert"),
        version: item.version || 1,
      };
    })
    .filter(Boolean);
}

export function mergeQueuedOperations(existingQueue = [], operations = []) {
  const byKey = new Map(
    normalizeSyncQueue(existingQueue).map((item) => [
      operationKey(item),
      {
        ...item,
        attempts: item.attempts || 0,
      },
    ]),
  );

  for (const item of normalizeSyncQueue(operations)) {
    const key = operationKey(item);
    const existing = byKey.get(key);
    byKey.set(key, existing ? { ...item, attempts: existing.attempts } : item);
  }

  return [...byKey.values()];
}

export function mergeQueuedRecords(existingQueue = [], records = [], timestamp = nowIso()) {
  return mergeQueuedOperations(existingQueue, operationsFromRecords(records, timestamp));
}

export function removeFlushedOperations(queue = [], flushedOperations = []) {
  const flushedIds = new Set(
    normalizeSyncQueue(flushedOperations).map((item) => item.id),
  );

  return normalizeSyncQueue(queue).filter((item) => !flushedIds.has(item.id));
}

export function reconcileSyncRecords(options = {}) {
  const remoteRecords = options.remoteRecords || [];
  const pendingOperations = normalizeSyncQueue(options.queue || []);
  const timestamp = options.timestamp || nowIso();
  const idFactory = options.idFactory || createId;
  const recordsByKey = new Map(
    remoteRecords.map((record) => [recordKey(record), record]),
  );
  const pendingByKey = new Map(
    pendingOperations.map((operation) => [operationKey(operation), operation]),
  );
  const remoteUpserts = [];
  const conflicts = [];

  for (const operation of pendingByKey.values()) {
    const localRecord = operation.record;
    const key = recordKey(localRecord);
    const remoteRecord = recordsByKey.get(key);

    if (!remoteRecord) {
      recordsByKey.set(key, localRecord);
      remoteUpserts.push(localRecord);
      continue;
    }

    if (recordsEqual(localRecord, remoteRecord)) {
      recordsByKey.set(key, newerMetadata(localRecord, remoteRecord));
      continue;
    }

    const localVersion = Number(localRecord.version) || 1;
    const remoteVersion = Number(remoteRecord.version) || 1;

    if (localVersion > remoteVersion) {
      recordsByKey.set(key, localRecord);
      remoteUpserts.push(localRecord);
      continue;
    }

    recordsByKey.set(key, remoteRecord);

    // A remote write reached the same record while this device was offline.
    // Keep the remote winner at the original id and preserve the local content
    // as a deterministic conflict copy instead of silently overwriting either.
    if (!localRecord.deleted_at) {
      const conflictRecord = createConflictRecord(
        localRecord,
        remoteRecord,
        timestamp,
        idFactory,
      );
      recordsByKey.set(recordKey(conflictRecord), conflictRecord);
      remoteUpserts.push(conflictRecord);
      conflicts.push({
        collection: localRecord.collection,
        id: localRecord.id,
        preservedAs: conflictRecord.id,
      });
    }
  }

  const records = dedupeRecords([...recordsByKey.values()]);
  const outgoingQueue = mergeQueuedRecords([], remoteUpserts, timestamp);

  return {
    conflicts,
    records,
    remoteCount: countRecords(remoteRecords),
    remoteUpserts: dedupeRecords(remoteUpserts),
    queue: outgoingQueue,
  };
}

export async function flushQueuedOperations(options = {}) {
  const getQueue = options.getQueue || (() => []);
  const setQueue = options.setQueue || (() => {});
  const sendBatch = options.sendBatch;

  if (typeof sendBatch !== "function") {
    throw new Error("flushQueuedOperations richiede sendBatch.");
  }

  let flushedCount = 0;

  while (true) {
    const batch = normalizeSyncQueue(getQueue());
    setQueue(batch);

    if (batch.length === 0) {
      return {
        flushedCount,
        ok: true,
      };
    }

    try {
      await sendBatch(batch);
    } catch (error) {
      setQueue(normalizeSyncQueue(getQueue()));
      return {
        error,
        flushedCount,
        ok: false,
      };
    }

    flushedCount += batch.length;
    setQueue(removeFlushedOperations(getQueue(), batch));
  }
}

export function serializeRecordForSupabase(record, userId) {
  return {
    user_id: userId,
    collection: record.collection,
    id: record.id,
    data: record.data,
    created_at: record.created_at,
    updated_at: record.updated_at,
    deleted_at: record.deleted_at,
    version: record.version || 1,
  };
}

export function deserializeRecordFromSupabase(row) {
  return {
    collection: row.collection,
    id: row.id,
    data: row.data,
    created_at: row.created_at,
    updated_at: row.updated_at,
    deleted_at: row.deleted_at,
    version: row.version || 1,
  };
}

export function fingerprintData(value) {
  return stableHash(stableSerialize(value));
}

export function fingerprintRecords(records = []) {
  return fingerprintData(
    records
      .filter((record) => !record.deleted_at)
      .map((record) => ({
        collection: record.collection,
        data: record.data,
        id: record.id,
      }))
      .sort((left, right) =>
        `${left.collection}:${left.id}`.localeCompare(`${right.collection}:${right.id}`),
      ),
  );
}

export function countDataCollections(data) {
  if (!data || typeof data !== "object") {
    return {};
  }

  return Object.fromEntries(
    COLLECTIONS.map((collection) => {
      const value = data[collection.name];

      if (collection.kind === "array" || collection.kind === "arrayValue") {
        return [collection.name, Array.isArray(value) ? value.length : 0];
      }

      if (collection.kind === "objectMap") {
        return [
          collection.name,
          value && typeof value === "object" && !Array.isArray(value)
            ? Object.keys(value).length
            : 0,
        ];
      }

      return [
        collection.name,
        isMeaningfulSingleton(value, collection.fallback) ? 1 : 0,
      ];
    }),
  );
}

export function createCachedKaizenData() {
  const localData = normalizeLegacyData(readLegacyData()).data;

  if (countDataItems(localData) > 0) {
    return localData;
  }

  const cachedRecords = readSyncCache().records || [];

  if (countRecords(cachedRecords) > 0) {
    return dataFromRecords(cachedRecords);
  }

  return localData;
}

export function summarizeDeviceSnapshots(storage = getBrowserStorage()) {
  return readDeviceSnapshots(storage).map((snapshot) => ({
    collectionCounts: snapshot.collectionCounts,
    createdAt: snapshot.createdAt,
    deviceId: snapshot.deviceId,
    fingerprint: snapshot.fingerprint,
    key: snapshot.key,
    recordCount: snapshot.recordCount,
    reason: snapshot.reason,
    sizeBytes: snapshot.sizeBytes,
  }));
}

export function pruneDeviceSnapshots(storage = getBrowserStorage(), keep = MAX_DEVICE_SNAPSHOTS) {
  if (!storage) {
    return 0;
  }

  const snapshots = readDeviceSnapshots(storage);
  const removable = snapshots.slice(Math.max(0, keep));
  let removed = 0;

  for (const snapshot of removable) {
    try {
      storage.removeItem(snapshot.key);
      removed += 1;
    } catch (error) {
      console.warn("Kaizen device snapshot cleanup failed", error);
    }
  }

  return removed;
}

export function clearLocalKaizenDataForAccount(storage = getBrowserStorage()) {
  if (!storage) {
    return 0;
  }

  const keysToRemove = new Set([
    STORAGE_KEYS.syncCache,
    STORAGE_KEYS.syncQueue,
    STORAGE_KEYS.syncMeta,
    STORAGE_KEYS.migration,
  ]);

  for (const collection of COLLECTIONS) {
    keysToRemove.add(collection.storageKey);
  }

  let removed = 0;

  for (const key of keysToRemove) {
    try {
      storage.removeItem(key);
      removed += 1;
    } catch (error) {
      console.warn(`Kaizen local cleanup failed for ${key}`, error);
    }
  }

  removed += pruneDeviceSnapshots(storage, 0);
  return removed;
}

export function analyzeDuplicateRecords(records = []) {
  const activeRecords = records.filter((record) => !record.deleted_at);
  const groups = new Map();

  for (const record of activeRecords) {
    const identity = duplicateIdentity(record);
    const group = groups.get(identity) || {
      collection: record.collection,
      identity,
      records: [],
    };
    group.records.push(record);
    groups.set(identity, group);
  }

  const duplicateGroups = [...groups.values()].filter((group) => group.records.length > 1);
  const duplicateCount = duplicateGroups.reduce(
    (count, group) => count + group.records.length - 1,
    0,
  );

  return {
    duplicateCount,
    groups: duplicateGroups.map((group) => ({
      collection: group.collection,
      count: group.records.length,
      ids: group.records.map((record) => record.id),
      identity: group.identity,
    })),
    totalCount: activeRecords.length,
    uniqueCount: activeRecords.length - duplicateCount,
  };
}

export function createDuplicateRemovalPlan(records = []) {
  const activeRecords = records.filter((record) => !record.deleted_at);
  const groups = new Map();

  for (const record of activeRecords) {
    const identity = duplicateIdentity(record);
    const group = groups.get(identity) || [];
    group.push(record);
    groups.set(identity, group);
  }

  const removeCandidates = [];

  for (const group of groups.values()) {
    if (group.length < 2) {
      continue;
    }

    const sorted = [...group].sort((left, right) =>
      compareDates(right.updated_at, left.updated_at),
    );
    removeCandidates.push(
      ...sorted.slice(1).map((record) => ({
        collection: record.collection,
        id: record.id,
        identity: duplicateIdentity(record),
        updated_at: record.updated_at,
      })),
    );
  }

  const analysis = analyzeDuplicateRecords(records);

  return {
    ...analysis,
    backupRequired: true,
    removeCandidates,
  };
}

function createConflictRecord(record, conflictWith, timestamp, idFactory) {
  const conflictFingerprint = fingerprintData({
    collection: record.collection,
    local: canonicalConflictData(record.data),
    remote: canonicalConflictData(conflictWith?.data),
    sourceId: record.id,
  });
  const id = `${record.id}__conflict__${conflictFingerprint}`;
  const data = cloneValue(record.data);

  if (data && typeof data === "object" && !Array.isArray(data)) {
    data.id = id;
    data.conflictOf = record.id;
    data.conflictPreservedAt = timestamp;

    if (typeof data.title === "string" && !data.title.includes("(conflitto conservato)")) {
      data.title = `${data.title} (conflitto conservato)`;
    }
  }

  return {
    ...record,
    id,
    data,
    created_at: timestamp,
    updated_at: timestamp,
    deleted_at: null,
    version: 1,
  };
}

function dedupeRecords(records) {
  return [...new Map(records.map((record) => [recordKey(record), record])).values()];
}

function recordKey(record) {
  return `${record.collection}:${record.id}`;
}

function operationKey(operation) {
  return `${operation.collection || operation.record?.collection}:${operation.recordId || operation.record?.id}`;
}

function recordsEqual(left, right) {
  return (
    left.collection === right.collection &&
    left.id === right.id &&
    JSON.stringify(left.data) === JSON.stringify(right.data) &&
    (left.deleted_at || null) === (right.deleted_at || null)
  );
}

function newerMetadata(left, right) {
  return compareDates(left.updated_at, right.updated_at) >= 0 ? left : right;
}

function pickWinner(left, right) {
  const leftDeleted = Boolean(left.deleted_at);
  const rightDeleted = Boolean(right.deleted_at);

  if (leftDeleted !== rightDeleted) {
    const comparison = compareDates(left.updated_at, right.updated_at);
    return comparison >= 0 ? "local" : "remote";
  }

  const comparison = compareDates(left.updated_at, right.updated_at);

  if (comparison > 0) {
    return "local";
  }

  if (comparison < 0) {
    return "remote";
  }

  return "conflict";
}

function compareDates(left, right) {
  return new Date(left || ISO_FALLBACK).getTime() - new Date(right || ISO_FALLBACK).getTime();
}

function pickDate(...values) {
  return values.find((value) => value && !Number.isNaN(new Date(value).getTime())) || nowIso();
}

function isMeaningfulSingleton(value, fallback) {
  if (value === undefined || value === null || value === "") {
    return false;
  }

  if (typeof value === "number") {
    return value !== 0;
  }

  return JSON.stringify(value) !== JSON.stringify(fallback);
}

function getBrowserStorage() {
  return typeof window !== "undefined" ? window.localStorage : undefined;
}

function readStorageFrom(storage, key, fallback) {
  try {
    const value = storage?.getItem(key);
    return value ? JSON.parse(value) : fallback;
  } catch {
    return fallback;
  }
}

function safeSerialize(value) {
  try {
    return JSON.stringify(value);
  } catch (error) {
    console.warn("Kaizen JSON serialization failed", error);
    return "";
  }
}

function safeStorageSet(storage, key, value) {
  try {
    storage?.setItem(key, value);
    return { ok: true };
  } catch (error) {
    if (isQuotaError(error) || isSecurityError(error)) {
      console.warn(`Kaizen localStorage setItem failed for ${key}`, error);
    } else {
      console.warn(`Kaizen localStorage setItem failed for ${key}`, error);
    }
    return { error, ok: false };
  }
}

function isQuotaError(error) {
  return (
    error?.name === "QuotaExceededError" ||
    error?.name === "NS_ERROR_DOM_QUOTA_REACHED" ||
    error?.code === 22 ||
    error?.code === 1014
  );
}

function isSecurityError(error) {
  return error?.name === "SecurityError";
}

function findLatestBackupWithData(backups) {
  return (
    backups.find((backup) => {
      const normalized = normalizeLegacyData(backup.data);
      return countDataItems(normalized.data) > 0;
    }) ||
    backups[0] ||
    null
  );
}

function createStableLegacyId(collection, item, index) {
  return `legacy-${collection}-${fingerprintData({
    index,
    item: canonicalLegacyItem(item),
  })}`;
}

function canonicalLegacyItem(item) {
  if (!item || typeof item !== "object" || Array.isArray(item)) {
    return item;
  }

  const { id, updatedAt, ...rest } = item;
  return rest;
}

function canonicalConflictData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }

  const {
    conflictPreservedAt,
    id,
    updatedAt,
    version,
    ...rest
  } = data;
  return rest;
}

function duplicateIdentity(record) {
  const data = record.data && typeof record.data === "object" ? record.data : {};
  const originalId =
    data.conflictOf ||
    data.legacyTaskId ||
    data.sourceInboxItemId ||
    (String(record.id || "").includes("__conflict__") ? baseConflictId(record.id) : "");
  const contentFingerprint = fingerprintData(canonicalDuplicateData(data));
  return `${record.collection}:${originalId}:${contentFingerprint}`;
}

function baseConflictId(id) {
  return String(id || "").split("__conflict__")[0];
}

function canonicalDuplicateData(data) {
  if (!data || typeof data !== "object" || Array.isArray(data)) {
    return data;
  }

  const {
    conflictPreservedAt,
    id,
    order,
    updatedAt,
    version,
    ...rest
  } = data;
  return rest;
}

function stableSerialize(value) {
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value);
  }

  if (Array.isArray(value)) {
    return `[${value.map((item) => stableSerialize(item)).join(",")}]`;
  }

  return `{${Object.keys(value)
    .sort()
    .map((key) => `${JSON.stringify(key)}:${stableSerialize(value[key])}`)
    .join(",")}}`;
}

function stableHash(value) {
  let hash = 2166136261;

  for (let index = 0; index < value.length; index += 1) {
    hash ^= value.charCodeAt(index);
    hash = Math.imul(hash, 16777619);
  }

  return (hash >>> 0).toString(36);
}
