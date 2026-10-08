import { COURSE_DESIGN_PARAMETER_DEFINITIONS } from '../aralearn/runtime/domain/courseDesignParameters.js';
import { canonicalAuthoringValue } from '../aralearn/runtime/domain/courseAuthoringBasis.js';

const SHARED_BASIS_FIELDS = ['audience', 'planItems', 'studyUnits', 'dependencies', 'microsequence'];
// Citations are shared by position inside the same focus, exactly like unidadesParaConfronto.
// The registry is page-local and never crosses focuses, pages or continuations.
// BASIS_CITATIONS_FIELD is the canonical field inside the target basis; the registry that
// replaces it lives under CITATIONS_REGISTRY_FIELD in the focus record.
const BASIS_CITATIONS_FIELD = 'citations';
const CITATIONS_REGISTRY_FIELD = 'citacoes';
const CITATION_POSITIONS_FIELD = 'citacoesDoFoco';
const READING_GUIDANCE = 'Para cada alvo, leia basis, instruction e definicoesDosParametros do foco em auditoriasPedagogicas junto de sua auditoriaPedagogica.basis. unidadesParaConfronto no alvo indica posições, começando em 1, na lista de mesmo nome do foco; units, quando presente, permanece local. Em observation, declarado contém requisitos e operação declarada pelo autor; tarefaApresentada contém enunciado, alternativas, respostas previstas e feedback, não uma operação efetiva calculada. Os demais campos conservam contexto e indícios. O campo identifica a definição do parâmetro neste mesmo foco, sem consulta adicional. As citações pertencem ao alvo: citacoesDoFoco no alvo indica posições, começando em 1, na lista citacoes do foco, preservando a ordem e as repetições. Use referenciaInspecao para registrar o parecer, sem reenviar a base.';
const TASK_OBSERVATION_FIELDS = ['question', 'response', 'selectionMode', 'options', 'correctAlternativeCount',
  'alternatives', 'targets', 'studentContent', 'feedback', 'content'];

function shareUnitObservations(audit, group) {
  if (Object.hasOwn(audit, 'unidadesParaConfronto') || !Array.isArray(audit.units) || !audit.units.length ||
    !audit.units.every(unit => typeof unit?.unitId === 'string' && unit.unitId &&
      unit.observation && typeof unit.observation === 'object' && !Array.isArray(unit.observation) &&
      !Object.hasOwn(unit.observation, 'declarado') && !Object.hasOwn(unit.observation, 'tarefaApresentada'))) return audit;
  const positions = audit.units.map(unit => {
    const literal = JSON.stringify(unit);
    let index = group.observations.findIndex(item => item.unitId === unit.unitId && item.literal === literal);
    if (index < 0) {
      const observation = { ...unit.observation };
      const take = fields => Object.fromEntries(fields.filter(key => Object.hasOwn(observation, key)).map(key => {
        const value = observation[key];
        delete observation[key];
        return [key, value];
      }));
      const declarado = take(['requirements', 'operation']);
      const tarefaApresentada = take(TASK_OBSERVATION_FIELDS);
      index = group.observations.length;
      group.observations.push({ unitId: unit.unitId, literal });
      (group.shared.unidadesParaConfronto ??= []).push({ ...unit,
        observation: { ...observation, declarado, tarefaApresentada } });
    }
    return index + 1;
  });
  const local = { ...audit };
  delete local.units;
  return { ...local, unidadesParaConfronto: positions };
}

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
// Citations travel as page-local positions, mirroring unidadesParaConfronto; the
// project canonicalizer gives identity, so no parallel form is introduced.
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
      group = { identity, literal, observations: [], shared: { foco: groups.length + 1, ...shared } };
      groups.push(group);
    }
    const local = shareUnitObservations({ ...audit }, group);
    delete local.instruction;
    // Only a valid, non-empty array is repositioned. Absent, null, empty or any
    // unexpected representation must survive untouched.
    let citacoesDoFoco = null;
    if (Array.isArray(audit.basis[BASIS_CITATIONS_FIELD]) && audit.basis[BASIS_CITATIONS_FIELD].length) {
      group.citations ??= { positions: new Map(), list: [] };
      citacoesDoFoco = audit.basis[BASIS_CITATIONS_FIELD].map(citation => {
        const key = canonicalAuthoringValue(citation);
        if (!group.citations.positions.has(key)) {
          group.citations.positions.set(key, group.citations.list.length + 1);
          group.citations.list.push(citation);
        }
        return group.citations.positions.get(key);
      });
    }
    return { ...target, auditoriaPedagogica: { ...local,
      basis: Object.fromEntries(Object.entries(audit.basis).filter(([key]) =>
        !SHARED_BASIS_FIELDS.includes(key) && (key !== BASIS_CITATIONS_FIELD || citacoesDoFoco === null))),
      ...(citacoesDoFoco === null ? {} : { [CITATION_POSITIONS_FIELD]: citacoesDoFoco }),
      foco: group.shared.foco } };
  }
  const projected = { ...context };
  for (const key of ['studyUnits', 'explicacoes']) {
    if (Array.isArray(context[key])) projected[key] = context[key].map(projectTarget);
  }
  // Group on canonical identity and exact basis first. Enrich only the known
  // design paths; resource envelopes and canonical bases stay intact, and the
  // per-focus citation registry is published alongside the shared basis.
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
    if (group.citations?.list.length) group.shared[CITATIONS_REGISTRY_FIELD] = group.citations.list;
  }
  return groups.length ? { ...projected, auditoriasPedagogicas: groups.map(group => group.shared),
    leituraDaAuditoria: READING_GUIDANCE } : context;
}
