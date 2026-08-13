import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateProjectDocument } from "../src/domain/aralearnProject.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../src/resources/packages/index.js";

const scriptDirectory = path.dirname(fileURLToPath(import.meta.url));
const outputPath = path.resolve(scriptDirectory, "../tests/fixtures/package/resource-test-course.json");

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
  const words = source.match(/[\p{L}\p{N}_][\p{L}\p{N}_.:/+-]*/gu) || [];
  const candidates = words.filter((word) => word.length >= 2 && word.length <= 36);
  return candidates.sort((left, right) => right.length - left.length)[0] || source.slice(0, 36);
}

function normalizeInstance({ id, packageId, version, data, slot }) {
  return RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id,
    package: packageId,
    version,
    data
  }, slot);
}

function exampleInstance(manifest, id) {
  const contract = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(manifest.id, manifest.version);
  return normalizeInstance({
    id,
    packageId: manifest.id,
    version: manifest.version,
    data: contract.contract.example,
    slot: "content"
  });
}

function gapResponse(instance, mode, id) {
  const requiredMode = mode === "choice" ? "gap" : "typing";
  const target = RESOURCE_PACKAGE_REGISTRY.practiceTargets(instance)
    .filter((entry) => entry.modes.includes(requiredMode))
    .map((entry) => ({ ...entry, value: readPath(instance.data, entry.path) }))
    .find((entry) => typeof entry.value === "string" && answerFragment(entry.value));
  if (!target) return null;
  const answer = answerFragment(target.value);
  return normalizeInstance({
    id,
    packageId: "aralearn.response.gap",
    version: "1.0.0",
    slot: "response",
    data: {
      blanks: [{
        id: "blank-1",
        targetInstanceId: instance.id,
        targetPath: target.path,
        label: target.label,
        responseMode: mode,
        answer,
        ...(mode === "choice"
          ? { distractors: [`não ${answer}`, `outro ${answer}`] }
          : {})
      }]
    }
  });
}

function card({ id, position, title, content = [], response = null }) {
  return {
    id,
    position,
    title,
    role: response ? "practice" : "theory",
    content,
    response,
    feedback: [],
    topics: [],
    sources: []
  };
}

function moduleForCards({ id, title, goal, cards, conventions = ["representação legível"] }) {
  return {
    id: `${id}-module`,
    title,
    guide: {
      goal,
      include: ["representação canônica e interação declarada"],
      exclude: ["adaptação artificial de outra operação cognitiva"],
      notation: conventions,
      avoid: ["usar a forma quando ela não acrescenta significado"]
    },
    lessons: [{
      id: `${id}-lesson`,
      title,
      guide: {
        goal,
        include: ["exposição e práticas semanticamente suportadas"],
        exclude: ["práticas universais presumidas"],
        notation: conventions,
        avoid: ["lacuna fora da representação"]
      },
      topics: [],
      microsequences: [{
        id: `${id}-microsequence`,
        title,
        goal,
        role: "practice",
        dependsOn: [],
        covers: [],
        checks: ["sem sobreposição", "alvo de prática dentro da representação", "Play como confirmação"],
        errors: [],
        cards
      }]
    }]
  };
}

const contentManifests = RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "content" });
const contentModules = contentManifests.map((manifest, index) => {
  const prefix = `resource-test-${index + 1}`;
  const cards = [];
  const exposition = exampleInstance(manifest, `${prefix}-exposition-content`);
  cards.push(card({ id: `${prefix}-exposition`, position: cards.length + 1, title: "Exposição", content: [exposition] }));

  for (const mode of ["choice", "text"]) {
    const practiceContent = exampleInstance(manifest, `${prefix}-${mode}-content`);
    const response = gapResponse(practiceContent, mode, `${prefix}-${mode}-response`);
    if (!response) continue;
    cards.push(card({
      id: `${prefix}-${mode}`,
      position: cards.length + 1,
      title: mode === "choice" ? "Lacuna com alternativas" : "Lacuna com digitação",
      content: [practiceContent],
      response
    }));
  }

  return moduleForCards({
    id: prefix,
    title: manifest.label,
    goal: `Avaliar ${manifest.id} somente nas modalidades declaradas pelo próprio package.`,
    cards,
    conventions: manifest.academic.conventions
  });
});

function paragraphContent(id, text) {
  return normalizeInstance({
    id,
    packageId: "aralearn.resource.paragraph",
    version: "1.0.0",
    slot: "content",
    data: { text }
  });
}

const choiceResponse = normalizeInstance({
  id: "response-choice",
  packageId: "aralearn.response.choice",
  version: "1.0.0",
  slot: "response",
  data: {
    question: "Qual protocolo oferece entrega confiável e ordenada?",
    selectionMode: "single",
    selectionCriterion: "correct",
    options: [{ id: "tcp", text: "TCP" }, { id: "udp", text: "UDP" }],
    answerIds: ["tcp"]
  }
});

const gapChoiceContent = paragraphContent(
  "response-gap-choice-content",
  "Na arquitetura cliente-servidor, o cliente envia a requisição e o servidor envia a resposta."
);
const gapChoiceResponse = normalizeInstance({
  id: "response-gap-choice",
  packageId: "aralearn.response.gap",
  version: "1.0.0",
  slot: "response",
  data: {
    blanks: [
      { id: "actor", targetInstanceId: gapChoiceContent.id, targetPath: "text", responseMode: "choice", answer: "cliente", distractors: ["servidor", "roteador"] },
      { id: "message", targetInstanceId: gapChoiceContent.id, targetPath: "text", responseMode: "choice", answer: "resposta", distractors: ["requisição", "conexão"] }
    ]
  }
});

const gapTypingContent = paragraphContent(
  "response-gap-typing-content",
  "O DNS traduz nomes de domínio em endereços IP."
);
const gapTypingResponse = normalizeInstance({
  id: "response-gap-typing",
  packageId: "aralearn.response.gap",
  version: "1.0.0",
  slot: "response",
  data: {
    blanks: [{ id: "service", targetInstanceId: gapTypingContent.id, targetPath: "text", responseMode: "text", answer: "DNS" }]
  }
});

const orderingResponse = normalizeInstance({
  id: "response-ordering",
  packageId: "aralearn.response.ordering",
  version: "2.0.0",
  slot: "response",
  data: {
    prompt: "Ordene as etapas da resolução iterativa de um nome.",
    items: [{ id: "root", label: "Consultar um servidor raiz" }, { id: "query", label: "Receber a consulta do cliente" }, { id: "answer", label: "Devolver o endereço encontrado" }],
    answerOrder: ["query", "root", "answer"]
  }
});

const matchingResponse = normalizeInstance({
  id: "response-matching",
  packageId: "aralearn.response.matching",
  version: "1.0.0",
  slot: "response",
  data: {
    prompt: "Associe cada protocolo à função principal.",
    mode: "one-to-one",
    leftItems: [{ id: "dns", label: "DNS" }, { id: "dhcp", label: "DHCP" }],
    rightItems: [{ id: "names", label: "Resolver nomes" }, { id: "address", label: "Configurar endereços" }],
    answerPairs: [{ leftId: "dns", rightId: "names" }, { leftId: "dhcp", rightId: "address" }]
  }
});

const responseModules = [
  moduleForCards({ id: "response-choice-test", title: "Escolha", goal: "Avaliar seleção e feedback por Play.", cards: [card({ id: "choice-card", position: 1, title: "Escolha", response: choiceResponse })] }),
  moduleForCards({ id: "response-gap-test", title: "Lacuna", goal: "Avaliar lacunas independentes por alternativas e digitação.", cards: [card({ id: "gap-choice-card", position: 1, title: "Alternativas por lacuna", content: [gapChoiceContent], response: gapChoiceResponse }), card({ id: "gap-typing-card", position: 2, title: "Digitação na lacuna", content: [gapTypingContent], response: gapTypingResponse })] }),
  moduleForCards({ id: "response-ordering-test", title: "Ordenação", goal: "Avaliar reconstrução de ordem como resposta independente.", cards: [card({ id: "ordering-card", position: 1, title: "Blocos de ordenação", response: orderingResponse })] }),
  moduleForCards({ id: "response-matching-test", title: "Encaixe", goal: "Avaliar correspondências como resposta independente.", cards: [card({ id: "matching-card", position: 1, title: "Encaixe de correspondências", response: matchingResponse })] })
];

const modules = [...contentModules, ...responseModules];
const project = {
  contract: "aralearn.library.v1",
  scope: "course",
  courses: [{
    id: "course-resource-test",
    title: "Teste de Recursos",
    goal: "Avaliar separadamente packages de representação e packages de resposta.",
    modules
  }]
};

const validation = validateProjectDocument(project);
if (!validation.ok) throw new Error(`Curso de teste inválido:\n${JSON.stringify(validation.errors, null, 2)}`);

const cardCount = modules.reduce((total, moduleValue) => (
  total + moduleValue.lessons[0].microsequences[0].cards.length
), 0);
fs.writeFileSync(outputPath, `${JSON.stringify(validation.value, null, 2)}\n`, "utf8");
console.log(`Curso de teste gerado em ${outputPath}: ${modules.length} packages, ${cardCount} cards.`);
