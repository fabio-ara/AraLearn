import { spawnSync } from "node:child_process";
import { existsSync, lstatSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const AUTHORING_PROTOCOL_V1_ID = "aralearn.authoring-protocol.v1";
export const AUTHORING_PROTOCOL_SNAPSHOT_DIRECTORY = "tests/fixtures/authoring-protocol";

const SNAPSHOT_FILE_PATTERN = /^v\d+\.\d+\.\d+\.snapshot\.json$/u;

const runGit = (repositoryRoot, args, { allowFailure = false } = {}) => {
  const result = spawnSync("git", args, {
    cwd: repositoryRoot,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0 && !allowFailure) {
    throw new Error(
      `Git falhou ao executar ${args[0]}: ${(result.stderr || result.stdout).trim()}`
    );
  }
  return result;
};

const resolveCommit = (repositoryRoot, reference) => {
  const result = runGit(
    repositoryRoot,
    ["rev-parse", "--verify", `${reference}^{commit}`],
    { allowFailure: true }
  );
  return result.status === 0 ? result.stdout.trim() : null;
};

const mergeBase = (repositoryRoot, left, right) => {
  const result = runGit(repositoryRoot, ["merge-base", left, right], { allowFailure: true });
  return result.status === 0 ? result.stdout.trim() : null;
};

export const resolveAuthoringProtocolSnapshotBase = ({
  repositoryRoot,
  baseRef,
  environment = process.env
}) => {
  const explicitReference = baseRef || environment.ARALEARN_AUTHORING_PROTOCOL_BASE_REF?.trim();
  if (explicitReference) {
    const commit = resolveCommit(repositoryRoot, explicitReference);
    if (!commit) {
      throw new Error(`A base Git explícita não existe: ${explicitReference}`);
    }
    return { commit, source: explicitReference, explicit: true };
  }

  const head = resolveCommit(repositoryRoot, "HEAD");
  if (!head) {
    throw new Error("Não foi possível resolver HEAD para proteger o histórico do protocolo.");
  }
  const candidates = [
    ...(environment.GITHUB_BASE_REF
      ? [`origin/${environment.GITHUB_BASE_REF}`, environment.GITHUB_BASE_REF]
      : []),
    "origin/main",
    "main"
  ];
  for (const candidate of [...new Set(candidates)]) {
    const candidateCommit = resolveCommit(repositoryRoot, candidate);
    if (!candidateCommit) {
      continue;
    }
    const commonBase = mergeBase(repositoryRoot, head, candidateCommit);
    if (!commonBase) {
      continue;
    }
    if (candidateCommit === head && commonBase === head) {
      const parent = resolveCommit(repositoryRoot, "HEAD^");
      return { commit: parent || head, source: parent ? "HEAD^" : "HEAD", explicit: false };
    }
    return { commit: commonBase, source: `merge-base(HEAD, ${candidate})`, explicit: false };
  }

  const parent = resolveCommit(repositoryRoot, "HEAD^");
  return { commit: parent || head, source: parent ? "HEAD^" : "HEAD", explicit: false };
};

const loadApprovedV1Snapshots = (repositoryRoot, baseCommit) => {
  const tree = runGit(repositoryRoot, [
    "ls-tree",
    "-r",
    "-z",
    baseCommit,
    "--",
    AUTHORING_PROTOCOL_SNAPSHOT_DIRECTORY
  ]).stdout;

  return tree.split("\0").flatMap((entry) => {
    if (!entry) {
      return [];
    }
    const match = /^(\d+) blob ([0-9a-f]+)\t(.+)$/u.exec(entry);
    if (!match) {
      return [];
    }
    const [, mode, blobHash, relativePath] = match;
    if (!SNAPSHOT_FILE_PATTERN.test(path.posix.basename(relativePath))) {
      return [];
    }
    const contents = runGit(repositoryRoot, ["show", `${baseCommit}:${relativePath}`]).stdout;
    let snapshot;
    try {
      snapshot = JSON.parse(contents);
    } catch {
      throw new Error(`Snapshot aprovado inválido na base Git: ${relativePath}`);
    }
    return snapshot.protocolId === AUTHORING_PROTOCOL_V1_ID
      ? [{ path: relativePath, blobHash, mode }]
      : [];
  });
};

const loadWorktreeSnapshots = (repositoryRoot, approvedSnapshots) => approvedSnapshots.map((snapshot) => {
  const absolutePath = path.join(repositoryRoot, ...snapshot.path.split("/"));
  if (!existsSync(absolutePath) || !lstatSync(absolutePath).isFile()) {
    return { path: snapshot.path, missing: true };
  }
  const hash = runGit(repositoryRoot, [
    "hash-object",
    `--path=${snapshot.path}`,
    snapshot.path
  ]).stdout.trim();
  return { path: snapshot.path, blobHash: hash };
});

export const findAuthoringProtocolSnapshotHistoryViolations = ({
  approvedSnapshots,
  worktreeSnapshots
}) => {
  const worktreeByPath = new Map(worktreeSnapshots.map((snapshot) => [snapshot.path, snapshot]));
  return approvedSnapshots.flatMap((approved) => {
    const current = worktreeByPath.get(approved.path);
    if (!current || current.missing) {
      return [{ path: approved.path, kind: "removed" }];
    }
    return current.blobHash === approved.blobHash
      ? []
      : [{ path: approved.path, kind: "modified" }];
  });
};

export const verifyAuthoringProtocolSnapshotHistory = ({
  repositoryRoot = process.cwd(),
  baseRef,
  environment = process.env
} = {}) => {
  const base = resolveAuthoringProtocolSnapshotBase({ repositoryRoot, baseRef, environment });
  const approvedSnapshots = loadApprovedV1Snapshots(repositoryRoot, base.commit);
  const worktreeSnapshots = loadWorktreeSnapshots(repositoryRoot, approvedSnapshots);
  const violations = findAuthoringProtocolSnapshotHistoryViolations({
    approvedSnapshots,
    worktreeSnapshots
  });
  if (violations.length > 0) {
    const details = violations
      .map(({ path: snapshotPath, kind }) => `- ${snapshotPath}: ${kind === "removed" ? "removido" : "alterado"}`)
      .join("\n");
    throw new Error(
      `Snapshots v1 aprovados em ${base.source} (${base.commit.slice(0, 12)}) são imutáveis:\n${details}\n` +
      "Uma mudança incompatível exige nova versão pública e um novo snapshot."
    );
  }
  return { base, approvedSnapshotCount: approvedSnapshots.length };
};

const parseArguments = (argv) => {
  let baseRef;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--base") {
      baseRef = argv[index + 1];
      if (!baseRef) {
        throw new Error("--base exige uma referência Git.");
      }
      index += 1;
    } else if (argument.startsWith("--base=")) {
      baseRef = argument.slice("--base=".length);
    } else {
      throw new Error(`Argumento desconhecido: ${argument}`);
    }
  }
  return { baseRef };
};

const isDirectExecution = process.argv[1] &&
  path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url));

if (isDirectExecution) {
  try {
    const result = verifyAuthoringProtocolSnapshotHistory(parseArguments(process.argv.slice(2)));
    process.stdout.write(
      `Histórico do protocolo v1 preservado: ${result.approvedSnapshotCount} snapshot(s) aprovado(s), ` +
      `base ${result.base.source} (${result.base.commit.slice(0, 12)}).\n`
    );
  } catch (error) {
    process.stderr.write(`${error.message}\n`);
    process.exitCode = 1;
  }
}
