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
  return Object.fromEntries(
    COLLECTIONS.map((collection) => [
      collection.name,
      readStorage(collection.storageKey, cloneValue(collection.fallback)),
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

export function createLegacyBackup(snapshot, timestamp = nowIso()) {
  const backupKey = `kaizen_legacy_backup_${timestamp.replace(/[:.]/g, "-")}`;
  writeStorage(backupKey, {
    createdAt: timestamp,
    migrationVersion: MIGRATION_VERSION,
    keys: Object.fromEntries(
      COLLECTIONS.map((collection) => [collection.name, collection.storageKey]),
    ),
    data: snapshot,
  });
  return backupKey;
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

export function normalizeLegacyData(input, timestamp = nowIso(), idFactory = createId) {
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
      .map((item) => {
        const record = { ...item };

        if (!record.id) {
          record.id = idFactory();
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

    const conflictRecord = createConflictRecord(local, timestamp, idFactory);
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
  return records.map((record) => ({
    id: createId(),
    createdAt: timestamp,
    attempts: 0,
    record,
  }));
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

function createConflictRecord(record, timestamp, idFactory) {
  const id = `${record.id}__conflict__${idFactory()}`;
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
