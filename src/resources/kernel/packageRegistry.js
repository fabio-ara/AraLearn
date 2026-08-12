import { validatePackageSchema } from "./schemaValidation.js";

const PACKAGE_ID_PATTERN = /^aralearn\.(?:resource|response)\.[a-z][a-z0-9]*(?:[._-][a-z0-9]+)*$/u;
const PACKAGE_VERSION_PATTERN = /^(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)\.(?:0|[1-9]\d*)$/u;
const PACKAGE_SLOTS = Object.freeze(["content", "response", "feedback"]);

function clone(value) {
  return structuredClone(value);
}

function freezeClone(value) {
  return Object.freeze(clone(value));
}

function text(value) {
  return typeof value === "string" ? value.trim() : "";
}

function assertNonEmptyList(value, label) {
  if (!Array.isArray(value) || value.length === 0 || value.some((item) => !text(item))) {
    throw new TypeError(`${label} precisa ser uma lista não vazia de textos.`);
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
    accessibility: manifest.accessibility || ""
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
      return clone({
        package: definition.manifest.id,
        version: definition.manifest.version,
        manifest: definition.manifest,
        contract: definition.authoringContract,
        schema: definition.schema
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
    renderInstance(instance, slot, options = {}) {
      const validation = validateInstance(instance, slot);
      if (!validation.valid) throw new TypeError(validation.errors.join(" "));
      return requirePackage(instance.package, instance.version).render(instance.data, options);
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
    }
  });
}

export const PACKAGE_SLOTS_SUPPORTED_BY_KERNEL = PACKAGE_SLOTS;
