import { escapePackageAttribute, renderPackageLiteral, renderPackageProse } from "../../sdk/html.js";

const bindings = new WeakMap();
const text = (value) => String(value ?? "").trim();
const hasControls = (value, forbidSpace = false) => [...value].some((character) => {
  const point = character.codePointAt(0);
  return point < (forbidSpace ? 33 : 32) || point >= 127 && point <= 159;
});
const LANGUAGE = /^[A-Za-z]{2,8}(?:-[A-Za-z0-9]{1,8})*$/u;
export const auxiliaryLinksSchema = Object.freeze({
  type: "object", additionalProperties: false, required: ["title", "items"], properties: {
    title: { type: "string", minLength: 1, maxLength: 300 }, prompt: { type: "string", maxLength: 2000 },
    items: { type: "array", minItems: 1, maxItems: 32, items: {
      type: "object", additionalProperties: false, required: ["id", "label", "target"], properties: {
        id: { type: "string", minLength: 1, maxLength: 240 }, label: { type: "string", minLength: 1, maxLength: 300 },
        description: { type: "string", maxLength: 4000 }, languageTag: { type: "string", minLength: 2, maxLength: 48 },
        target: { oneOf: [
          { type: "object", additionalProperties: false, required: ["kind", "url"], properties: {
            kind: { const: "url" }, url: { type: "string", minLength: 1, maxLength: 2048 }
          } },
          { type: "object", additionalProperties: false, required: ["kind", "sourceId", "sourceRevision", "contentHash"], properties: {
            kind: { const: "source_attachment" }, sourceId: { type: "string", minLength: 1, maxLength: 240 },
            sourceRevision: { type: "integer", minimum: 1 }, contentHash: { type: "string", pattern: "^[a-f0-9]{64}$" }
          } }
        ] }
      }
    } }
  }
});

export function normalizeAuxiliaryLinks(data) {
  return { title: text(data?.title), ...(text(data?.prompt) ? { prompt: text(data.prompt) } : {}),
    items: (data?.items || []).map((item) => ({ id: text(item.id), label: text(item.label),
      ...(text(item.description) ? { description: text(item.description) } : {}),
      ...(text(item.languageTag) ? { languageTag: text(item.languageTag) } : {}), target: structuredClone(item.target) })) };
}

export function validateAuxiliaryTarget(target) {
  if (target?.kind === "source_attachment") {
    return typeof target.sourceId === "string" && target.sourceId === target.sourceId.trim() && target.sourceId.length > 0 &&
      target.sourceId.length <= 240 && !hasControls(target.sourceId) &&
      Number.isSafeInteger(target.sourceRevision) && target.sourceRevision > 0 && /^[a-f0-9]{64}$/u.test(target.contentHash)
      ? [] : ["O PDF precisa de identidade lógica, revisão e hash válidos."];
  }
  if (target?.kind !== "url" || typeof target.url !== "string" || target.url !== target.url.trim() ||
      target.url.length > 2048 || hasControls(target.url, true)) return ["Informe uma URL completa HTTP ou HTTPS."];
  try {
    const url = new URL(target.url);
    if (!["http:", "https:"].includes(url.protocol) || url.username || url.password) return ["A URL deve ser HTTP ou HTTPS, sem credenciais."];
    if (/\/storage\/v1\/object\//u.test(url.pathname) || /^\/object\/(?:sign|authenticated)\//u.test(url.pathname)) {
      return ["Arquivos do curso usam uma referência lógica de PDF, nunca uma URL de Storage."];
    }
    return [];
  } catch { return ["Informe uma URL completa HTTP ou HTTPS."]; }
}

export function validateAuxiliaryLinks(data) {
  const errors = [];
  if (!text(data.title)) errors.push("A ferramenta precisa de um título legível.");
  if (new Set(data.items.map(({ id }) => id)).size !== data.items.length) errors.push("Os itens precisam de identidades distintas.");
  data.items.forEach((item, index) => {
    if (!text(item.id) || !text(item.label)) errors.push(`O item ${index + 1} precisa de identidade e rótulo legíveis.`);
    if (item.languageTag && !LANGUAGE.test(item.languageTag)) errors.push(`O idioma do item ${index + 1} é inválido.`);
    errors.push(...validateAuxiliaryTarget(item.target).map((message) => `Item ${index + 1}: ${message}`));
  });
  return errors;
}

export function renderAuxiliaryLinks(data) {
  return `<section class="runtime-block package-auxiliary-links"><h3>${renderPackageLiteral(data.title)}</h3>${data.prompt ? renderPackageProse(data.prompt) : ""}<ol>${data.items.map((item, index) => `<li><button type="button" data-tool-link-index="${index}"${item.languageTag ? ` lang="${escapePackageAttribute(item.languageTag)}"` : ""} dir="auto">${renderPackageLiteral(item.label)}</button>${item.description ? `<div class="package-tool-description" dir="auto">${renderPackageProse(item.description)}</div>` : ""}<p class="package-tool-status" data-tool-link-status="${index}" role="status" aria-live="polite" aria-atomic="true"></p></li>`).join("")}</ol></section>`;
}

export const auxiliaryLinksInteraction = Object.freeze({ bind(root, data, host) {
  bindings.get(root)?.();
  let active = true;
  const cleanups = [];
  root.querySelectorAll("[data-tool-link-index]").forEach((button) => {
    const index = Number(button.dataset.toolLinkIndex);
    const item = data.items[index];
    const status = root.querySelector(`[data-tool-link-status="${index}"]`);
    if (!item || !status) return;
    const open = async () => {
      if (!active || button.disabled) return;
      button.disabled = true; status.textContent = "Abrindo recurso…";
      try {
        if (validateAuxiliaryTarget(item.target).length) throw new Error("invalid_target");
        let result;
        if (item.target.kind === "url") {
          if (typeof host?.openExternalUrl !== "function") throw new Error("unavailable_host");
          result = await host.openExternalUrl(item.target.url);
        } else {
          if (typeof host?.openSourceAttachment !== "function") throw new Error("unavailable_host");
          const { sourceId, sourceRevision, contentHash } = item.target;
          result = await host.openSourceAttachment({ sourceId, sourceRevision, contentHash });
        }
        if (result === false) throw new Error("opening_failed");
        if (active) status.textContent = "Recurso aberto. Volte ao estudo quando terminar a consulta.";
      } catch {
        if (active) status.textContent = "Não foi possível abrir o recurso. Confira sua conexão e acesso e tente novamente pelo mesmo botão.";
      } finally { if (active) button.disabled = false; }
    };
    button.addEventListener("click", open);
    cleanups.push(() => { button.removeEventListener("click", open); button.disabled = false; });
  });
  const cleanup = () => {
    if (!active) return;
    active = false; cleanups.forEach((remove) => remove());
    if (bindings.get(root) === cleanup) bindings.delete(root);
  };
  bindings.set(root, cleanup); return cleanup;
} });

export function auxiliaryLinksAccessibleText(data) {
  return [data.title, data.prompt, ...data.items.map((item) => `${item.label}. ${item.description || ""}`)].filter(Boolean).join(" ");
}
export function auxiliaryLinksEditableTargets(data) {
  return [{ path: "title", label: "Editar título da ferramenta" }, ...(data.prompt ? [{ path: "prompt", label: "Editar orientação" }] : []),
    ...data.items.flatMap((item, index) => [{ path: `items[${index}].label`, label: `Editar rótulo do recurso ${index + 1}` },
      ...(item.description ? [{ path: `items[${index}].description`, label: `Editar orientação do recurso ${index + 1}` }] : [])])];
}
