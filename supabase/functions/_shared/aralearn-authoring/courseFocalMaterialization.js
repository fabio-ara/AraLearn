import { RESOURCE_PACKAGE_REGISTRY } from "../aralearn/runtime/resources/packages/index.js";
import { AuthoringApiError } from "./errors.js";

const plain = value => value && typeof value === "object" && !Array.isArray(value);
const key = value => String(value ?? "").normalize("NFC").trim().toLocaleLowerCase("pt-BR");
function fail(code, message, details) { throw new AuthoringApiError(422, code, message, details); }

// Component identities belong to one content object, not to the author's plan.
// Explicit identities are retained when another component refers to them.
export function completeHumanContent(value, { explanation = false } = {}) {
  if (!plain(value)) return value;
  const content = structuredClone(value);
  for (const slot of ["content", ...(explanation ? [] : ["feedback"])]) {
    if (content[slot] !== undefined && !Array.isArray(content[slot])) fail("human_content_shape",
      "Organize os componentes deste lugar em uma lista.", { slot });
  }
  const catalog = RESOURCE_PACKAGE_REGISTRY.listCatalog();
  const identities = new Set([...(content.content ?? []), ...(content.feedback ?? []), content.response]
    .filter(plain).map(entry => entry.id).filter(Boolean));
  const instance = (entry, slot, index) => {
    if (!plain(entry)) return entry;
    const matches = catalog.filter(item => item.slots.includes(slot) &&
      [item.id, item.id.replace(/^aralearn\.(resource|response)\./u, ""), item.label].some(name => key(name) === key(entry.package)) &&
      (entry.version === undefined || item.version === entry.version));
    const ids = new Set(matches.map(item => item.id));
    if (ids.size !== 1 || !matches.length) fail("human_component_not_found",
      "Escolha um componente do catálogo disponível para este lugar.", { slot, component: index + 1, package: entry.package });
    matches.sort((left, right) => right.version.localeCompare(left.version, "en", { numeric: true }));
    let id = entry.id;
    if (id === undefined) {
      let ordinal = index + 1;
      do { id = `${slot}-${ordinal++}`; } while (identities.has(id));
      identities.add(id);
    }
    return { ...entry, id, package: matches[0].id,
      version: entry.version ?? matches[0].version };
  };
  content.content = (content.content ?? []).map((entry, index) => instance(entry, "content", index));
  if (!explanation) {
    content.response = content.response ? instance(content.response, "response", 0) : null;
    content.feedback = (content.feedback ?? []).map((entry, index) => instance(entry, "feedback", index));
    content.role ??= content.response ? "practice" : "theory";
    content.topics ??= [];
  }
  return content;
}

function microReference(micros, reference) {
  const matches = micros.filter((micro, index) => Number.isSafeInteger(reference)
    ? Number(micro.productionPosition ?? micro.position ?? index) + 1 === reference
    : key(micro.title) === key(reference));
  if (matches.length !== 1) fail("human_materialization_focus_required",
    "Indique a microssequência pelo título inequívoco ou pela posição no recorte.");
  return matches[0];
}

// Parts remain operational groups. One request asks the model to reason about
// exactly one microsequence; the existing transactional backend may still batch.
export function completeFocalMaterialization(args, context, existing = []) {
  const parts = context.plan?.plan?.parts ?? [];
  const candidates = context.part?.microsequences ?? parts.flatMap(part => part.microsequences ?? []);
  const micros = [...new Map(candidates.map(micro => [micro.id, micro])).values()];
  const references = [args.microssequencia, ...(args.unidades ?? []).map(unit => unit.microssequencia),
    ...(args.explicacoes ?? []).map(entry => entry.microssequencia)].filter(value => value !== undefined);
  const selected = references.map(reference => microReference(micros, reference));
  if (!selected.length && micros.length === 1) selected.push(micros[0]);
  const identities = new Set(selected.map(micro => micro.id));
  if (identities.size !== 1) fail("human_materialization_focus_required",
    "Produza uma microssequência por chamada. A parte continua sendo o agrupamento de trabalho; não reduza seu conteúdo para caber aqui.");
  const micro = selected[0];
  const matchingParts = context.part ? [context.part] : parts.filter(part =>
    (part.microsequences ?? []).some(item => item.id === micro.id));
  if (matchingParts.length !== 1) fail("human_materialization_part_required",
    "A microssequência precisa pertencer a uma parte de autoria antes da produção.");
  const part = matchingParts[0];
  let nextPosition = existing.filter(item => item.curriculumPath?.didacticMicrosequence?.id === micro.id)
    .reduce((highest, item) => Math.max(highest, item.studyUnit.position), 0) + 1;
  const reservedPositions = new Set((args.unidades ?? []).map(unit => unit.posicao).filter(Number.isSafeInteger));
  const units = (args.unidades ?? []).map(unit => {
    const application = unit.aplicacaoPedagogica ?? {};
    if (unit.posicao === undefined) while (reservedPositions.has(nextPosition)) nextPosition += 1;
    const position = unit.posicao ?? nextPosition++;
    nextPosition = Math.max(nextPosition, position + 1);
    return { ...unit, microssequencia: micro.title, posicao: position,
      conteudo: completeHumanContent(unit.conteudo),
      aplicacaoPedagogica: { ...application, ideiasIntroduzidas: application.ideiasIntroduzidas ?? [],
        ideiasUtilizadas: application.ideiasUtilizadas ?? [], explicacoes: application.explicacoes ?? [],
        cobertura: application.cobertura ?? [], praticas: (application.praticas ?? []).map((practice, index) => ({
          ...practice, oportunidade: practice.oportunidade ?? `unidade-${position}-evidencia-${index + 1}`,
          dimensoesVariadas: practice.dimensoesVariadas ?? [] })) } };
  });
  const explanations = (args.explicacoes ?? []).map(entry => ({ ...entry, microssequencia: micro.title,
    conteudo: completeHumanContent(entry.conteudo, { explanation: true }) }));
  return { part, microsequence: micro, units, explanations };
}
