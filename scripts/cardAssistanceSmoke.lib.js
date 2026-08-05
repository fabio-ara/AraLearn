import fs from "node:fs";
import path from "node:path";

import {
  applyCardAssistanceChangeSet
} from "../src/assist/cardAssistanceScope.js";
import {
  generateCardAssistanceChangeSet
} from "../src/generation/runtime/cardAssistanceRuntime.js";

function projectFixture() {
  return {
    contract: "aralearn.contract",
    version: 4,
    kind: "project",
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
            status: "generated",
            dependsOn: [],
            covers: ["vetor 2D"],
            checks: ["ler coordenadas"],
            cards: [{
              id: "card-vetor",
              position: 1,
              resource: "paragraph",
              kind: "theory",
              exercise: "none",
              title: "Par ordenado",
              text: "O vetor (2, 3) tem coordenadas 2 e 3.",
              after: ""
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
  reportFileName
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
  const generated = await generateCardAssistanceChangeSet({
    projectDocument,
    selection,
    request: {
      operation: "repair",
      repairScope: "resources",
      resourceTargetIds: ["main"],
      promptText: "Torne a explicação mais precisa e autocontida sem alterar seu objetivo."
    },
    provider,
    modelId,
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
  const report = {
    contract: "aralearn.card-assistance-smoke.v2",
    createdAt: new Date().toISOString(),
    provider: providerId,
    modelId,
    operation: generated.changeSet.operation,
    cardCount: cards.length,
    repairedCard: {
      id: cards[0]?.id,
      resource: cards[0]?.resource,
      kind: cards[0]?.kind,
      exercise: cards[0]?.exercise,
      changed: cards[0]?.text !== projectDocument.courses[0].modules[0]
        .lessons[0].microsequences[0].cards[0].text
    },
    generationStoresProject: Object.hasOwn(generated, "projectDocument"),
    progress
  };
  const reportDir = path.join(process.cwd(), "tests", "reports");
  fs.mkdirSync(reportDir, { recursive: true });
  const reportPath = path.join(reportDir, reportFileName);
  fs.writeFileSync(reportPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  console.log(JSON.stringify({ ok: true, reportPath, ...report }, null, 2));
}
