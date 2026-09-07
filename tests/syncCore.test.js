import assert from "node:assert/strict";
import test from "node:test";
import {
  applyChangedRecords,
  analyzeDuplicateRecords,
  clearLocalKaizenDataForAccount,
  countRecords,
  createCachedKaizenData,
  createDuplicateRemovalPlan,
  createDeviceSnapshot,
  createRemoteUserResetPlan,
  dataFromRecords,
  diffCollectionRecords,
  fingerprintRecords,
  flushQueuedOperations,
  getBestLocalRecoveryData,
  getOrCreateDeviceId,
  mergeBootstrapRecords,
  mergeRecords,
  mergeQueuedRecords,
  normalizeLegacyData,
  normalizeSyncQueue,
  operationsFromRecords,
  planBootstrapSync,
  planSupabaseFirstBootstrap,
  pruneDeviceSnapshots,
  queueFromRecords,
  readDeviceSnapshots,
  recordsFromData,
  removeFlushedOperations,
  validateMigrationResult,
} from "../src/lib/syncCore.js";

function action(id, title, updatedAt = "2026-08-15T10:00:00.000Z") {
  return {
    id,
    title,
    completed: false,
    order: 0,
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt,
    completedAt: null,
  };
}

function project(id, title, updatedAt = "2026-08-15T10:00:00.000Z") {
  return {
    id,
    title,
    createdAt: "2026-08-15T09:00:00.000Z",
    updatedAt,
  };
}

function projectAction(
  id,
  projectId,
  title,
  updatedAt = "2026-08-15T10:00:00.000Z",
) {
  return {
    ...action(id, title, updatedAt),
    projectId,
  };
}

function makeStorage(entries) {
  const map = new Map(Object.entries(entries));

  return {
    get length() {
      return map.size;
    },
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    key(index) {
      return [...map.keys()][index] || null;
    },
    removeItem(key) {
      map.delete(key);
    },
    setItem(key, value) {
      map.set(key, value);
    },
  };
}

function makeQuotaStorage(entries, options = {}) {
  const storage = makeStorage(entries);
  let shouldThrow = Boolean(options.throwUntilSnapshotCountBelow);

  return {
    get length() {
      return storage.length;
    },
    getItem: storage.getItem,
    key: storage.key,
    removeItem: storage.removeItem,
    setItem(key, value) {
      const snapshotCount = Array.from({ length: storage.length }, (_, index) =>
        storage.key(index),
      ).filter((item) => item?.startsWith("kaizen_device_snapshot_")).length;

      if (
        key.startsWith("kaizen_device_snapshot_") &&
        (options.alwaysThrow || (shouldThrow && snapshotCount >= options.throwUntilSnapshotCountBelow))
      ) {
        const error = new Error("quota");
        error.name = "QuotaExceededError";
        shouldThrow = false;
        throw error;
      }

      storage.setItem(key, value);
    },
  };
}

test("Local-only startup hydrates saved legacy collections when sync cache is empty", () => {
  const storage = makeStorage({
    "kaizen:v1:gtd:nextActions": JSON.stringify([
      action("local-next", "Persisted Next Action"),
    ]),
    "kaizen:v1:gtd:calendarItems": JSON.stringify([
      {
        id: "local-calendar",
        title: "Persisted schedule",
        date: "2026-09-06",
        sourceTaskId: "local-next",
        sourceCollection: "nextActions",
        createdAt: "2026-09-06T08:00:00.000Z",
        updatedAt: "2026-09-06T08:00:00.000Z",
      },
    ]),
  });
  const previousWindow = globalThis.window;
  globalThis.window = { localStorage: storage };

  try {
    const data = createCachedKaizenData();
    assert.equal(data.nextActions[0].id, "local-next");
    assert.equal(data.calendarItems[0].sourceTaskId, "local-next");
  } finally {
    if (previousWindow === undefined) {
      delete globalThis.window;
    } else {
      globalThis.window = previousWindow;
    }
  }
});

test("Scenario A: PC A B C and empty Supabase keeps A B C", () => {
  const local = recordsFromData({
    nextActions: [action("a", "A"), action("b", "B"), action("c", "C")],
  }).filter((record) => record.collection === "nextActions");

  const result = mergeRecords(local, []);
  const data = dataFromRecords(result.mergedRecords);

  assert.deepEqual(
    data.nextActions.map((item) => item.title).sort(),
    ["A", "B", "C"],
  );
  assert.equal(result.remoteUpserts.length, 3);
});

test("Scenario B: Supabase A B C and phone D E merge to A B C D E", () => {
  const remote = recordsFromData({
    nextActions: [action("a", "A"), action("b", "B"), action("c", "C")],
  }).filter((record) => record.collection === "nextActions");
  const phone = recordsFromData({
    nextActions: [action("d", "D"), action("e", "E")],
  }).filter((record) => record.collection === "nextActions");

  const result = mergeRecords(phone, remote);
  const data = dataFromRecords(result.mergedRecords);

  assert.deepEqual(
    data.nextActions.map((item) => item.title).sort(),
    ["A", "B", "C", "D", "E"],
  );
  assert.deepEqual(
    result.remoteUpserts.map((record) => record.id).sort(),
    ["d", "e"],
  );
});

test("Scenario C: newest updated_at wins when the same record changed twice", () => {
  const local = recordsFromData({
    nextActions: [action("a", "A locale", "2026-08-15T11:00:00.000Z")],
  }).filter((record) => record.collection === "nextActions");
  const remote = recordsFromData({
    nextActions: [action("a", "A remoto", "2026-08-15T10:00:00.000Z")],
  }).filter((record) => record.collection === "nextActions");

  const result = mergeRecords(local, remote);
  const data = dataFromRecords(result.mergedRecords);

  assert.equal(data.nextActions[0].title, "A locale");
  assert.equal(result.conflicts.length, 0);
});

test("Scenario C conservative fallback: same timestamp preserves a conflict copy", () => {
  const local = recordsFromData({
    nextActions: [action("a", "A locale")],
  }).filter((record) => record.collection === "nextActions");
  const remote = recordsFromData({
    nextActions: [action("a", "A remoto")],
  }).filter((record) => record.collection === "nextActions");

  const result = mergeRecords(local, remote, {
    idFactory: () => "copy",
    timestamp: "2026-08-15T12:00:00.000Z",
  });
  const data = dataFromRecords(result.mergedRecords);

  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(
    data.nextActions.map((item) => item.title).sort(),
    ["A locale (conflitto conservato)", "A remoto"],
  );
});

test("Scenario D: offline creation becomes an upsert when the queue flushes", () => {
  const previous = recordsFromData({ nextActions: [action("a", "A")] }).filter(
    (record) => record.collection === "nextActions",
  );
  const next = [action("a", "A"), action("b", "B offline")];
  const changes = diffCollectionRecords(
    previous,
    next,
    "nextActions",
    "2026-08-15T13:00:00.000Z",
  );

  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, "b");
  assert.equal(changes[0].deleted_at, null);
});

test("Scenario E: offline delete writes a tombstone and does not reappear", () => {
  const previous = recordsFromData({
    nextActions: [action("a", "A"), action("b", "B")],
  }).filter((record) => record.collection === "nextActions");
  const changes = diffCollectionRecords(
    previous,
    [action("a", "A")],
    "nextActions",
    "2026-08-15T13:00:00.000Z",
  );
  const merged = applyChangedRecords(previous, changes);
  const data = dataFromRecords(merged);

  assert.equal(changes.length, 1);
  assert.equal(changes[0].id, "b");
  assert.equal(changes[0].deleted_at, "2026-08-15T13:00:00.000Z");
  assert.deepEqual(data.nextActions.map((item) => item.title), ["A"]);
});

test("Legacy records without ids receive stable ids before migration upload", () => {
  const normalized = normalizeLegacyData(
    {
      nextActions: [{ title: "No id", createdAt: "2026-08-15T09:00:00.000Z" }],
    },
    "2026-08-15T10:00:00.000Z",
    () => "generated-id",
  );

  assert.equal(normalized.data.nextActions[0].id, "generated-id");
  assert.equal(
    normalized.data.nextActions[0].updatedAt,
    "2026-08-15T09:00:00.000Z",
  );
});

test("Test 1: 20 local legacy records and empty remote keep 20 visible records and queue uploads", () => {
  const localRecords = recordsFromData({
    nextActions: Array.from({ length: 20 }, (_, index) =>
      action(`local-${index}`, `Legacy ${index}`),
    ),
  });
  const result = mergeBootstrapRecords({
    localRecords,
    recoverySource: "legacy",
    remoteRecords: [],
  });
  const data = dataFromRecords(result.mergedRecords);

  assert.equal(data.nextActions.length, 20);
  assert.equal(result.localCount, 20);
  assert.equal(result.remoteCount, 0);
  assert.equal(result.mergedCount, 20);
  assert.equal(result.remoteUpserts.length, localRecords.length);
});

test("Test 2: sign-in/bootstrap with local legacy and empty remote does not zero local state", () => {
  const beforeLoginRecords = recordsFromData({
    inboxItems: [action("inbox-a", "Prima del login")],
    projects: [action("project-a", "Progetto prima del login")],
  });
  const result = mergeBootstrapRecords({
    localRecords: beforeLoginRecords,
    recoverySource: "legacy",
    remoteRecords: [],
  });
  const afterLoginData = dataFromRecords(result.mergedRecords);

  assert.equal(afterLoginData.inboxItems.length, 1);
  assert.equal(afterLoginData.projects.length, 1);
  assert.equal(result.remoteUpserts.length, beforeLoginRecords.length);
});

test("Test 3: empty legacy keys recover from the newest valid legacy backup", () => {
  const storage = makeStorage({
    "kaizen_legacy_backup_2026-08-15T09-00-00-000Z": JSON.stringify({
      createdAt: "2026-08-15T09:00:00.000Z",
      data: {
        nextActions: [action("old", "Old backup")],
      },
    }),
    "kaizen_legacy_backup_2026-08-15T10-00-00-000Z": JSON.stringify({
      createdAt: "2026-08-15T10:00:00.000Z",
      data: {
        nextActions: [],
      },
    }),
    "kaizen_legacy_backup_2026-08-15T11-00-00-000Z": JSON.stringify({
      createdAt: "2026-08-15T11:00:00.000Z",
      data: {
        nextActions: [action("new", "Valid backup")],
      },
    }),
  });

  const recovery = getBestLocalRecoveryData({
    includeRecoverySources: true,
    rawLegacy: { nextActions: [] },
    storage,
  });

  assert.equal(recovery.legacyCount, 0);
  assert.equal(recovery.backupCount, 1);
  assert.equal(recovery.data.nextActions[0].title, "Valid backup");
  assert.equal(recovery.source, "legacyBackup");
});

test("Test 4: empty remote and empty sync cache cannot override full legacy", () => {
  const recovery = getBestLocalRecoveryData({
    rawLegacy: {
      nextActions: [action("legacy-a", "Legacy survives")],
    },
    syncCacheRecords: [],
  });
  const result = mergeBootstrapRecords({
    localRecords: recovery.records,
    recoverySource: recovery.source,
    remoteRecords: [],
  });
  const data = dataFromRecords(result.mergedRecords);

  assert.equal(recovery.legacyCount, 1);
  assert.equal(recovery.syncCacheCount, 0);
  assert.equal(data.nextActions[0].title, "Legacy survives");
});

test("Test 5: refresh after login can recover visible data from sync cache when legacy is empty", () => {
  const cachedRecords = recordsFromData({
    nextActions: [action("cached-a", "Cached after login")],
  });
  const recovery = getBestLocalRecoveryData({
    rawLegacy: { nextActions: [] },
    syncCacheRecords: cachedRecords,
  });
  const data = dataFromRecords(recovery.records);

  assert.equal(recovery.legacyCount, 0);
  assert.equal(recovery.syncCacheCount, 1);
  assert.equal(data.nextActions[0].title, "Cached after login");
});

test("Test 6: partial migration failure is rejected when local data would become empty", () => {
  assert.throws(
    () => validateMigrationResult(1, 0),
    /Migrazione bloccata/,
  );
  assert.doesNotThrow(() => validateMigrationResult(1, 1));
  assert.doesNotThrow(() => validateMigrationResult(0, 0));
});

test("Multi-device A: PC local A B C with empty remote uploads exactly A B C", () => {
  const pcRecords = recordsFromData({
    nextActions: [action("a", "A"), action("b", "B"), action("c", "C")],
  });
  const result = mergeBootstrapRecords({
    localRecords: pcRecords,
    recoverySource: "legacy",
    remoteRecords: [],
  });

  assert.equal(result.localCount, 3);
  assert.equal(result.remoteCount, 0);
  assert.equal(countRecords(result.remoteUpserts), 3);
  assert.deepEqual(
    dataFromRecords(result.mergedRecords).nextActions.map((item) => item.title).sort(),
    ["A", "B", "C"],
  );
});

test("Multi-device B: phone local D E F contributes after PC already synced A B C", () => {
  const pcRemote = recordsFromData({
    nextActions: [action("a", "A"), action("b", "B"), action("c", "C")],
  });
  const phoneLocal = recordsFromData({
    nextActions: [action("d", "D"), action("e", "E"), action("f", "F")],
  });
  const result = mergeBootstrapRecords({
    localRecords: phoneLocal,
    recoverySource: "legacy",
    remoteRecords: pcRemote,
  });

  assert.deepEqual(
    dataFromRecords(result.mergedRecords).nextActions.map((item) => item.title).sort(),
    ["A", "B", "C", "D", "E", "F"],
  );
  assert.deepEqual(
    result.remoteUpserts.map((record) => record.id).sort(),
    ["d", "e", "f"],
  );
});

test("Multi-device C: phone conflict with same id keeps a recoverable conflict copy", () => {
  const remote = recordsFromData({
    nextActions: [action("same", "PC version")],
  });
  const phone = recordsFromData({
    nextActions: [action("same", "Phone version")],
  });
  const result = mergeBootstrapRecords({
    idFactory: () => "phone-copy",
    localRecords: phone,
    recoverySource: "legacy",
    remoteRecords: remote,
    timestamp: "2026-08-15T12:00:00.000Z",
  });
  const titles = dataFromRecords(result.mergedRecords)
    .nextActions.map((item) => item.title)
    .sort();

  assert.equal(result.conflicts.length, 1);
  assert.deepEqual(titles, ["PC version", "Phone version (conflitto conservato)"]);
});

test("Multi-device D: account migration completed by PC does not suppress phone local import", () => {
  const storage = makeStorage({
    "kaizen:v1:sync:meta": JSON.stringify({
      migrationCompletedAt: "2026-08-15T11:00:00.000Z",
      deviceMigrations: {
        pc: {
          deviceId: "pc",
          deviceMigrationCompletedAt: "2026-08-15T11:00:00.000Z",
        },
      },
    }),
  });
  const recovery = getBestLocalRecoveryData({
    rawLegacy: {
      nextActions: [action("phone-only", "Phone local")],
    },
    storage,
  });
  const result = mergeBootstrapRecords({
    localRecords: recovery.records,
    recoverySource: recovery.source,
    remoteRecords: recordsFromData({
      nextActions: [action("pc-only", "PC remote")],
    }),
  });

  assert.equal(recovery.legacyCount, 1);
  assert.deepEqual(
    dataFromRecords(result.mergedRecords).nextActions.map((item) => item.title).sort(),
    ["PC remote", "Phone local"],
  );
  assert.equal(result.remoteUpserts.length, 1);
});

test("Multi-device E: remote full and local full always merge instead of replacing", () => {
  const remote = recordsFromData({
    nextActions: [action("remote-a", "Remote A"), action("remote-b", "Remote B")],
  });
  const local = recordsFromData({
    nextActions: [action("local-a", "Local A"), action("local-b", "Local B")],
  });
  const result = mergeBootstrapRecords({
    localRecords: local,
    recoverySource: "legacy",
    remoteRecords: remote,
  });

  assert.equal(countRecords(result.mergedRecords), 4);
  assert.deepEqual(
    dataFromRecords(result.mergedRecords).nextActions.map((item) => item.title).sort(),
    ["Local A", "Local B", "Remote A", "Remote B"],
  );
});

test("Multi-device F: offline records are queued once and remain retry-safe", () => {
  const offlineRecords = recordsFromData({
    nextActions: [action("offline-a", "Offline A"), action("offline-b", "Offline B")],
  }).filter((record) => record.collection === "nextActions");
  const queue = queueFromRecords(offlineRecords, "2026-08-15T13:00:00.000Z");
  const pendingRecords = queue.map((item) => item.record);
  const result = mergeRecords(pendingRecords, []);

  assert.equal(queue.length, 2);
  assert.equal(countRecords(result.remoteUpserts), 2);
  assert.deepEqual(
    result.remoteUpserts.map((record) => record.id).sort(),
    ["offline-a", "offline-b"],
  );
});

test("Multi-device G: reload after sync can hydrate from cache before remote fetch", () => {
  const cachedRecords = recordsFromData({
    nextActions: [action("cached-reload", "Reload visible")],
  });
  const recovery = getBestLocalRecoveryData({
    rawLegacy: { nextActions: [] },
    syncCacheRecords: cachedRecords,
  });

  assert.equal(recovery.syncCacheCount, 1);
  assert.equal(dataFromRecords(recovery.records).nextActions[0].title, "Reload visible");
});

test("Device snapshot is persistent and usable as recovery when current legacy is empty", () => {
  const storage = makeStorage({
    "kaizen:v1:gtd:nextActions": JSON.stringify([action("snap-a", "Snapshot A")]),
  });
  const deviceId = getOrCreateDeviceId(storage);
  const snapshotKey = createDeviceSnapshot({
    deviceId,
    storage,
    timestamp: "2026-08-15T14:00:00.000Z",
  });
  storage.setItem("kaizen:v1:gtd:nextActions", JSON.stringify([]));

  const snapshots = readDeviceSnapshots(storage);
  const recovery = getBestLocalRecoveryData({
    includeRecoverySources: true,
    rawLegacy: { nextActions: [] },
    storage,
    syncCacheRecords: [],
  });

  assert.equal(snapshotKey, "kaizen_device_snapshot_2026-08-15T14-00-00-000Z");
  assert.equal(snapshots.length, 1);
  assert.equal(recovery.snapshotCount, 1);
  assert.equal(recovery.source, "deviceSnapshot");
  assert.equal(recovery.data.nextActions[0].title, "Snapshot A");
});

test("Idempotence: 24 local records stay 24 across 10 bootstraps with backup snapshot cache and remote", () => {
  const localData = {
    nextActions: Array.from({ length: 24 }, (_, index) =>
      action(`id-${index}`, `Item ${index}`),
    ),
  };
  const localRecords = recordsFromData(localData);
  const storage = makeStorage({
    "kaizen:v1:gtd:nextActions": JSON.stringify(localData.nextActions),
    "kaizen:v1:sync:cache": JSON.stringify({ records: localRecords }),
    "kaizen_legacy_backup_2026-08-15T09-00-00-000Z": JSON.stringify({
      createdAt: "2026-08-15T09:00:00.000Z",
      data: localData,
    }),
    "kaizen_device_snapshot_2026-08-15T09-00-00-000Z": JSON.stringify({
      createdAt: "2026-08-15T09:00:00.000Z",
      data: localData,
      deviceId: "pc",
      keys: {},
    }),
  });

  let remoteRecords = [];

  for (let iteration = 0; iteration < 10; iteration += 1) {
    const recovery = getBestLocalRecoveryData({
      rawLegacy: localData,
      storage,
      syncCacheRecords: localRecords,
    });
    const merged = mergeBootstrapRecords({
      localRecords: recovery.records,
      recoverySource: recovery.source,
      remoteRecords,
    });

    assert.equal(recovery.source, "legacy");
    assert.equal(merged.mergedCount, 24);
    assert.equal(countRecords(merged.mergedRecords), 24);
    remoteRecords = merged.mergedRecords;
  }

  assert.equal(countRecords(remoteRecords), 24);
});

test("Idempotence: legacy-free reload uses cache once and does not add backup or snapshot copies", () => {
  const cachedRecords = recordsFromData({
    nextActions: Array.from({ length: 24 }, (_, index) =>
      action(`cached-${index}`, `Cached ${index}`),
    ),
  });
  const backupData = {
    nextActions: Array.from({ length: 24 }, (_, index) =>
      action(`backup-${index}`, `Backup ${index}`),
    ),
  };
  const storage = makeStorage({
    "kaizen:v1:gtd:nextActions": JSON.stringify([]),
    "kaizen:v1:sync:cache": JSON.stringify({ records: cachedRecords }),
    "kaizen_legacy_backup_2026-08-15T09-00-00-000Z": JSON.stringify({
      createdAt: "2026-08-15T09:00:00.000Z",
      data: backupData,
    }),
    "kaizen_device_snapshot_2026-08-15T09-00-00-000Z": JSON.stringify({
      createdAt: "2026-08-15T09:00:00.000Z",
      data: backupData,
      deviceId: "pc",
      keys: {},
    }),
  });
  const recovery = getBestLocalRecoveryData({
    rawLegacy: { nextActions: [] },
    storage,
    syncCacheRecords: cachedRecords,
  });
  const merged = mergeBootstrapRecords({
    localRecords: recovery.records,
    recoverySource: recovery.source,
    remoteRecords: cachedRecords,
  });

  assert.equal(recovery.source, "syncCache");
  assert.equal(merged.mergedCount, 24);
  assert.equal(countRecords(merged.mergedRecords), 24);
});

test("Multi-device idempotence: PC and phone reopens do not duplicate merged account data", () => {
  const pc = recordsFromData({
    nextActions: [action("a", "A"), action("b", "B"), action("c", "C")],
  });
  let remote = mergeBootstrapRecords({
    localRecords: pc,
    recoverySource: "legacy",
    remoteRecords: [],
  }).mergedRecords;

  for (let iteration = 0; iteration < 5; iteration += 1) {
    const reopenedPc = mergeBootstrapRecords({
      localRecords: pc,
      recoverySource: "legacy",
      remoteRecords: remote,
    });
    assert.equal(reopenedPc.mergedCount, 3);
    remote = reopenedPc.mergedRecords;
  }

  const phone = recordsFromData({
    nextActions: [action("d", "D"), action("e", "E")],
  });
  remote = mergeBootstrapRecords({
    localRecords: phone,
    recoverySource: "legacy",
    remoteRecords: remote,
  }).mergedRecords;

  assert.deepEqual(
    dataFromRecords(remote).nextActions.map((item) => item.title).sort(),
    ["A", "B", "C", "D", "E"],
  );

  const pcAfterPhone = mergeBootstrapRecords({
    localRecords: remote,
    recoverySource: "legacy",
    remoteRecords: remote,
  });
  const phoneAfterPhone = mergeBootstrapRecords({
    localRecords: remote,
    recoverySource: "legacy",
    remoteRecords: remote,
  });

  assert.equal(pcAfterPhone.mergedCount, 5);
  assert.equal(phoneAfterPhone.mergedCount, 5);
});

test("Legacy records without ids get deterministic ids across repeated normalization", () => {
  const legacy = {
    nextActions: [
      {
        title: "No id stable",
        createdAt: "2026-08-15T09:00:00.000Z",
      },
    ],
  };
  const first = normalizeLegacyData(legacy);
  const second = normalizeLegacyData(legacy);

  assert.equal(first.data.nextActions[0].id, second.data.nextActions[0].id);
  assert.match(first.data.nextActions[0].id, /^legacy-nextActions-/);
});

test("Conflict copies are deterministic and do not multiply on repeated bootstrap", () => {
  const local = recordsFromData({
    nextActions: [action("same", "Local")],
  });
  const remote = recordsFromData({
    nextActions: [action("same", "Remote")],
  });
  const first = mergeBootstrapRecords({
    localRecords: local,
    recoverySource: "legacy",
    remoteRecords: remote,
  });
  const second = mergeBootstrapRecords({
    localRecords: local,
    recoverySource: "legacy",
    remoteRecords: first.mergedRecords,
  });

  assert.equal(first.conflicts.length, 1);
  assert.equal(second.conflicts.length, 1);
  assert.equal(countRecords(first.mergedRecords), 2);
  assert.equal(countRecords(second.mergedRecords), 2);
  assert.equal(
    first.conflicts[0].preservedAs,
    second.conflicts[0].preservedAs,
  );
});

test("Sync queue deduplicates repeated pending records by collection and id", () => {
  const records = recordsFromData({
    nextActions: [action("offline-a", "Offline A")],
  }).filter((record) => record.collection === "nextActions");
  const firstQueue = mergeQueuedRecords([], records);
  const secondQueue = mergeQueuedRecords(firstQueue, records);

  assert.equal(firstQueue.length, 1);
  assert.equal(secondQueue.length, 1);
});

test("Supabase-first bootstrap treats remote as authoritative and never uploads cache", () => {
  const remote = recordsFromData({
    nextActions: [action("remote-a", "Remote A")],
  });
  const cache = recordsFromData({
    nextActions: [action("cache-a", "Cache A")],
  });
  const plan = planSupabaseFirstBootstrap({
    cacheRecords: cache,
    remoteRecords: remote,
  });

  assert.equal(plan.shouldUploadLocal, false);
  assert.equal(plan.requiresExplicitImport, false);
  assert.equal(plan.localImportIgnored, true);
  assert.equal(countRecords(plan.authoritativeRecords), 1);
  assert.equal(dataFromRecords(plan.authoritativeRecords).nextActions[0].title, "Remote A");
});

test("Sync queue stores operations and deduplicates upsert/delete by record", () => {
  const created = recordsFromData({
    nextActions: [action("queued-a", "Queued A")],
  }).find((record) => record.collection === "nextActions");
  const deleted = {
    ...created,
    deleted_at: "2026-08-15T15:00:00.000Z",
    updated_at: "2026-08-15T15:00:00.000Z",
  };
  const queue = mergeQueuedRecords(
    operationsFromRecords([created]),
    [deleted],
    "2026-08-15T15:00:00.000Z",
  );
  const normalized = normalizeSyncQueue(queue);

  assert.equal(normalized.length, 1);
  assert.equal(normalized[0].type, "delete");
  assert.equal(normalized[0].collection, "nextActions");
  assert.equal(normalized[0].recordId, "queued-a");
});

test("Sync queue keeps a project action added while the project upsert is in flight", async () => {
  const projectRecord = recordsFromData({
    projects: [project("project-a", "Project A")],
  }).find((record) => record.collection === "projects");
  const actionRecord = recordsFromData({
    projectActions: [projectAction("action-a", "project-a", "Action A")],
  }).find((record) => record.collection === "projectActions");
  let queue = mergeQueuedRecords([], [projectRecord], "2026-08-15T10:00:00.000Z");
  const sent = [];

  const result = await flushQueuedOperations({
    getQueue: () => queue,
    setQueue: (nextQueue) => {
      queue = normalizeSyncQueue(nextQueue);
    },
    sendBatch: async (batch) => {
      sent.push(batch.map((item) => item.record.collection));

      if (sent.length === 1) {
        queue = mergeQueuedRecords(
          queue,
          [actionRecord],
          "2026-08-15T10:00:01.000Z",
        );
      }
    },
  });

  assert.equal(result.ok, true);
  assert.equal(queue.length, 0);
  assert.deepEqual(sent, [["projects"], ["projectActions"]]);
});

test("Sync queue sends a second operation queued during an active flush", async () => {
  const firstRecord = recordsFromData({
    nextActions: [action("first", "First")],
  }).find((record) => record.collection === "nextActions");
  const secondRecord = recordsFromData({
    waitingFor: [action("second", "Second")],
  }).find((record) => record.collection === "waitingFor");
  let queue = mergeQueuedRecords([], [firstRecord], "2026-08-15T10:00:00.000Z");
  const sentIds = [];

  const result = await flushQueuedOperations({
    getQueue: () => queue,
    setQueue: (nextQueue) => {
      queue = normalizeSyncQueue(nextQueue);
    },
    sendBatch: async (batch) => {
      sentIds.push(...batch.map((item) => item.record.id));

      if (sentIds.length === 1) {
        queue = mergeQueuedRecords(
          queue,
          [secondRecord],
          "2026-08-15T10:00:01.000Z",
        );
      }
    },
  });

  assert.equal(result.ok, true);
  assert.equal(queue.length, 0);
  assert.deepEqual(sentIds, ["first", "second"]);
});

test("Sync queue does not remove a newer operation for the same record when an older batch finishes", async () => {
  const olderRecord = recordsFromData({
    nextActions: [action("same", "Older title", "2026-08-15T10:00:00.000Z")],
  }).find((record) => record.collection === "nextActions");
  const newerRecord = recordsFromData({
    nextActions: [action("same", "Newer title", "2026-08-15T10:00:02.000Z")],
  }).find((record) => record.collection === "nextActions");
  let queue = mergeQueuedRecords([], [olderRecord], "2026-08-15T10:00:00.000Z");
  const sentTitles = [];

  const result = await flushQueuedOperations({
    getQueue: () => queue,
    setQueue: (nextQueue) => {
      queue = normalizeSyncQueue(nextQueue);
    },
    sendBatch: async (batch) => {
      sentTitles.push(...batch.map((item) => item.record.data.title));

      if (sentTitles.length === 1) {
        queue = mergeQueuedRecords(
          queue,
          [newerRecord],
          "2026-08-15T10:00:01.000Z",
        );
      }
    },
  });

  assert.equal(result.ok, true);
  assert.equal(queue.length, 0);
  assert.deepEqual(sentTitles, ["Older title", "Newer title"]);
});

test("Sync queue preserves pending operations when the remote flush fails", async () => {
  const pendingRecord = recordsFromData({
    nextActions: [action("pending", "Pending")],
  }).find((record) => record.collection === "nextActions");
  let queue = mergeQueuedRecords([], [pendingRecord], "2026-08-15T10:00:00.000Z");
  const originalOperationId = queue[0].id;

  const result = await flushQueuedOperations({
    getQueue: () => queue,
    setQueue: (nextQueue) => {
      queue = normalizeSyncQueue(nextQueue);
    },
    sendBatch: async () => {
      throw new Error("Supabase unavailable");
    },
  });

  assert.equal(result.ok, false);
  assert.match(result.error.message, /Supabase unavailable/);
  assert.equal(queue.length, 1);
  assert.equal(queue[0].id, originalOperationId);
  assert.equal(queue[0].record.id, "pending");
});

test("Sync queue removes only flushed operation ids, not later replacements for the same record", () => {
  const olderRecord = recordsFromData({
    nextActions: [action("same", "Older title", "2026-08-15T10:00:00.000Z")],
  }).find((record) => record.collection === "nextActions");
  const newerRecord = recordsFromData({
    nextActions: [action("same", "Newer title", "2026-08-15T10:00:01.000Z")],
  }).find((record) => record.collection === "nextActions");
  let queue = mergeQueuedRecords([], [olderRecord], "2026-08-15T10:00:00.000Z");
  const flushedBatch = normalizeSyncQueue(queue);
  queue = mergeQueuedRecords(queue, [newerRecord], "2026-08-15T10:00:01.000Z");

  const remaining = removeFlushedOperations(queue, flushedBatch);

  assert.equal(remaining.length, 1);
  assert.equal(remaining[0].record.data.title, "Newer title");
});

test("Duplicate analysis is read-only and estimates duplicate groups", () => {
  const records = recordsFromData({
    nextActions: [
      action("dup-a", "Same content"),
      action("dup-b", "Same content"),
      action("unique", "Unique"),
    ],
  }).filter((record) => record.collection === "nextActions");
  const analysis = analyzeDuplicateRecords(records);

  assert.equal(analysis.totalCount, 3);
  assert.equal(analysis.uniqueCount, 2);
  assert.equal(analysis.duplicateCount, 1);
});

test("Duplicate removal plan is safe and only returns candidates", () => {
  const records = recordsFromData({
    nextActions: [
      action("dup-a", "Same content"),
      action("dup-b", "Same content"),
      action("unique", "Unique"),
    ],
  }).filter((record) => record.collection === "nextActions");
  const plan = createDuplicateRemovalPlan(records);

  assert.equal(plan.backupRequired, true);
  assert.equal(plan.removeCandidates.length, 1);
  assert.equal(plan.totalCount, 3);
});

test("Source fingerprint is stable for the same normalized local source", () => {
  const records = recordsFromData({
    nextActions: [action("a", "A"), action("b", "B")],
  });

  assert.equal(fingerprintRecords(records), fingerprintRecords(recordsFromData(dataFromRecords(records))));
});

test("Reset A: remote dirty rows are planned for one user only", () => {
  const plan = createRemoteUserResetPlan({
    userId: "user-target",
    recordRows: [
      { user_id: "user-target", collection: "nextActions", id: "dirty-1" },
      { user_id: "user-target", collection: "nextActions", id: "dirty-2" },
      { user_id: "other-user", collection: "nextActions", id: "keep" },
    ],
    syncStateRows: [
      { user_id: "user-target", id: "state-target" },
      { user_id: "other-user", id: "state-other" },
    ],
  });

  assert.equal(plan.deleteCounts.kaizen_records, 2);
  assert.equal(plan.deleteCounts.kaizen_sync_state, 1);
  assert.equal(plan.remainingRecords.length, 1);
  assert.equal(plan.remainingSyncState.length, 1);
});

test("Reset B: PC local dirty data cannot repopulate empty remote when local import is disabled", () => {
  const pcLocal = recordsFromData({
    nextActions: Array.from({ length: 162 }, (_, index) =>
      action(`pc-${index}`, `PC dirty ${index}`),
    ),
  });
  const plan = planBootstrapSync({
    ignoreLocalForCloudImport: true,
    localRecords: pcLocal,
    recoverySource: "legacy",
    remoteRecords: [],
  });

  assert.equal(plan.localImportIgnored, true);
  assert.equal(plan.shouldUploadLocal, false);
  assert.equal(countRecords([]), 0);
});

test("Reset C: explicit phone import uploads exactly the unique phone dataset into empty remote", () => {
  const phoneLocal = recordsFromData({
    nextActions: Array.from({ length: 50 }, (_, index) =>
      action(`phone-${index}`, `Phone ${index}`),
    ),
  });
  const imported = mergeBootstrapRecords({
    localRecords: phoneLocal,
    recoverySource: "legacy",
    remoteRecords: [],
  });

  assert.equal(imported.mergedCount, 50);
  assert.equal(countRecords(imported.remoteUpserts), 50);
});

test("Reset D: phone reopening five times after explicit import keeps remote at 50", () => {
  const phoneLocal = recordsFromData({
    nextActions: Array.from({ length: 50 }, (_, index) =>
      action(`phone-${index}`, `Phone ${index}`),
    ),
  });
  let remote = mergeBootstrapRecords({
    localRecords: phoneLocal,
    recoverySource: "legacy",
    remoteRecords: [],
  }).mergedRecords;

  for (let index = 0; index < 5; index += 1) {
    const plan = planBootstrapSync({
      localRecords: phoneLocal,
      recoverySource: "legacy",
      remoteRecords: remote,
    });
    remote = plan.mergedRecords;
    assert.equal(countRecords(remote), 50);
    assert.equal(plan.shouldUploadLocal, false);
  }
});

test("Reset E: replacing dirty PC local with account makes PC 50 and remote remains 50", () => {
  const remote = recordsFromData({
    nextActions: Array.from({ length: 50 }, (_, index) =>
      action(`phone-${index}`, `Phone ${index}`),
    ),
  });
  const pcDirty = recordsFromData({
    nextActions: Array.from({ length: 162 }, (_, index) =>
      action(`pc-${index}`, `PC dirty ${index}`),
    ),
  });
  const replacedPcData = dataFromRecords(remote);

  assert.equal(countRecords(pcDirty), 162);
  assert.equal(replacedPcData.nextActions.length, 50);
  assert.equal(countRecords(remote), 50);
});

test("Quota A: snapshot quota failure is non-fatal", () => {
  const storage = makeQuotaStorage(
    {
      "kaizen:v1:gtd:nextActions": JSON.stringify([action("a", "A")]),
    },
    { alwaysThrow: true },
  );

  assert.doesNotThrow(() =>
    createDeviceSnapshot({
      deviceId: "pc",
      storage,
      timestamp: "2026-08-16T11:15:13.246Z",
    }),
  );
  assert.equal(
    createDeviceSnapshot({
      deviceId: "pc",
      storage,
      timestamp: "2026-08-16T11:15:14.246Z",
    }),
    "",
  );
});

test("Quota B: 10 normal bootstraps do not create device snapshots", () => {
  const storage = makeStorage({
    "kaizen:v1:gtd:nextActions": JSON.stringify([action("a", "A")]),
  });

  for (let index = 0; index < 10; index += 1) {
    const recovery = getBestLocalRecoveryData({
      rawLegacy: {
        nextActions: [action("a", "A")],
      },
      storage,
    });
    planBootstrapSync({
      localRecords: recovery.records,
      recoverySource: recovery.source,
      remoteRecords: [],
    });
  }

  assert.equal(readDeviceSnapshots(storage).length, 0);
});

test("Quota C: snapshot stores dataset only and does not contain nested snapshots", () => {
  const storage = makeStorage({
    "kaizen:v1:gtd:nextActions": JSON.stringify([action("a", "A")]),
    "kaizen:v1:sync:cache": JSON.stringify({
      records: recordsFromData({ nextActions: [action("cache", "Cache")] }),
    }),
    "kaizen_device_snapshot_old": JSON.stringify({
      createdAt: "2026-08-16T10:00:00.000Z",
      data: { nextActions: [action("old", "Old")] },
      deviceId: "pc",
    }),
  });
  const key = createDeviceSnapshot({
    deviceId: "pc",
    storage,
    timestamp: "2026-08-16T11:00:00.000Z",
  });
  const snapshot = JSON.parse(storage.getItem(key));

  assert.equal(Object.hasOwn(snapshot, "keys"), false);
  assert.equal(JSON.stringify(snapshot).includes("kaizen_device_snapshot_"), false);
  assert.equal(JSON.stringify(snapshot).includes("sync:cache"), false);
  assert.equal(snapshot.data.nextActions.length, 1);
});

test("Quota D: snapshot retention removes only oldest device snapshots", () => {
  const storage = makeStorage({
    "kaizen:v1:gtd:nextActions": JSON.stringify([action("a", "A")]),
    "kaizen_legacy_backup_keep": JSON.stringify({
      createdAt: "2026-08-16T09:00:00.000Z",
      data: { nextActions: [action("backup", "Backup")] },
    }),
    ...Object.fromEntries(
      Array.from({ length: 5 }, (_, index) => [
        `kaizen_device_snapshot_2026-08-16T10-0${index}-00-000Z`,
        JSON.stringify({
          createdAt: `2026-08-16T10:0${index}:00.000Z`,
          data: { nextActions: [action(`snap-${index}`, `Snap ${index}`)] },
          deviceId: "pc",
        }),
      ]),
    ),
  });

  createDeviceSnapshot({
    deviceId: "pc",
    storage,
    timestamp: "2026-08-16T11:00:00.000Z",
  });

  assert.equal(readDeviceSnapshots(storage).length, 5);
  assert.ok(storage.getItem("kaizen_legacy_backup_keep"));
  assert.equal(storage.getItem("kaizen_device_snapshot_2026-08-16T10-00-00-000Z"), null);
});

test("Quota E: local dirty storage can be replaced with remote data without changing remote", () => {
  const remote = recordsFromData({
    nextActions: Array.from({ length: 50 }, (_, index) =>
      action(`phone-${index}`, `Phone ${index}`),
    ),
  });
  const storage = makeStorage({
    "kaizen:v1:gtd:nextActions": JSON.stringify(
      Array.from({ length: 162 }, (_, index) => action(`pc-${index}`, `PC ${index}`)),
    ),
    "kaizen:v1:sync:cache": JSON.stringify({ records: [] }),
    "kaizen_device_snapshot_old": JSON.stringify({
      createdAt: "2026-08-16T10:00:00.000Z",
      data: { nextActions: [action("old", "Old")] },
      deviceId: "pc",
    }),
    "kaizen:v1:supabase:auth": JSON.stringify({ token: "keep" }),
  });

  clearLocalKaizenDataForAccount(storage);
  storage.setItem(
    "kaizen:v1:gtd:nextActions",
    JSON.stringify(dataFromRecords(remote).nextActions),
  );

  assert.equal(JSON.parse(storage.getItem("kaizen:v1:gtd:nextActions")).length, 50);
  assert.equal(storage.getItem("kaizen_device_snapshot_old"), null);
  assert.ok(storage.getItem("kaizen:v1:supabase:auth"));
  assert.equal(countRecords(remote), 50);
});

test("Quota F: quota exceeded during pre-replace snapshot still allows replace", () => {
  const remote = recordsFromData({
    nextActions: [action("phone", "Phone")],
  });
  const storage = makeQuotaStorage(
    {
      "kaizen:v1:gtd:nextActions": JSON.stringify([action("pc", "PC")]),
    },
    { alwaysThrow: true },
  );
  const snapshotKey = createDeviceSnapshot({
    deviceId: "pc",
    reason: "pre-replace-from-account",
    storage,
    timestamp: "2026-08-16T11:00:00.000Z",
  });

  clearLocalKaizenDataForAccount(storage);
  storage.setItem(
    "kaizen:v1:gtd:nextActions",
    JSON.stringify(dataFromRecords(remote).nextActions),
  );

  assert.equal(snapshotKey, "");
  assert.equal(JSON.parse(storage.getItem("kaizen:v1:gtd:nextActions"))[0].title, "Phone");
});
