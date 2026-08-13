import { validatePackageSchema } from "./schemaValidation.js";

const PACKAGE_ID_PATTERN = /^aralearn\.(?:resource|response)\.[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const PACKAGE_VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const PACKAGE_SLOTS = Object.freeze(["content", "response", "feedback"]);
const PRACTICE_MODES = Object.freeze([
  "exposition",
  "gap",
  "typing",
  "selection",
  "ordering",
  "matching",
  "classification"
]);
function clone(value) {
  return structuredClone(value);
}

function freezeClone(value) {
  return Object.freeze(clone(value));
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function readPath(root, path) {
  return (String(path || "").match(/[^.[\]]+|\[(\d+)\]/gu) || [])
    .map((segment) => segment.startsWith("[") ? Number(segment.slice(1, -1)) : segment)
    .reduce((current, segment) => current?.[segment], root);
}

function validatePracticeTargets(definition, data) {
  const normalizedData = definition.normalize(clone(data));
  const targets = definition.practiceTargets(normalizedData);
  if (!Array.isArray(targets)) {
    return [`${definition.manifest.id}.practiceTargets() precisa devolver uma lista.`];
  }
  return targets.flatMap((target, index) => {
    const errors = [];
    const modes = Array.isArray(target?.modes) ? target.modes : [];
    if (!text(target?.path) || !text(target?.label)) {
      errors.push(`${definition.manifest.id}.practiceTargets()[${index}] precisa de path e label.`);
    }
    if (!modes.length || modes.some((mode) => !["gap", "typing"].includes(mode))) {
      errors.push(`${definition.manifest.id}.practiceTargets()[${index}] declara modo inválido.`);
    }
    if (typeof readPath(normalizedData, target?.path) !== "string") {
      errors.push(`${definition.manifest.id}.practiceTargets()[${index}] não aponta para campo textual.`);
    }
    return errors;
  });
}

function resolvedPracticeTargets(definition, data) {
  const normalizedData = definition.normalize(clone(data));
  const targets = definition.practiceTargets(normalizedData);
  return Array.isArray(targets)
    ? targets.filter((target) => text(readPath(normalizedData, target?.path)))
    : [];
}

function assertNonEmptyList(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !text(item))) {
    throw new TypeError(`${label} precisa ser uma lista não vazia de textos.`);
  }
}

function assertAcademicManifest(manifest) {
  const academic = manifest.academic;
  if (!academic || typeof academic !== "object" || Array.isArray(academic)) {
    throw new TypeError(`${manifest.id}.manifest precisa de academic.`);
  }
  for (const field of [
    "domains",
    "knowledgeObjects",
    "conventions",
    "appropriateWhen",
    "avoidWhen",
    "technologies",
    "practiceModes"
  ]) {
    assertNonEmptyList(academic[field], `${manifest.id}.manifest.academic.${field}`);
  }
  if (academic.practiceModes.some((mode) => !PRACTICE_MODES.includes(mode))) {
    throw new TypeError(`${manifest.id} declara modalidade de prática desconhecida.`);
  }
  const authoring = academic.authoring;
  if (!authoring || typeof authoring !== "object" || Array.isArray(authoring) ||
      authoring.aiSelection !== true || authoring.manualTextEditing !== true ||
      authoring.structureEditing !== false) {
    throw new TypeError(
      `${manifest.id}.manifest.academic.authoring precisa habilitar seleção por IA e edição textual, sem edição estrutural.`
    );
  }
  if (manifest.slots.includes("content") && !academic.practiceModes.includes("exposition")) {
    throw new TypeError(`${manifest.id} precisa declarar exposição em practiceModes.`);
  }
}

export function assertPackageDefinition(definition) {
  if (!definition || typeof definition !== "object" || Array.isArray(definition)) {
    throw new TypeError("Package precisa ser um objeto.");
  }
  const manifest = definition.manifest;
  if (!manifest || typeof manifest !== "object" || Array.isArray(manifest)) {
    throw new TypeError("Package precisa de manifest.");
  }
  if (!PACKAGE_ID_PATTERN.test(text(manifest.id))) {
    throw new TypeError(`Package id inválido: ${manifest.id || "ausente"}.`);
  }
  if (!PACKAGE_VERSION_PATTERN.test(text(manifest.version))) {
    throw new TypeError(`Versão inválida em ${manifest.id}.`);
  }
  if (!text(manifest.label) || !text(manifest.purpose)) {
    throw new TypeError(`${manifest.id} precisa de label e purpose.`);
  }
  assertNonEmptyList(manifest.slots, `${manifest.id}.manifest.slots`);
  if (manifest.slots.some((slot) => !PACKAGE_SLOTS.includes(slot))) {
    throw new TypeError(`${manifest.id} declara slot desconhecido.`);
  }
  assertNonEmptyList(manifest.cognitiveOperations, `${manifest.id}.manifest.cognitiveOperations`);
  assertAcademicManifest(manifest);
  if (!definition.schema || typeof definition.schema !== "object") {
    throw new TypeError(`${manifest.id} precisa de schema.`);
  }
  if (!definition.authoringContract || typeof definition.authoringContract !== "object") {
    throw new TypeError(`${manifest.id} precisa de authoringContract.`);
  }
  for (const method of ["normalize", "validate", "render", "accessibleText", "editableTargets"]) {
    if (typeof definition[method] !== "function") {
      throw new TypeError(`${manifest.id} precisa implementar ${method}().`);
    }
  }
  if (definition.hydrate !== undefined && typeof definition.hydrate !== "function") {
    throw new TypeError(`${manifest.id}.hydrate precisa ser uma função.`);
  }
  if (manifest.slots.includes("content") && typeof definition.practiceTargets !== "function") {
    throw new TypeError(`${manifest.id} ocupa content e precisa implementar practiceTargets().`);
  }
  if (manifest.slots.includes("response") && typeof definition.evaluate !== "function") {
    throw new TypeError(`${manifest.id} ocupa response e precisa implementar evaluate().`);
  }
  return true;
}

function publicManifest(definition) {
  const manifest = definition.manifest;
  return freezeClone({
    id: manifest.id,
    version: manifest.version,
    label: manifest.label,
    purpose: manifest.purpose,
    slots: manifest.slots,
    cognitiveOperations: manifest.cognitiveOperations,
    responseCompatibility: manifest.responseCompatibility || [],
    limitations: manifest.limitations || [],
    accessibility: manifest.accessibility || "",
    academic: manifest.academic
  });
}

function instanceIdentity(instance) {
  return `${text(instance?.package)}@${text(instance?.version)}`;
}

export function createPackageRegistry(packageDefinitions = []) {
  if (!Array.isArray(packageDefinitions)) {
    throw new TypeError("O registry recebe uma lista de packages.");
  }
  const packages = new Map();
  packageDefinitions.forEach((definition) => {
    assertPackageDefinition(definition);
    const key = `${definition.manifest.id}@${definition.manifest.version}`;
    if (packages.has(key)) throw new TypeError(`Package duplicado: ${key}.`);
    packages.set(key, Object.freeze({ ...definition, manifest: publicManifest(definition) }));
  });

  function get(packageId, version) {
    return packages.get(`${text(packageId)}@${text(version)}`) || null;
  }

  function requirePackage(packageId, version) {
    const definition = get(packageId, version);
    if (!definition) throw new RangeError(`Package não instalado: ${text(packageId)}@${text(version)}.`);
    return definition;
  }

  function validateInstance(instance, slot) {
    const errors = [];
    if (!instance || typeof instance !== "object" || Array.isArray(instance)) {
      return { valid: false, errors: ["Instância precisa ser um objeto."] };
    }
    const allowedKeys = new Set(["id", "package", "version", "data"]);
    Object.keys(instance).forEach((key) => {
      if (!allowedKeys.has(key)) errors.push(`Campo desconhecido na instância: ${key}.`);
    });
    if (!text(instance.id)) errors.push("Instância precisa de id.");
    const definition = get(instance.package, instance.version);
    if (!definition) {
      errors.push(`Package não instalado: ${instanceIdentity(instance)}.`);
      return { valid: false, errors };
    }
    if (!definition.manifest.slots.includes(slot)) {
      errors.push(`${instanceIdentity(instance)} não pode ocupar o slot ${slot}.`);
    }
    const schemaValidation = validatePackageSchema(instance.data, definition.schema);
    if (!schemaValidation.valid) errors.push(schemaValidation.error);
    if (schemaValidation.valid) {
      const semanticErrors = definition.validate(instance.data);
      if (Array.isArray(semanticErrors)) errors.push(...semanticErrors.filter(Boolean).map(String));
      if (slot === "content" && definition.manifest.slots.includes("content")) {
        errors.push(...validatePracticeTargets(definition, instance.data));
      }
    }
    return { valid: errors.length === 0, errors };
  }

  return Object.freeze({
    listCatalog({ slot = "" } = {}) {
      return Array.from(packages.values())
        .filter((definition) => !slot || definition.manifest.slots.includes(slot))
        .map((definition) => clone(definition.manifest));
    },
    getAuthoringContract(packageId, version) {
      const definition = requirePackage(packageId, version);
      const exampleData = definition.normalize(clone(definition.authoringContract.example));
      return clone({
        package: definition.manifest.id,
        version: definition.manifest.version,
        manifest: definition.manifest,
        contract: definition.authoringContract,
        schema: definition.schema,
        ...(definition.manifest.slots.includes("content")
          ? { practiceTargets: resolvedPracticeTargets(definition, exampleData) }
          : {})
      });
    },
    get,
    normalizeInstance(instance, slot) {
      const definition = requirePackage(instance?.package, instance?.version);
      const normalized = {
        id: text(instance?.id),
        package: definition.manifest.id,
        version: definition.manifest.version,
        data: definition.normalize(clone(instance?.data))
      };
      const validation = validateInstance(normalized, slot);
      if (!validation.valid) throw new TypeError(validation.errors.join(" "));
      return normalized;
    },
    validateInstance,
    validateCardRelations(card) {
      if (!card?.response) return [];
      const definition = get(card.response.package, card.response.version);
      if (typeof definition?.validateCard !== "function") return [];
      const errors = definition.validateCard(clone(card), {
        practiceTargets(instance) {
          const contentDefinition = requirePackage(instance.package, instance.version);
          return clone(resolvedPracticeTargets(contentDefinition, instance.data));
        },
        materializesGap(instance, response, blankIndex) {
          const contentDefinition = requirePackage(instance.package, instance.version);
          if (typeof definition.prepareContentInstance !== "function") return false;
          try {
            const blockKey = "aralearn-practice-materialization";
            const prepared = definition.prepareContentInstance(clone(instance), clone(response.data), {
              responseBlockKey: blockKey,
              blockKey,
              responseState: { values: [] }
            });
            const html = contentDefinition.render(prepared, {});
            return html.includes(`data-complete-block-key="${blockKey}"`) &&
              html.includes(`data-complete-blank-index="${blankIndex}"`);
          } catch {
            return false;
          }
        }
      });
      return Array.isArray(errors) ? errors.filter(Boolean).map(String) : [];
    },
    prepareCardForSemantics(card) {
      if (!card?.response) return clone(card);
      const definition = get(card.response.package, card.response.version);
      return typeof definition?.prepareCardForSemantics === "function"
        ? definition.prepareCardForSemantics(clone(card))
        : clone(card);
    },
    renderInstance(instance, slot, options = {}) {
      const validation = validateInstance(instance, slot);
      if (!validation.valid) throw new TypeError(validation.errors.join(" "));
      const definition = requirePackage(instance.package, instance.version);
      const response = options?.cardResponse;
      const responseDefinition = response
        ? get(response.package, response.version)
        : null;
      const renderData = slot === "content" && typeof responseDefinition?.prepareContentInstance === "function"
        ? responseDefinition.prepareContentInstance(
            clone(instance),
            clone(response.data),
            options
          )
        : clone(instance.data);
      return definition.render(renderData, options);
    },
    async hydrate(root) {
      if (!root?.querySelectorAll) return;
      const instances = [
        ...(root.matches?.(".package-instance") ? [root] : []),
        ...root.querySelectorAll(".package-instance")
      ];
      await Promise.all(instances.map(async (instanceRoot) => {
        const definition = get(
          instanceRoot.getAttribute("data-package"),
          instanceRoot.getAttribute("data-package-version")
        );
        if (typeof definition?.hydrate === "function") {
          await definition.hydrate(instanceRoot);
        }
      }));
    },
    accessibleText(instance, slot) {
      const validation = validateInstance(instance, slot);
      if (!validation.valid) throw new TypeError(validation.errors.join(" "));
      return text(requirePackage(instance.package, instance.version).accessibleText(instance.data));
    },
    editableTargets(instance, slot) {
      const validation = validateInstance(instance, slot);
      if (!validation.valid) throw new TypeError(validation.errors.join(" "));
      return clone(requirePackage(instance.package, instance.version).editableTargets(instance.data));
    },
    practiceTargets(instance, slot = "content") {
      const validation = validateInstance(instance, slot);
      if (!validation.valid) throw new TypeError(validation.errors.join(" "));
      const definition = requirePackage(instance.package, instance.version);
      return clone(resolvedPracticeTargets(definition, instance.data));
    },
    evaluateResponse(instance, answer) {
      const validation = validateInstance(instance, "response");
      if (!validation.valid) throw new TypeError(validation.errors.join(" "));
      return clone(requirePackage(instance.package, instance.version).evaluate(instance.data, clone(answer)));
    }
  });
}

export const PACKAGE_SLOTS_SUPPORTED_BY_KERNEL = PACKAGE_SLOTS;
export const PACKAGE_PRACTICE_MODES = PRACTICE_MODES;
