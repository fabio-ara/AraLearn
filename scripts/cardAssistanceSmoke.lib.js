import fs from "node:fs";
import path from "node:path";

import {
  applyCardAssistanceChangeSet
} from "../src/assist/cardAssistanceScope.js";
import {
  createCardAssistanceLedger
} from "../src/assist/cardAssistanceLedger.js";
import {
  generateCardAssistanceChangeSet
} from "../src/generation/runtime/cardAssistanceRuntime.js";

function projectFixture() {
  return {
    contract: "aralearn.library.v1",
    scope: "course",
    courses: [{
      id: "course-vetores",
      title: "Vetores",
      goal: "Interpretar vetores em casos curtos.",
      modules: [{
        id: "module-base",
        title: "Base visual",
        guide: {
          goal: "Ler vetores 2D.",
          include: ["vetor 2D"],
          exclude: ["determinante"],
          notation: ["Use pares ordenados."],
          avoid: []
        },
        lessons: [{
          id: "lesson-vetores",
          title: "Vetores 2D",
          guide: {
            goal: "Ler vetores 2D.",
            include: ["vetor 2D"],
            exclude: ["determinante"],
            notation: ["Use pares ordenados."],
            avoid: []
          },
          topics: [],
          microsequences: [{
            id: "micro-vetor",
            title: "Coordenadas",
            goal: "Reconhecer as coordenadas de um vetor.",
            role: "explain",
            branchOf: null,
            dependsOn: [],
            covers: ["vetor 2D"],
            checks: ["ler coordenadas"],
            errors: [],
            cards: [{
              id: "card-vetor",
              position: 1,
              title: "Par ordenado",
              role: "theory",
              content: [{
                id: "card-vetor-text",
                package: "aralearn.resource.paragraph",
                version: "1.0.0",
                data: { text: "O vetor (2, 3) tem coordenadas 2 e 3." }
              }],
              response: null,
              feedback: [],
              topics: ["vetor 2D"],
              sources: []
            }]
          }]
        }]
      }]
    }]
  };
}

export function environmentText(name) {
  const value = process.env[name];
  return typeof value === "string" ? value.trim() : "";
}

export async function runCardAssistanceSmoke({
  provider,
  providerId,
  modelId,
  reportFileName,
  readTransportCallCount = null
}) {
  const projectDocument = projectFixture();
  const selection = {
    courseKey: "course-vetores",
    moduleKey: "module-base",
    lessonKey: "lesson-vetores",
    microsequenceKey: "micro-vetor",
    cardKey: "card-vetor"
  };
  const progress = [];
  const originalCard = projectDocument.courses[0].modules[0].lessons[0]
    .microsequences[0].cards[0];
  const assistanceLedger = createCardAssistanceLedger({
    selection,
    card: originalCard
  });
  const usage = {
    calls: 0,
    successful_calls: 0,
    failed_calls: 0,
    prompt_tokens: 0,
    completion_tokens: 0,
    total_tokens: 0,
    prompt_cache_hit_tokens: 0,
    prompt_cache_miss_tokens: 0
  };
  const measuredProvider = {
    ...provider,
    async generateStructured(request) {
      usage.calls += 1;
      let result;
      try {
        result = await provider.generateStructured(request);
        usage.successful_calls += 1;
      } catch (error) {
        usage.failed_calls += 1;
        throw error;
      }
      const callUsage = result?.usage && typeof result.usage === "object"
        ? result.usage
        : {};
      Object.keys(usage).filter((fieldName) => ![
        "calls", "successful_calls", "failed_calls"
      ].includes(fieldName)).forEach((fieldName) => {
        usage[fieldName] += Number(callUsage[fieldName]) || 0;
      });
      return result;
    }
  };
  const generated = await generateCardAssistanceChangeSet({
    projectDocument,
    selection,
    request: {
      operation: "edit_text",
      scope: "card",
      resourceTargetIds: [],
      promptText: "Torne a explicação mais precisa e autocontida sem alterar seu objetivo."
    },
    provider: measuredProvider,
    modelId,
    assistanceLedger,
    onProgress: (event) => progress.push(event)
  });
  const applied = await applyCardAssistanceChangeSet({
    projectDocument,
    selection,
    snapshot: generated.snapshot,
    changeSet: generated.changeSet
  });
  const cards = applied.projectDocument.courses[0].modules[0].lessons[0]
    .microsequences[0].cards;
  const changed = JSON.stringify(cards[0]) !== JSON.stringify(originalCard);
  if (!changed) {
    throw new Error("O smoke terminou sem materializar a correção solicitada.");
  }
  const report = {
    contract: "aralearn.card-assistance-smoke.v4",
    createdAt: new Date().toISOString(),
    provider: providerId,
    modelId,
    operation: generated.changeSet.operation,
    cardCount: cards.length,
    editedCard: {
      id: cards[0]?.id,
      role: cards[0]?.role,
      packages: [
        ...(cards[0]?.content || []),
        ...(cards[0]?.response ? [cards[0].response] : []),
        ...(cards[0]?.feedback || [])
      ].map(({ package: packageId, version }) => ({ package: packageId, version })),
      editedPaths: (generated.changeSet.textPatch || []).map(({ path: editedPath }) => editedPath),
      changed
    },
    ledger: {
      turnCount: generated.assistanceLedger?.turns?.length || 0,
      cursorVersionId: generated.assistanceLedger?.cursorVersionId || ""
    },
    generationStoresProject: Object.hasOwn(generated, "projectDocument"),
    usage,
    ...(typeof readTransportCallCount === "function"
      ? { transportCalls: Number(readTransportCallCount()) || 0 }
      : {}),
    progress
  };
  const reportDir = path.join(process.cwd(), "tests", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, reportFileName);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, reportPath, ...report }, null, 2));
}
