const SHARED_BASIS_FIELDS = ['audience', 'planItems', 'studyUnits', 'dependencies', 'microsequence'];
const READING_GUIDANCE = 'Para cada alvo, leia basis e instruction do foco em auditoriasPedagogicas junto de sua auditoriaPedagogica.basis e units. As citações pertencem ao alvo. Use referenciaInspecao para registrar o parecer, sem reenviar a base.';

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
  return groups.length ? { ...projected, auditoriasPedagogicas: groups.map(group => group.shared),
    leituraDaAuditoria: READING_GUIDANCE } : context;
}
