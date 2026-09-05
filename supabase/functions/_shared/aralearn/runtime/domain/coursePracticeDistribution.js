const MODES = new Set(["expository", "practice", "mixed"]);

// A função observa a declaração pedagógica. Não infere função ou qualidade
// semântica a partir do tamanho, package ou quantidade de respostas.
export function observeCoursePracticeDistribution(sequence) {
  if (!Array.isArray(sequence) || sequence.length > 4096) {
    throw new TypeError("A sequência de funções didáticas é inválida.");
  }
  const identities = new Set();
  const positions = new Set();
  const rows = sequence.map((row) => {
    if (!row || typeof row !== "object" || Array.isArray(row) ||
        Object.keys(row).some((key) => !["studyUnitRef", "position", "mode"].includes(key)) ||
        typeof row.studyUnitRef !== "string" || !row.studyUnitRef ||
        !Number.isSafeInteger(row.position) || row.position < 0 ||
        row.mode !== null && !MODES.has(row.mode) ||
        identities.has(row.studyUnitRef) || positions.has(row.position)) {
      throw new TypeError("Uma função didática está ausente, repetida ou inválida.");
    }
    identities.add(row.studyUnitRef);
    positions.add(row.position);
    return { ...row };
  }).sort((left, right) => left.position - right.position);
  const expositionPositions = rows.filter(({ mode }) =>
    mode === "expository" || mode === "mixed").map(({ position }) => position);
  const practicePositions = rows.filter(({ mode }) =>
    mode === "practice" || mode === "mixed").map(({ position }) => position);
  const runs = [];
  let run = 0;
  for (const { mode } of rows) {
    if (mode === "expository") run += 1;
    else if (run) { runs.push(run); run = 0; }
  }
  if (run) runs.push(run);
  const firstExposition = expositionPositions[0];
  const lastExposition = expositionPositions.at(-1);
  return {
    studyUnitCount: rows.length,
    expositoryOnlyCount: rows.filter(({ mode }) => mode === "expository").length,
    practiceOnlyCount: rows.filter(({ mode }) => mode === "practice").length,
    mixedCount: rows.filter(({ mode }) => mode === "mixed").length,
    undeclaredCount: rows.filter(({ mode }) => mode === null).length,
    expositionPositions,
    practicePositions,
    expositoryRunLengths: runs,
    longestExpositoryRun: Math.max(0, ...runs),
    practiceBeforeExpositionCount: firstExposition === undefined ? 0 :
      practicePositions.filter((position) => position < firstExposition).length,
    practiceBetweenExpositionsCount: firstExposition === undefined ? 0 :
      practicePositions.filter((position) => position > firstExposition && position < lastExposition).length,
    practiceAfterExpositionCount: lastExposition === undefined ? 0 :
      practicePositions.filter((position) => position > lastExposition).length
  };
}
