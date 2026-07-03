import fs from "node:fs";
import path from "node:path";
import { spawnSync } from "node:child_process";

import { validateContractDocument } from "../src/contract/validateContract.js";

function fail(message) {
  throw new Error(message);
}

function escapeRegExp(value) {
  return String(value || "").replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function parseArgs(argv) {
  const options = {
    inputs: [],
    output: "",
    courseId: "",
    courseTitle: "",
    courseGoal: ""
  };

  for (let index = 0; index < argv.length; index += 1) {
    const current = argv[index];
    if (current === "--output") {
      options.output = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (current === "--course-id") {
      options.courseId = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (current === "--course-title") {
      options.courseTitle = argv[index + 1] || "";
      index += 1;
      continue;
    }
    if (current === "--course-goal") {
      options.courseGoal = argv[index + 1] || "";
      index += 1;
      continue;
    }
    options.inputs.push(current);
  }

  if (!options.output) fail("Uso: --output <arquivo> <fontes...>");
  if (!options.inputs.length) fail("Informe ao menos uma fonte .json ou .zip.");
  return options;
}

function runTar(args, cwd = process.cwd()) {
  const result = spawnSync("tar", args, {
    cwd,
    encoding: "utf8",
    windowsHide: true
  });
  if (result.status !== 0) {
    fail(result.stderr?.trim() || result.stdout?.trim() || `Falha ao executar tar ${args.join(" ")}`);
  }
  return result.stdout;
}

function loadSourceDocument(sourcePath) {
  const absolutePath = path.resolve(sourcePath);
  if (!fs.existsSync(absolutePath)) {
    fail(`Fonte inexistente: ${absolutePath}`);
  }
  if (absolutePath.toLowerCase().endsWith(".json")) {
    return JSON.parse(fs.readFileSync(absolutePath, "utf8"));
  }
  if (!absolutePath.toLowerCase().endsWith(".zip")) {
    fail(`Formato de fonte não suportado: ${absolutePath}`);
  }
  const entries = runTar(["-tf", absolutePath])
    .split(/\r?\n/)
    .map((item) => item.trim())
    .filter(Boolean);
  const jsonEntry = entries.find((item) => item.toLowerCase().endsWith(".json"));
  if (!jsonEntry) {
    fail(`Nenhum JSON encontrado em ${absolutePath}`);
  }
  const jsonText = runTar(["-xOf", absolutePath, jsonEntry]);
  return JSON.parse(jsonText);
}

function sanitizeTextValue(value) {
  if (typeof value !== "string") return value;
  return value
    .replace(/\bMaterializar\b/g, "Cobrir")
    .replace(/\bmaterializar\b/g, "cobrir")
    .replace(/\s*conforme handoff(?: do [^.]+)?\.?/gi, "")
    .replace(/\bindicad[ao] no handoff\b/gi, "apresentada no curso")
    .replace(/\bdescrit[ao] no handoff\b/gi, "apresentada neste curso")
    .replace(/\bnesse handoff\b/gi, "neste curso")
    .replace(/\bno handoff\b/gi, "no curso")
    .replace(/\bo plano informa\b/gi, "o curso informa")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function sanitizeDeep(value) {
  if (typeof value === "string") return sanitizeTextValue(value);
  if (Array.isArray(value)) return value.map((item) => sanitizeDeep(item));
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(Object.entries(value).map(([key, entry]) => [key, sanitizeDeep(entry)]));
}

function normalizeRole(role) {
  const normalized = text(role).normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized === "support" || normalized === "preparacao" || normalized === "preparation") return "support";
  if (normalized === "explain" || normalized === "explicacao") return "explain";
  if (normalized === "practice" || normalized === "pratica") return "practice";
  if (normalized === "review" || normalized === "consolidacao" || normalized === "consolidation") return "review";
  return "explain";
}

function normalizeTopicKind(kind) {
  const normalized = text(kind).toLowerCase();
  if (["concept", "term", "procedure", "representation"].includes(normalized)) return normalized;
  if (["skill", "practice", "decision", "operation"].includes(normalized)) return "procedure";
  return "concept";
}

function inferTreePrompt(card) {
  return text(card.prompt) || `Observe a estrutura de "${text(card.title) || "árvore"}".`;
}

function normalizeTreeNodes(nodes = []) {
  const safeNodes = Array.isArray(nodes) ? structuredClone(nodes) : [];
  const parentIds = new Set(safeNodes.map((node) => text(node?.parentId)).filter(Boolean));
  return safeNodes.map((node) => ({
    id: text(node?.id),
    label: sanitizeTextValue(text(node?.label)),
    parentId: node?.parentId === null ? null : text(node?.parentId) || null,
    type: parentIds.has(text(node?.id)) ? "folder" : "file"
  }));
}

function inferRelationSetLabel(items = [], fallback) {
  const labels = items.map((item) => text(item?.label)).filter(Boolean);
  if (labels.every((label) => /^`[^`]+`$/.test(label))) return "Colunas";
  if (labels.some((label) => /azure|service|foundry|studio|endpoint|search/i.test(label))) return "Serviços";
  if (labels.some((label) => /entrada|feature|alvo|label/i.test(label))) return "Papéis";
  if (labels.some((label) => /cen[aá]rio|produto|foto|fatura|documento|cliente/i.test(label))) return "Cenários";
  return fallback;
}

function normalizeRelationSet(value, fallbackLabel, fallbackPrefix) {
  if (Array.isArray(value)) {
    const items = value.map((item, index) => ({
      id: text(item?.id) || `${fallbackPrefix}${index + 1}`,
      label: sanitizeTextValue(text(item?.label))
    }));
    return {
      label: inferRelationSetLabel(items, fallbackLabel),
      items
    };
  }
  const items = Array.isArray(value?.items)
    ? value.items.map((item, index) => ({
        id: text(item?.id) || `${fallbackPrefix}${index + 1}`,
        label: sanitizeTextValue(text(item?.label))
      }))
    : [];
  return {
    label: sanitizeTextValue(text(value?.label)) || inferRelationSetLabel(items, fallbackLabel),
    items
  };
}

function inferRelationPrompt(card) {
  return text(card.prompt) || `Observe o mapa de relações de "${text(card.title) || "conjuntos"}".`;
}

function normalizePlaneCard(card) {
  if (!Array.isArray(card.points) || !card.points.length) return card;
  const vectors = card.points
    .map((point) => [Number(point?.x), Number(point?.y)])
    .filter((pair) => pair.every((item) => Number.isFinite(item)));
  const labels = card.points
    .map((point) => `${text(point?.label) || text(point?.id)}=(${Number(point?.x)}, ${Number(point?.y)})`)
    .filter(Boolean)
    .join(", ");
  const promptBase = text(card.prompt) || `Observe os pontos no plano para "${text(card.title) || "caso"}".`;
  const prompt = labels && !promptBase.includes("Pontos:")
    ? `${promptBase} Pontos: ${labels}.`
    : promptBase;
  const nextCard = { ...card };
  delete nextCard.points;
  nextCard.prompt = sanitizeTextValue(prompt);
  nextCard.vectors = vectors;
  return nextCard;
}

function normalizeChoiceLeak(card) {
  if (!text(card.question) || !Array.isArray(card.options) || !text(card.answer)) return card;
  const correct = card.options.find((option) => text(option?.id) === text(card.answer));
  const correctText = text(correct?.text);
  if (!correctText) return card;
  const escaped = new RegExp(escapeRegExp(correctText), "i");
  if (!escaped.test(card.question)) return card;
  const replacement = /^`[^`]+`$/.test(correctText) && /qual coluna/i.test(card.question)
    ? "`a coluna-alvo`"
    : "a opção correta";
  return {
    ...card,
    question: sanitizeTextValue(card.question.replace(escaped, replacement))
  };
}

function normalizeCard(card) {
  let nextCard = sanitizeDeep(structuredClone(card));
  if (nextCard.resource === "tree") {
    nextCard.prompt = inferTreePrompt(nextCard);
    nextCard.nodes = normalizeTreeNodes(nextCard.nodes);
  }
  if (nextCard.resource === "relation_map") {
    nextCard.prompt = inferRelationPrompt(nextCard);
    nextCard.leftSet = normalizeRelationSet(nextCard.leftSet, "Conjunto A", "u");
    nextCard.rightSet = normalizeRelationSet(nextCard.rightSet, "Conjunto B", "v");
  }
  if (nextCard.resource === "plane") {
    nextCard = normalizePlaneCard(nextCard);
  }
  nextCard = normalizeChoiceLeak(nextCard);
  return nextCard;
}

function normalizeMicrosequence(microsequence) {
  const versions = Array.isArray(microsequence?.versions) ? microsequence.versions : [];
  const normalizedVersions = versions.map((version, index) => ({
    id: text(version?.id) || `version-${String(index + 1).padStart(3, "0")}`,
    createdAt: text(version?.createdAt) || new Date().toISOString(),
    source: "manual",
    action: "repair",
    request: "",
    summary: sanitizeTextValue(text(version?.summary)),
    cards: (Array.isArray(version?.cards) ? version.cards : []).map((card) => normalizeCard(card)),
    validation: { ok: true, issues: [] }
  }));
  const activeVersion = text(microsequence?.activeVersion) || normalizedVersions.at(-1)?.id || null;
  return {
    ...sanitizeDeep(structuredClone(microsequence)),
    role: normalizeRole(microsequence?.role),
    status: normalizedVersions.length ? "generated" : "planned",
    versions: normalizedVersions,
    activeVersion
  };
}

function normalizeLesson(lesson) {
  return {
    ...sanitizeDeep(structuredClone(lesson)),
    topics: (Array.isArray(lesson?.topics) ? lesson.topics : []).map((topic) => ({
      ...sanitizeDeep(structuredClone(topic)),
      kind: normalizeTopicKind(topic?.kind)
    })),
    microsequences: (Array.isArray(lesson?.microsequences) ? lesson.microsequences : []).map((microsequence) =>
      normalizeMicrosequence(microsequence)
    )
  };
}

function mergeCourseParts(parts, overrides) {
  const firstCourse = parts[0]?.courses?.[0];
  if (!firstCourse) fail("A primeira fonte não contém curso.");

  const moduleOrder = [];
  const moduleMap = new Map();

  for (const part of parts) {
    const course = part?.courses?.[0];
    if (!course) fail("Uma das fontes não contém courses[0].");
    for (const rawModule of Array.isArray(course.modules) ? course.modules : []) {
      const moduleId = text(rawModule?.id);
      if (!moduleMap.has(moduleId)) {
        moduleMap.set(moduleId, {
          ...sanitizeDeep(structuredClone(rawModule)),
          lessons: []
        });
        moduleOrder.push(moduleId);
      }
      const targetModule = moduleMap.get(moduleId);
      const lessonMap = new Map((targetModule.lessons || []).map((lesson) => [lesson.id, lesson]));
      for (const rawLesson of Array.isArray(rawModule.lessons) ? rawModule.lessons : []) {
        const lesson = normalizeLesson(rawLesson);
        lessonMap.set(lesson.id, lesson);
      }
      targetModule.lessons = Array.from(lessonMap.values());
    }
  }

  const modules = moduleOrder.map((moduleId, moduleIndex) => {
    const moduleValue = moduleMap.get(moduleId);
    const nextModule = {
      ...moduleValue,
      title: /^Módulo\b/i.test(text(moduleValue.title))
        ? text(moduleValue.title)
        : `Módulo ${moduleIndex + 1} — ${text(moduleValue.title)}`,
      lessons: (moduleValue.lessons || []).map((lesson, lessonIndex) => ({
        ...lesson,
        title: /^Lição\b/i.test(text(lesson.title))
          ? text(lesson.title)
          : `Lição ${moduleIndex + 1}.${lessonIndex + 1} — ${text(lesson.title)}`
      }))
    };
    return nextModule;
  });

  return {
    id: overrides.courseId || text(firstCourse.id),
    title: overrides.courseTitle || sanitizeTextValue(text(firstCourse.title)),
    goal: overrides.courseGoal || sanitizeTextValue(text(firstCourse.goal)),
    modules
  };
}

function main() {
  const args = parseArgs(process.argv.slice(2));
  const parts = args.inputs.map((input) => loadSourceDocument(input));
  const course = mergeCourseParts(parts, args);
  const validation = validateContractDocument({
    contract: "aralearn.contract",
    version: 3,
    kind: "project",
    courses: [course]
  });
  if (!validation.ok) {
    fail(validation.errors.map((error) => `${error.path}: ${error.message}`).join("\n"));
  }
  const outputPath = path.resolve(args.output);
  fs.mkdirSync(path.dirname(outputPath), { recursive: true });
  fs.writeFileSync(outputPath, `${JSON.stringify(validation.value.courses[0], null, 2)}\n`, "utf8");
  const moduleCount = course.modules.length;
  const lessonCount = course.modules.reduce((sum, moduleValue) => sum + (moduleValue.lessons || []).length, 0);
  const microCount = course.modules.reduce(
    (sum, moduleValue) =>
      sum + moduleValue.lessons.reduce((lessonSum, lesson) => lessonSum + (lesson.microsequences || []).length, 0),
    0
  );
  const cardCount = course.modules.reduce(
    (sum, moduleValue) =>
      sum + moduleValue.lessons.reduce(
        (lessonSum, lesson) =>
          lessonSum +
          lesson.microsequences.reduce((microSum, microsequence) => {
            const active =
              (microsequence.versions || []).find((version) => version.id === microsequence.activeVersion) ||
              (microsequence.versions || []).at(-1);
            return microSum + ((active?.cards || []).length);
          }, 0),
        0
      ),
    0
  );
  console.log(`Curso compilado em ${outputPath}`);
  console.log(`Módulos: ${moduleCount}; lições: ${lessonCount}; microssequências: ${microCount}; cards: ${cardCount}`);
}

main();
