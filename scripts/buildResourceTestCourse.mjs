import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateProjectDocument } from "../src/domain/aralearnProject.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../src/resources/packages/index.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(
  scriptDirectory,
  "../tests/fixtures/package/resource-test-course.json"
);

function pathSegments(value) {
  return (String(value || "").match(/[^.[\]]+|\[(\d+)\]/gu) || []).map((segment) => (
    segment.startsWith("[") ? Number(segment.slice(1, -1)) : segment
  ));
}

function readPath(root, value) {
  return pathSegments(value).reduce((current, segment) => current?.[segment], root);
}

function answerFragment(value) {
  const source = String(value || "").trim();
  const words = source.match(/[\p{L}\p{N}][\p{L}\p{N}_.:/+-]*/gu) || [];
  const candidates = words.filter((word) => word.length >= 3 && word.length <= 36);
  return candidates.sort((left, right) => right.length - left.length)[0] || source.slice(0, 36);
}

function contentInstance(manifest, id) {
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(
    manifest.id,
    manifest.version
  );
  return RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id,
    package: manifest.id,
    version: manifest.version,
    data: contract.contract.example
  }, "content");
}

function gapResponse(instance, mode, id) {
  const targets = RESOURCE_PACKAGE_REGISTRY.editableTargets(instance, "content");
  const target = targets
    .map((entry) => ({ ...entry, value: readPath(instance.data, entry.path) }))
    .find((entry) => typeof entry.value === "string" && answerFragment(entry.value));
  if (!target) throw new Error(`${instance.package} não oferece alvo textual para lacuna.`);
  const answer = answerFragment(target.value);
  return RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id,
    package: "aralearn.response.gap",
    version: "1.0.0",
    data: {
      prompt: mode === "choice"
        ? "Complete a lacuna escolhendo o termo que pertence à representação."
        : "Digite o termo retirado da representação.",
      blanks: [{
        id: "blank-1",
        targetInstanceId: instance.id,
        targetPath: target.path,
        label: target.label,
        responseMode: mode,
        answer,
        ...(mode === "choice"
          ? { distractors: ["termo inadequado", "outra possibilidade"] }
          : {})
      }]
    }
  }, "response");
}

function orderingResponse(id) {
  return RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id,
    package: "aralearn.response.ordering",
    version: "2.0.0",
    data: {
      prompt: "Ordene os gestos de leitura desta representação.",
      items: [
        { id: "interpret", label: "Interpretar as relações apresentadas" },
        { id: "observe", label: "Observar os elementos e a convenção usada" },
        { id: "conclude", label: "Formular a conclusão sustentada pela representação" }
      ],
      answerOrder: ["observe", "interpret", "conclude"]
    }
  }, "response");
}

function card({ id, position, title, content, response = null }) {
  return {
    id,
    position,
    title,
    role: response ? "practice" : "theory",
    content: [content],
    response,
    feedback: [],
    topics: [],
    sources: []
  };
}

const contentManifests = RESOURCE_PACKAGE_REGISTRY.listCatalog()
  .filter(({ slots }) => slots.includes("content"));

const modules = contentManifests.map((manifest, index) => {
  const prefix = `resource-test-${index + 1}`;
  const exposition = contentInstance(manifest, `${prefix}-exposition-content`);
  const choiceGap = contentInstance(manifest, `${prefix}-gap-content`);
  const typingGap = contentInstance(manifest, `${prefix}-typing-content`);
  const ordering = contentInstance(manifest, `${prefix}-ordering-content`);
  const cards = [
    card({ id: `${prefix}-exposition`, position: 1, title: "Exposição", content: exposition }),
    card({ id: `${prefix}-gap`, position: 2, title: "Lacuna com alternativas", content: choiceGap, response: gapResponse(choiceGap, "choice", `${prefix}-gap-response`) }),
    card({ id: `${prefix}-typing`, position: 3, title: "Lacuna com digitação", content: typingGap, response: gapResponse(typingGap, "text", `${prefix}-typing-response`) }),
    card({ id: `${prefix}-ordering`, position: 4, title: "Blocos de ordenação", content: ordering, response: orderingResponse(`${prefix}-ordering-response`) })
  ];
  return {
    id: `${prefix}-module`,
    title: manifest.label,
    guide: {
      goal: `Avaliar ${manifest.id} nas quatro modalidades comuns.`,
      include: [manifest.purpose],
      exclude: ["avaliação de conteúdo disciplinar"],
      notation: manifest.academic.conventions,
      avoid: manifest.academic.avoidWhen
    },
    lessons: [{
      id: `${prefix}-lesson`,
      title: manifest.id,
      guide: {
        goal: "Comparar a mesma representação sem prática e com três formas de resposta.",
        include: ["exposição", "lacuna", "digitação", "ordenação"],
        exclude: ["alteração estrutural do package"],
        notation: manifest.academic.conventions,
        avoid: manifest.limitations
      },
      topics: [],
      microsequences: [{
        id: `${prefix}-microsequence`,
        title: manifest.label,
        goal: `Inspecionar a adequação acadêmica e a responsividade de ${manifest.id}.`,
        role: "practice",
        dependsOn: [],
        covers: [],
        checks: ["sem sobreposição", "notação acadêmica", "interação acessível"],
        errors: [],
        cards
      }]
    }]
  };
});

const project = {
  contract: "aralearn.library.v1",
  scope: "course",
  courses: [{
    id: "course-resource-test",
    title: "Teste de Recursos",
    goal: "Avaliar cada package de conteúdo em exposição, lacuna, digitação e ordenação.",
    modules
  }]
};

const validation = validateProjectDocument(project);
if (!validation.ok) {
  throw new Error(`Curso de teste inválido:\n${JSON.stringify(validation.errors, null, 2)}`);
}

const cardCount = modules.reduce(
  (total, moduleValue) => total + moduleValue.lessons[0].microsequences[0].cards.length,
  0
);
fs.writeFileSync(outputPath, `${JSON.stringify(validation.value, null, 2)}\n`, "utf8");
console.log(
  `Curso de teste gerado em ${outputPath}: ${contentManifests.length} resources, ${cardCount} cards.`
);
