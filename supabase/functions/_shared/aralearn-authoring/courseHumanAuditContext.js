import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from '../aralearn/runtime/domain/courseDesignParameters.js';

const SHARED_BASIS_FIELDS = ['audience', 'planItems', 'studyUnits', 'dependencies', 'microsequence'];
const READING_GUIDANCE = 'Para cada alvo, leia basis, instruction e definicoesDosParametros do foco em auditoriasPedagogicas junto de sua auditoriaPedagogica.basis e units. O campo identifica a definição do parâmetro neste mesmo foco, sem consulta adicional. As citações pertencem ao alvo. Use referenciaInspecao para registrar o parecer, sem reenviar a base.';

export function humanParameterLabel(parameterId, definitionById) {
  const definition = definitionById?.get(parameterId) ??
    COURSE_DESIGN_PARAMETER_DEFINITIONS.find(({ id }) => id === parameterId);
  if (!definition?.label) return parameterId;
  return definition.label.replace(/\bUnidades?\b/gu, term => term.toLocaleLowerCase('pt-BR'));
}

export function projectHumanAppliedParameters(parameters, definitions = null) {
  if (!Array.isArray(parameters) || !parameters.every(parameter =>
    parameter && typeof parameter.parameterId === 'string' && Object.hasOwn(parameter, 'value'))) return parameters;
  return parameters.map(({ parameterId, ...parameter }) => {
    const definition = COURSE_DESIGN_PARAMETER_DEFINITIONS.find(item => item.id === parameterId);
    const name = { nome: humanParameterLabel(parameterId), campo: definition?.humanField ?? parameterId };
    const meaning = definition ? { definicao: { construto: definition.construct,
      operacionalizacao: definition.operationalization, limites: definition.limitations } } : {};
    if (definition && definitions) definitions.set(parameterId, { ...name, ...meaning });
    return { ...parameter, ...name, ...(definitions ? {} : meaning) };
  });
}

function projectDesign(design, definitions) {
  if (!design || !Array.isArray(design.parameters)) return design;
  return { ...design, parameters: projectHumanAppliedParameters(design.parameters, definitions) };
}

// Share only the human read representation, while internal identities are still
// available. Canonical inspection bases and opaque target references stay intact.
// The registry belongs to this logical page, never to a session or continuation.
export function shareHumanAuditContext(context, course) {
  const groups = [];
  function projectTarget(target) {
    const audit = target.auditoriaPedagogica;
    const microsequenceId = audit?.basis?.microsequence?.id;
    if (typeof microsequenceId !== 'string' || !microsequenceId || Object.hasOwn(audit, 'foco')) return target;
    const basis = Object.fromEntries(SHARED_BASIS_FIELDS.filter(key => Object.hasOwn(audit.basis, key))
      .map(key => [key, audit.basis[key]]));
    const shared = { basis, ...(Object.hasOwn(audit, 'instruction') ? { instruction: audit.instruction } : {}) };
    const identity = JSON.stringify([course.id, course.revision, microsequenceId]);
    const literal = JSON.stringify(shared);
    let group = groups.find(item => item.identity === identity && item.literal === literal);
    if (!group) {
      group = { identity, literal, shared: { foco: groups.length + 1, ...shared } };
      groups.push(group);
    }
    const local = { ...audit };
    delete local.instruction;
    return { ...target, auditoriaPedagogica: { ...local,
      basis: Object.fromEntries(Object.entries(audit.basis).filter(([key]) => !SHARED_BASIS_FIELDS.includes(key))),
      foco: group.shared.foco } };
  }
  const projected = { ...context };
  for (const key of ['studyUnits', 'explicacoes']) {
    if (Array.isArray(context[key])) projected[key] = context[key].map(projectTarget);
  }
  // Group on canonical identity and exact basis first. Enrich only the known
  // design paths; resource envelopes, citations and canonical bases stay intact.
  for (const group of groups) {
    const definitions = new Map();
    const basis = group.shared.basis;
    if (Array.isArray(basis.studyUnits)) group.shared.basis = { ...basis,
      studyUnits: basis.studyUnits.map(unit => Object.hasOwn(unit, 'design')
        ? { ...unit, design: projectDesign(unit.design, definitions) } : unit) };
    for (const key of ['studyUnits', 'explicacoes']) {
      if (!Array.isArray(projected[key])) continue;
      projected[key] = projected[key].map(target => target.auditoriaPedagogica?.foco === group.shared.foco && Object.hasOwn(target, 'designSnapshot')
        ? { ...target, designSnapshot: projectDesign(target.designSnapshot, definitions) } : target);
    }
    if (definitions.size) group.shared.definicoesDosParametros = [...definitions.values()];
  }
  return groups.length ? { ...projected, auditoriasPedagogicas: groups.map(group => group.shared),
    leituraDaAuditoria: READING_GUIDANCE } : context;
}
