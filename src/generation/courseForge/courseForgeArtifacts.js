function memoryStorage() {
  const map = new Map();
  return {
    getItem(key) {
      return map.has(key) ? map.get(key) : null;
    },
    setItem(key, value) {
      map.set(key, value);
    }
  };
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readEnvelope(storage, storageKey) {
  const raw = storage.getItem(storageKey);
  if (!raw) {
    return { runs: {} };
  }
  return JSON.parse(raw);
}

function writeEnvelope(storage, storageKey, envelope) {
  storage.setItem(storageKey, JSON.stringify(envelope));
}

export function createCourseForgeArtifactsStore({ storage = memoryStorage(), storageKey = "courseforge-runs" } = {}) {
  return {
    saveRun(runId, payload = {}) {
      const envelope = readEnvelope(storage, storageKey);
      envelope.runs[runId] = {
        ...(envelope.runs[runId] || { artifacts: {} }),
        ...structuredClone(payload)
      };
      writeEnvelope(storage, storageKey, envelope);
      return structuredClone(envelope.runs[runId]);
    },
    loadRun(runId) {
      const envelope = readEnvelope(storage, storageKey);
      return envelope.runs[runId] ? structuredClone(envelope.runs[runId]) : null;
    },
    saveArtifact(runId, artifactName, content, metadata = {}) {
      const envelope = readEnvelope(storage, storageKey);
      const record = envelope.runs[runId] || { artifacts: {} };
      record.artifacts ||= {};
      record.artifacts[artifactName] = {
        id: `${runId}:${text(artifactName) || "artifact"}`,
        name: artifactName,
        metadata: structuredClone(metadata),
        content: structuredClone(content)
      };
      envelope.runs[runId] = record;
      writeEnvelope(storage, storageKey, envelope);
      return structuredClone(record.artifacts[artifactName]);
    },
    loadArtifact(runId, artifactName) {
      const envelope = readEnvelope(storage, storageKey);
      const artifact = envelope.runs[runId]?.artifacts?.[artifactName];
      return artifact ? structuredClone(artifact) : null;
    },
    listArtifacts(runId) {
      const envelope = readEnvelope(storage, storageKey);
      return Object.values(envelope.runs[runId]?.artifacts || {}).map((item) => structuredClone(item));
    },
    exportData() {
      return readEnvelope(storage, storageKey);
    }
  };
}
