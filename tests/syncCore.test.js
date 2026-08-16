import assert from "node:assert/strict";
import test from "node:test";
import {
  applyChangedRecords,
  countRecords,
  createDeviceSnapshot,
  dataFromRecords,
  diffCollectionRecords,
  getBestLocalRecoveryData,
  getOrCreateDeviceId,
  mergeBootstrapRecords,
  mergeRecords,
  normalizeLegacyData,
  queueFromRecords,
  readDeviceSnapshots,
  recordsFromData,
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
    setItem(key, value) {
      map.set(key, value);
    },
  };
}

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
