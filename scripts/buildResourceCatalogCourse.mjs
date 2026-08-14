import fs from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";

import { validateProjectDocument } from "../src/domain/aralearnProject.js";
import { RESOURCE_CATALOG } from "../src/resources/catalog/resourceCatalog.js";
import { RESOURCE_PACKAGE_REGISTRY } from "../src/resources/packages/index.js";

const scriptPath = fileURLToPath(import.meta.url);
const scriptDirectory = path.dirname(scriptPath);
const OPERATION_LABELS = new Map(
  RESOURCE_CATALOG.explore().facets.operations.map(({ id, label }) => [id, label])
);

export const RESOURCE_CATALOG_COURSE_FILE_NAME = "aralearn-catalogo-recursos-course.json";
export const RESOURCE_CATALOG_COURSE_PATH = path.resolve(
  scriptDirectory,
  `../supabase/fixtures/catalog/${RESOURCE_CATALOG_COURSE_FILE_NAME}`
);

function compareText(left, right) {
  return left < right ? -1 : left > right ? 1 : 0;
}

function identifierToken(value) {
  return String(value || "")
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .replace(/[^a-zA-Z0-9]+/gu, "-")
    .replace(/^-+|-+$/gu, "")
    .toLocaleLowerCase("pt-BR");
}

function pathSegments(value) {
  return (String(value || "").match(/[^.[\]]+|\[(\d+)\]/gu) || []).map((segment) => (
    segment.startsWith("[") ? Number(segment.slice(1, -1)) : segment
  ));
}

function readPath(root, value) {
  return pathSegments(value).reduce((current, segment) => current?.[segment], root);
}

function answerFragment(value) {
  const source = String(value ?? "").trim();
  const words = source.match(/[\p{L}\p{N}_][\p{L}\p{N}_.:/+-]*/gu) || [];
  const candidates = words.filter((word) => word.length >= 2 && word.length <= 36);
  return candidates
    .map((word) => word.replace(/[.:/+-]+$/gu, ""))
    .filter((word) => word.length >= 2)
    .sort((left, right) => right.length - left.length || compareText(left, right))[0] || "";
}

function answerForField(value) {
  const source = String(value ?? "").normalize("NFC").trim();
  if (!source.includes("\n") && source.length >= 2 && source.length <= 56) return source;
  return answerFragment(source);
}

function targetLabelSignature(value) {
  return identifierToken(value).replace(/(?:^|-)[0-9]+(?=-|$)/gu, "");
}

const PRACTICE_BLUEPRINTS = Object.freeze({
  "aralearn.resource.matrix": Object.freeze({
    targetPath: "values[0][1]",
    data: Object.freeze({
      prompt: "Complete a entrada da matriz de rotação que muda o sinal da componente horizontal.",
      name: "R(θ)",
      delimiters: "parentheses",
      values: Object.freeze([
        Object.freeze(["cos θ", "−sin θ", "0"]),
        Object.freeze(["sin θ", "cos θ", "0"]),
        Object.freeze(["0", "0", "1"])
      ])
    })
  }),
  "aralearn.resource.relation_map": Object.freeze({
    targetPath: "rightSet.items[0].label",
    data: Object.freeze({
      prompt: "Complete a área que pertence à imagem de Ana na relação de matrícula.",
      name: "M",
      relationMeaning: "está matriculado em",
      leftSet: Object.freeze({
        label: "Estudantes",
        items: Object.freeze([
          Object.freeze({ id: "ana", label: "Ana" }),
          Object.freeze({ id: "bruno", label: "Bruno" }),
          Object.freeze({ id: "carla", label: "Carla" })
        ])
      }),
      rightSet: Object.freeze({
        label: "Áreas de estudo",
        items: Object.freeze([
          Object.freeze({ id: "linear", label: "Álgebra linear" }),
          Object.freeze({ id: "networks", label: "Redes de computadores" }),
          Object.freeze({ id: "databases", label: "Bancos de dados" }),
          Object.freeze({ id: "linguistics", label: "Linguística formal" })
        ])
      }),
      relations: Object.freeze([
        Object.freeze({ id: "ana-linear", from: "ana", to: "linear" }),
        Object.freeze({ id: "ana-networks", from: "ana", to: "networks" }),
        Object.freeze({ id: "bruno-databases", from: "bruno", to: "databases" }),
        Object.freeze({ id: "carla-linguistics", from: "carla", to: "linguistics" })
      ]),
      highlight: Object.freeze({
        relations: Object.freeze(["ana-linear", "ana-networks"]),
        leftItems: Object.freeze(["ana"]),
        rightItems: Object.freeze([])
      })
    })
  }),
  "aralearn.resource.state_transition_table": Object.freeze({
    targetPaths: Object.freeze(["transitions[1].to", "transitions[5].to"]),
    choiceValues: Object.freeze(["q0", "q1", "q2"])
  })
});

function normalizeInstance({ id, packageId, version, data, slot }) {
  return RESOURCE_PACKAGE_REGISTRY.normalizeInstance({
    id,
    package: packageId,
    version,
    data
  }, slot);
}

function manifestFor(packageId, slot) {
  const manifest = RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot })
    .find((candidate) => candidate.id === packageId);
  if (!manifest) throw new Error(`Package obrigatório ausente: ${packageId}.`);
  return manifest;
}

const paragraphManifest = manifestFor("aralearn.resource.paragraph", "content");

function paragraphInstance(id, text, slot = "content") {
  return normalizeInstance({
    id,
    packageId: paragraphManifest.id,
    version: paragraphManifest.version,
    slot,
    data: { text, languageTag: "pt-BR", textDirection: "auto" }
  });
}

function exampleContentInstance(manifest, id, data = null) {
  const authoring = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(manifest.id, manifest.version);
  return normalizeInstance({
    id,
    packageId: manifest.id,
    version: manifest.version,
    slot: "content",
    data: structuredClone(data || authoring.contract.example)
  });
}

function theoryIntroduction(manifest) {
  const convention = manifest.academic?.conventions?.[0];
  const appropriateWhen = manifest.academic?.appropriateWhen?.[0];
  const limitation = manifest.limitations?.[0];
  return [
    `${manifest.label}: ${manifest.purpose}`,
    appropriateWhen ? `É apropriado quando ${appropriateWhen}.` : "",
    convention ? `Na leitura, observe esta convenção: ${convention}.` : "",
    limitation ? `Limite importante: ${limitation}` : ""
  ].filter(Boolean).join(" ");
}

function feedbackText(manifest) {
  const profile = RESOURCE_CATALOG.getProfile(manifest.id, manifest.version);
  const operation = OPERATION_LABELS.get(profile?.operationIds?.[0]);
  const avoidWhen = manifest.academic?.avoidWhen?.[0];
  return [
    `Critério de revisão para ${manifest.label}: a representação deve realizar a finalidade declarada — ${manifest.purpose}`,
    operation ? `A operação cognitiva em foco é ${operation.toLocaleLowerCase("pt-BR")}.` : "",
    avoidWhen ? `Evite este recurso quando ${avoidWhen}.` : ""
  ].filter(Boolean).join(" ");
}

function semanticChoiceResponse(id, manifest) {
  const choices = {
    "aralearn.resource.formula": {
      question: "Na expressão exibida, qual termo está contraído com a derivada parcial de uᵢ em relação a xⱼ?",
      options: [
        { id: "tensor", text: "O tensor Tⁱʲ" },
        { id: "function", text: "A função f(u)" },
        { id: "domain", text: "A região Ω" },
        { id: "measure", text: "O elemento de volume dV" }
      ],
      answerIds: ["tensor"]
    },
    "aralearn.resource.plane": {
      question: "No plano exibido, qual objeto é a imagem do vetor e₁ pela transformação A?",
      options: [
        { id: "ae1", text: "Ae₁" },
        { id: "e2", text: "e₂" },
        { id: "point", text: "p" },
        { id: "region", text: "A(Q)" }
      ],
      answerIds: ["ae1"]
    }
  }[manifest.id];
  if (!choices) return null;
  return normalizeInstance({
    id,
    packageId: "aralearn.response.choice",
    version: manifestFor("aralearn.response.choice", "response").version,
    slot: "response",
    data: {
      question: choices.question,
      selectionMode: "single",
      selectionCriterion: "correct",
      options: choices.options,
      answerIds: choices.answerIds
    }
  });
}

function gapResponse(instance, manifest, id, responseMode) {
  const requiredMode = responseMode === "choice" ? "gap" : "typing";
  const targets = RESOURCE_PACKAGE_REGISTRY.practiceTargets(instance)
    .filter((candidate) => candidate.modes.includes(requiredMode))
    .map((candidate) => ({
      ...candidate,
      value: readPath(instance.data, candidate.path),
      signature: targetLabelSignature(candidate.label)
    }))
    .map((candidate) => ({ ...candidate, answer: answerForField(candidate.value) }))
    .filter((candidate) => typeof candidate.value === "string" && candidate.answer);
  const blueprint = PRACTICE_BLUEPRINTS[manifest.id];
  const preferredPaths = blueprint?.targetPaths || (blueprint?.targetPath
    ? [blueprint.targetPath]
    : []);
  const selectedTargets = preferredPaths.length
    ? preferredPaths
      .map((preferredPath) => targets.find((candidate) => candidate.path === preferredPath))
      .filter(Boolean)
    : targets.slice(0, 1);
  if (!selectedTargets.length) return null;
  const distractorsFor = (target) => responseMode === "choice"
    ? (blueprint?.choiceValues || targets.map(({ answer }) => answer))
      .filter((answer) => answer !== target.answer)
      .filter((answer, index, values) => values.indexOf(answer) === index)
      .sort((left, right) => {
        const leftTarget = targets.find(({ answer }) => answer === left);
        const rightTarget = targets.find(({ answer }) => answer === right);
        if (!leftTarget || !rightTarget) return compareText(left, right);
        return Number(rightTarget.signature === target.signature) -
          Number(leftTarget.signature === target.signature) ||
          Math.abs(left.length - target.answer.length) -
          Math.abs(right.length - target.answer.length) ||
          compareText(leftTarget.path, rightTarget.path);
      })
      .slice(0, 3)
    : [];
  const preparedTargets = selectedTargets.map((target) => ({
    ...target,
    distractors: distractorsFor(target)
  }));
  if (responseMode === "choice" && preparedTargets.some(({ distractors }) => !distractors.length)) {
    return null;
  }
  return normalizeInstance({
    id,
    packageId: "aralearn.response.gap",
    version: manifestFor("aralearn.response.gap", "response").version,
    slot: "response",
    data: {
      prompt: `Complete ${preparedTargets.length > 1 ? "os campos destacados" : "o campo destacado"} em ${manifest.label}.`,
      blanks: preparedTargets.map((target, index) => ({
        id: preparedTargets.length > 1 ? `target-${index + 1}` : "target",
        targetInstanceId: instance.id,
        targetPath: target.path,
        label: target.label,
        responseMode,
        answer: target.answer,
        ...(responseMode === "choice"
          ? { distractors: target.distractors }
          : {})
      }))
    }
  });
}

function contentPackageCards(manifest, prefix, packageIndex) {
  const theoryExample = exampleContentInstance(manifest, `${prefix}-theory-example`);
  const practiceExample = exampleContentInstance(
    manifest,
    `${prefix}-practice-example`,
    PRACTICE_BLUEPRINTS[manifest.id]?.data
  );
  const preferredMode = packageIndex % 2 === 0 ? "choice" : "text";
  const alternateMode = preferredMode === "choice" ? "text" : "choice";
  const response = gapResponse(
    practiceExample,
    manifest,
    `${prefix}-practice-response`,
    preferredMode
  ) || gapResponse(
    practiceExample,
    manifest,
    `${prefix}-practice-response`,
    alternateMode
  ) || semanticChoiceResponse(`${prefix}-practice-response`, manifest);
  if (!response) {
    throw new Error(
      `${manifest.id} não possui prática interna materializável nem leitura semântica específica no curso do catálogo.`
    );
  }
  return [
    {
      id: `${prefix}-theory-card`,
      position: 1,
      title: `Como ler: ${manifest.label}`,
      role: "theory",
      content: [
        paragraphInstance(`${prefix}-theory-introduction`, theoryIntroduction(manifest)),
        theoryExample
      ],
      response: null,
      feedback: [],
      topics: [],
      sources: []
    },
    {
      id: `${prefix}-practice-card`,
      position: 2,
      title: `Pratique: ${manifest.label}`,
      role: "practice",
      content: [practiceExample],
      response,
      feedback: [paragraphInstance(`${prefix}-practice-feedback`, feedbackText(manifest), "feedback")],
      topics: [],
      sources: []
    }
  ];
}

function responsePackagePractice(manifest, prefix) {
  if (manifest.id === "aralearn.response.gap") {
    const content = paragraphInstance(
      `${prefix}-practice-content`,
      "O protocolo organiza regras para que duas partes troquem mensagens de forma previsível."
    );
    return {
      content: [content],
      response: normalizeInstance({
        id: `${prefix}-practice-response`,
        packageId: manifest.id,
        version: manifest.version,
        slot: "response",
        data: {
          prompt: "Complete o termo no lugar em que ele participa da explicação.",
          blanks: [{
            id: "protocol",
            targetInstanceId: content.id,
            targetPath: "text:protocol",
            label: "Conceito definido pelas regras de comunicação",
            responseMode: "text",
            answer: "protocolo"
          }]
        }
      })
    };
  }
  if (manifest.id === "aralearn.response.choice") {
    return {
      content: [],
      response: normalizeInstance({
        id: `${prefix}-practice-response`,
        packageId: manifest.id,
        version: manifest.version,
        slot: "response",
        data: {
          question: "Qual protocolo de transporte oferece fluxo de bytes confiável, ordenado e com controle de congestionamento?",
          selectionMode: "single",
          selectionCriterion: "correct",
          options: [
            { id: "tcp", text: "TCP" },
            { id: "udp", text: "UDP" },
            { id: "ip", text: "IP" },
            { id: "dns", text: "DNS" }
          ],
          answerIds: ["tcp"]
        }
      })
    };
  }
  if (manifest.id === "aralearn.response.ordering") {
    const steps = [
      { id: "resolver", text: "O cliente envia a consulta ao resolvedor recursivo" },
      { id: "root", text: "O resolvedor consulta um servidor raiz" },
      { id: "authoritative", text: "O resolvedor alcança o servidor autoritativo" },
      { id: "reply", text: "O resolvedor devolve a resposta ao cliente" }
    ];
    const content = steps.map(({ id, text }) => paragraphInstance(
      `${prefix}-practice-${id}`,
      text
    ));
    return {
      content,
      response: normalizeInstance({
        id: `${prefix}-practice-response`,
        packageId: manifest.id,
        version: manifest.version,
        slot: "response",
        data: {
          targets: steps.map(({ id, text }, index) => ({
            id,
            targetInstanceId: content[index].id,
            targetPath: "text",
            answer: text
          }))
        }
      })
    };
  }
  const authoring = RESOURCE_PACKAGE_REGISTRY.getAuthoringContract(manifest.id, manifest.version);
  return {
    content: [],
    response: normalizeInstance({
      id: `${prefix}-practice-response`,
      packageId: manifest.id,
      version: manifest.version,
      slot: "response",
      data: structuredClone(authoring.contract.example)
    })
  };
}

function responsePackageCards(manifest, prefix) {
  const practice = responsePackagePractice(manifest, prefix);
  return [
    {
      id: `${prefix}-theory-card`,
      position: 1,
      title: `Como funciona: ${manifest.label}`,
      role: "theory",
      content: [paragraphInstance(`${prefix}-theory-introduction`, theoryIntroduction(manifest))],
      response: null,
      feedback: [],
      topics: [],
      sources: []
    },
    {
      id: `${prefix}-practice-card`,
      position: 2,
      title: `Pratique: ${manifest.label}`,
      role: "practice",
      content: practice.content,
      response: practice.response,
      feedback: [paragraphInstance(`${prefix}-practice-feedback`, feedbackText(manifest), "feedback")],
      topics: [],
      sources: []
    }
  ];
}

function catalogEntries() {
  const families = [...RESOURCE_CATALOG.families]
    .sort((left, right) => left.order - right.order || compareText(left.id, right.id));
  if (!families.length) {
    throw new Error("O curso compacto exige ao menos uma família no catálogo.");
  }
  const familyById = new Map(families.map((family) => [family.id, family]));
  if (familyById.size !== families.length) throw new Error("O catálogo contém ids de família duplicados.");

  const manifests = [
    ...RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "content" }),
    ...RESOURCE_PACKAGE_REGISTRY.listCatalog({ slot: "response" })
  ].sort((left, right) => compareText(left.id, right.id) || compareText(left.version, right.version));
  const packageKeys = new Set();
  const entries = manifests.map((manifest) => {
    const packageKey = `${manifest.id}@${manifest.version}`;
    if (packageKeys.has(packageKey)) throw new Error(`Package duplicado no registry: ${packageKey}.`);
    packageKeys.add(packageKey);
    const profile = RESOURCE_CATALOG.getProfile(manifest.id, manifest.version);
    if (!profile) throw new Error(`Package sem perfil no catálogo: ${packageKey}.`);
    if (!familyById.has(profile.primaryFamilyId)) {
      throw new Error(`Família primária desconhecida em ${packageKey}: ${profile.primaryFamilyId}.`);
    }
    if (!profile.familyIds.includes(profile.primaryFamilyId)) {
      throw new Error(`Família primária ausente de familyIds em ${packageKey}.`);
    }
    return { manifest, profile };
  });
  families.forEach((family) => {
    if (!entries.some(({ profile }) => profile.primaryFamilyId === family.id)) {
      throw new Error(`Família sem packages no curso: ${family.id}.`);
    }
  });
  return { families, entries };
}

function guide({ goal, include, exclude, notation, avoid }) {
  return { goal, include, exclude, notation, avoid };
}

function moduleForFamily(family, entries, moduleIndex) {
  const familyToken = identifierToken(family.id);
  const moduleId = `catalog-family-${familyToken}`;
  const lessonId = `${moduleId}-lesson`;
  const microsequences = entries.map(({ manifest }, packageIndex) => {
    const packageToken = identifierToken(manifest.id);
    const prefix = `catalog-${packageToken}`;
    const microsequenceId = `${prefix}-microsequence`;
    const cards = manifest.slots.includes("content")
      ? contentPackageCards(manifest, prefix, packageIndex)
      : responsePackageCards(manifest, prefix);
    const microsequence = {
      id: microsequenceId,
      title: manifest.label,
      goal: `Compreender quando usar ${manifest.label} e experimentar sua interação canônica.`,
      role: "practice",
      dependsOn: [],
      covers: [manifest.id],
      checks: [
        "a representação comunica a estrutura pretendida",
        "a prática usa uma modalidade declarada pelo package"
      ],
      errors: [],
      cards
    };
    return microsequence;
  });
  return {
    id: moduleId,
    title: `${moduleIndex + 1}. ${family.label}`,
    guide: guide({
      goal: family.description,
      include: [`packages cuja família primária é ${family.label}`],
      exclude: ["packages classificados primariamente em outra família"],
      notation: ["contratos semânticos antes da renderização"],
      avoid: ["escolher um recurso apenas pela aparência"]
    }),
    lessons: [{
      id: lessonId,
      title: `Recursos de ${family.label}`,
      guide: guide({
        goal: `Reconhecer e testar os packages reunidos em ${family.label}.`,
        include: ["uma leitura guiada e uma prática por package"],
        exclude: ["variações redundantes do mesmo contrato"],
        notation: ["finalidade, convenção, limite e interação"],
        avoid: ["tratar a taxonomia como disciplina escolar rígida"]
      }),
      topics: [],
      microsequences
    }]
  };
}

export function buildResourceCatalogCourse() {
  const { families, entries } = catalogEntries();
  const modules = families.map((family, moduleIndex) => moduleForFamily(
    family,
    entries.filter(({ profile }) => profile.primaryFamilyId === family.id),
    moduleIndex
  ));
  const project = {
    contract: "aralearn.library.v1",
    scope: "course",
    courses: [{
      id: "aralearn-catalogo-recursos",
      title: "AraLearn: Catálogo de recursos",
      goal: "Conhecer, comparar e testar todos os packages de representação e resposta disponíveis no AraLearn.",
      modules
    }]
  };
  const validation = validateProjectDocument(project);
  if (!validation.ok) {
    throw new Error(`Curso de catálogo inválido:\n${JSON.stringify(validation.errors, null, 2)}`);
  }
  return validation.value;
}

export function serializeResourceCatalogCourse(project = buildResourceCatalogCourse()) {
  return `${JSON.stringify(project, null, 2)}\n`;
}

async function run() {
  const serialized = serializeResourceCatalogCourse();
  if (process.argv.includes("--check")) {
    let current;
    try {
      current = await fs.readFile(RESOURCE_CATALOG_COURSE_PATH, "utf8");
    } catch (error) {
      if (error?.code === "ENOENT") {
        throw new Error(
          `Fixture ausente: ${RESOURCE_CATALOG_COURSE_FILE_NAME}. Execute npm run resources:catalog-course.`,
          { cause: error }
        );
      }
      throw error;
    }
    if (current !== serialized) {
      throw new Error(`Fixture desatualizada: ${RESOURCE_CATALOG_COURSE_FILE_NAME}. Execute npm run resources:catalog-course.`);
    }
    console.log(`Fixture do curso de catálogo está atualizada: ${RESOURCE_CATALOG_COURSE_FILE_NAME}.`);
    return;
  }
  await fs.writeFile(RESOURCE_CATALOG_COURSE_PATH, serialized, "utf8");
  const course = JSON.parse(serialized).courses[0];
  const microsequenceCount = course.modules.reduce((total, moduleValue) => (
    total + moduleValue.lessons[0].microsequences.length
  ), 0);
  console.log(
    `Curso gerado em ${RESOURCE_CATALOG_COURSE_PATH}: ${course.modules.length} módulos, `
    + `${microsequenceCount} packages e ${microsequenceCount * 2} cards.`
  );
}

if (process.argv[1] && path.resolve(process.argv[1]) === scriptPath) {
  run().catch((error) => {
    console.error(error.message);
    process.exitCode = 1;
  });
}
