import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import {
  mkdirSync,
  mkdtempSync,
  rmSync,
  unlinkSync,
  writeFileSync
} from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

import {
  findAuthoringProtocolSnapshotHistoryViolations,
  verifyAuthoringProtocolSnapshotHistory
} from "../../scripts/verifyAuthoringProtocolSnapshotHistory.mjs";

const git = (repositoryRoot, args) => {
  const result = spawnSync("git", args, { cwd: repositoryRoot, encoding: "utf8" });
  assert.equal(result.status, 0, result.stderr || result.stdout);
  return result.stdout.trim();
};

test("comparação histórica bloqueia alteração e exclusão, mas permite snapshot novo", () => {
  const approvedSnapshots = [{ path: "v1.0.0.snapshot.json", blobHash: "original" }];
  assert.deepEqual(findAuthoringProtocolSnapshotHistoryViolations({
    approvedSnapshots,
    worktreeSnapshots: [
      { path: "v1.0.0.snapshot.json", blobHash: "alterado" },
      { path: "v1.1.0.snapshot.json", blobHash: "novo" }
    ]
  }), [{ path: "v1.0.0.snapshot.json", kind: "modified" }]);
  assert.deepEqual(findAuthoringProtocolSnapshotHistoryViolations({
    approvedSnapshots,
    worktreeSnapshots: []
  }), [{ path: "v1.0.0.snapshot.json", kind: "removed" }]);
});

test("gate Git preserva snapshots v1 da base explícita e permite o primeiro snapshot novo", (t) => {
  const repositoryRoot = mkdtempSync(path.join(os.tmpdir(), "aralearn-contract-history-"));
  t.after(() => rmSync(repositoryRoot, { recursive: true, force: true }));
  git(repositoryRoot, ["init", "--initial-branch=main"]);
  git(repositoryRoot, ["config", "user.name", "AraLearn Tests"]);
  git(repositoryRoot, ["config", "user.email", "tests@aralearn.invalid"]);

  const snapshotDirectory = path.join(repositoryRoot, "tests", "fixtures", "authoring-protocol");
  const approvedPath = path.join(snapshotDirectory, "v1.0.0.snapshot.json");
  mkdirSync(snapshotDirectory, { recursive: true });
  writeFileSync(approvedPath, `${JSON.stringify({
    protocolId: "aralearn.authoring-protocol.v1",
    schemaVersion: "1.0.0"
  })}\n`, "utf8");
  git(repositoryRoot, ["add", "."]);
  git(repositoryRoot, ["commit", "-m", "approve v1 snapshot"]);
  const baseRef = git(repositoryRoot, ["rev-parse", "HEAD"]);

  assert.equal(verifyAuthoringProtocolSnapshotHistory({
    repositoryRoot,
    baseRef
  }).approvedSnapshotCount, 1);

  const newPath = path.join(snapshotDirectory, "v1.1.0.snapshot.json");
  writeFileSync(newPath, `${JSON.stringify({
    protocolId: "aralearn.authoring-protocol.v1",
    schemaVersion: "1.1.0"
  })}\n`, "utf8");
  assert.doesNotThrow(() => verifyAuthoringProtocolSnapshotHistory({ repositoryRoot, baseRef }));

  writeFileSync(approvedPath, "{}\n", "utf8");
  assert.throws(
    () => verifyAuthoringProtocolSnapshotHistory({ repositoryRoot, baseRef }),
    /v1\.0\.0\.snapshot\.json: alterado/u
  );

  git(repositoryRoot, ["checkout", "--", "tests/fixtures/authoring-protocol/v1.0.0.snapshot.json"]);
  unlinkSync(approvedPath);
  assert.throws(
    () => verifyAuthoringProtocolSnapshotHistory({ repositoryRoot, baseRef }),
    /v1\.0\.0\.snapshot\.json: removido/u
  );
});
