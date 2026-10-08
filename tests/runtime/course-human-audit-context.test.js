import test from 'node:test';
import assert from 'node:assert/strict';
import { shareHumanAuditContext } from '../../supabase/functions/_shared/aralearn-authoring/courseHumanAuditContext.js';
import { openHumanReadContinuation, paginateHumanReadContext } from '../../supabase/functions/_shared/aralearn-authoring/courseHumanReadContext.js';

const COURSE = { id: 'course-a', revision: 7 };
const literal = 'Texto literal: 😀 α /ɲ/ \\n "citação".\nOutra linha.';
function target(id, kind = 'study_unit', microsequenceId = 'ms-a') {
  return {
    referenciaInspecao: `opaque-inspection-${id}`, referenciaRevisao: `opaque-review-${id}`,
    inspecaoIA: { state: 'pending' }, extra: null,
    auditoriaPedagogica: {
      basis: { targetKind: kind, targetId: id, audience: null,
        microsequence: { id: microsequenceId, title: 'Mesmo título', goal: literal, explanation: null },
        planItems: [{ id: 'requirement', statement: literal }], dependencies: [],
        studyUnits: ['unit-z', 'unit-a'].map(unitId => ({ id: unitId,
          content: { title: unitId, content: [literal], response: null },
          design: { parameters: { before_and_after: true, variation: ['case', 'representation'] } },
          application: { declaration: null, unknown: { literal } } })),
        citations: [{ targetKind: kind, targetId: id, links: [{
          source: { title: id, url: `https://example.test/${id}`, verificationStatus: 'verified' },
          anchors: [{ selector: { kind: 'text_quote', exact: `${id}: ${literal}` },
            humanLocator: 'p. 3', verificationExcerpt: null, needsReverification: false }],
          occurrences: [{ quote: literal, prefix: '\n', suffix: '😀', start: 0, end: 17 }]
        }] }], unknownBasisField: { belongsTo: id, empty: null } },
      units: [{ unitId: id, issues: [], observation: { title: id, literal,
        requirements: [{ statement: 'Relacionar elementos', description: literal }],
        operation: ['Operação declarada'], question: 'Qual relação está correta?',
        alternatives: [{ text: literal, expected: true, feedback: 'Relação explicada.' }],
        studentContent: [{ text: literal }], targets: [], feedback: [], content: [literal]
      } }], instruction: 'Leia criticamente.',
      unknownAuditField: [null, literal]
    }
  };
}
function restore(context) {
  const restored = structuredClone(context);
  for (const target of [...(restored.studyUnits ?? []), ...(restored.explicacoes ?? [])]) {
    const audit = target.auditoriaPedagogica;
    if (!audit?.foco) continue;
    const shared = restored.auditoriasPedagogicas.find(item => item.foco === audit.foco);
    assert.ok(shared);
    audit.basis = { ...shared.basis, ...audit.basis };
    if (Object.hasOwn(shared, 'instruction')) audit.instruction = shared.instruction;
    if (Object.hasOwn(audit, 'citacoesDoFoco')) {
      audit.basis.citations = audit.citacoesDoFoco.map(position => {
        const citation = shared.citacoes[position - 1];
        assert.ok(citation, 'posição de citação resolvida no mesmo foco e página lógica');
        return citation;
      });
      delete audit.citacoesDoFoco;
    }
    if (!Object.hasOwn(audit, 'units') && Array.isArray(audit.unidadesParaConfronto)) {
      audit.units = audit.unidadesParaConfronto.map(position => {
        const unit = shared.unidadesParaConfronto[position - 1];
        const { declarado, tarefaApresentada, ...context } = unit.observation;
        return { ...unit, observation: { ...context, ...declarado, ...tarefaApresentada } };
      });
      delete audit.unidadesParaConfronto;
    }
    delete audit.foco;
  }
  delete restored.auditoriasPedagogicas;
  delete restored.leituraDaAuditoria;
  return restored;
}

test('base focal resolvida preserva todos os valores, campos adicionais, ordem e citações de cada alvo', () => {
  const original = { observations: null, studyUnits: [target('unit-z')],
    explicacoes: [target('ms-a', 'microsequence_explanation')], unknownContext: { literal } };
  const snapshot = structuredClone(original);
  const shared = shareHumanAuditContext(original, COURSE);
  assert.equal(shared.auditoriasPedagogicas.length, 1);
  assert.deepEqual(restore(shared), original);
  assert.deepEqual(original, snapshot, 'a base canônica recebida não é alterada');
  assert.deepEqual(shared.auditoriasPedagogicas[0].basis.studyUnits.map(unit => unit.id), ['unit-z', 'unit-a']);
  assert.equal(shared.auditoriasPedagogicas[0].basis.audience, null);
  assert.equal(shared.studyUnits[0].referenciaInspecao, original.studyUnits[0].referenciaInspecao);
  assert.equal(shared.explicacoes[0].referenciaRevisao, original.explicacoes[0].referenciaRevisao);
  for (const key of ['studyUnits', 'explicacoes']) {
    const audit = shared[key][0].auditoriaPedagogica;
    const foco = shared.auditoriasPedagogicas.find(item => item.foco === audit.foco);
    assert.equal(Object.hasOwn(audit.basis, 'citations'), false, 'a citação sai do basis local');
    assert.deepEqual(audit.citacoesDoFoco.map(position => foco.citacoes[position - 1]),
      original[key][0].auditoriaPedagogica.basis.citations, 'não unir fontes dos alvos');
    assert.deepEqual(audit.basis.unknownBasisField, original[key][0].auditoriaPedagogica.basis.unknownBasisField);
    assert.equal(Object.hasOwn(audit.basis, 'studyUnits'), false);
  }
  assert.match(shared.leituraDaAuditoria, /citações pertencem ao alvo/u);
  assert.match(shared.leituraDaAuditoria, /citacoesDoFoco no alvo indica posições/u);
  assert.match(shared.leituraDaAuditoria, /sem reenviar a base/u);
  assert.match(shared.leituraDaAuditoria, /operação declarada pelo autor/u);
  assert.match(shared.leituraDaAuditoria, /não uma operação efetiva calculada/u);
});

test('observações idênticas compartilham por unidade e base; declarado não vira operação efetiva', () => {
  const a = target('unit-a'), z = target('unit-z');
  const explanation = target('ms-a', 'microsequence_explanation');
  explanation.auditoriaPedagogica.units = [z, a, z].map(t => structuredClone(t.auditoriaPedagogica.units[0]));
  const input = { studyUnits: [a, z], explicacoes: [explanation] };
  const before = structuredClone(input);
  const output = shareHumanAuditContext(input, COURSE);
  const focus = output.auditoriasPedagogicas[0];
  assert.equal(focus.unidadesParaConfronto.length, 2);
  assert.deepEqual(output.studyUnits.map(t => t.auditoriaPedagogica.unidadesParaConfronto), [[1], [2]]);
  assert.deepEqual(output.explicacoes[0].auditoriaPedagogica.unidadesParaConfronto, [2, 1, 2]);
  const observation = focus.unidadesParaConfronto[0].observation;
  assert.deepEqual(observation.declarado, { requirements: a.auditoriaPedagogica.units[0].observation.requirements,
    operation: ['Operação declarada'] });
  assert.equal(observation.tarefaApresentada.question, 'Qual relação está correta?');
  assert.deepEqual(observation.tarefaApresentada.alternatives, a.auditoriaPedagogica.units[0].observation.alternatives);
  assert.equal(Object.hasOwn(observation, 'operation'), false);
  assert.equal(Object.hasOwn(observation.tarefaApresentada, 'operation'), false);
  assert.deepEqual(restore(output), input);
  assert.deepEqual(input, before);
});

test('mesmo texto não une unidades distintas; mesma unidade com observação diferente conserva a variante', () => {
  const a = target('unit-a'), z = target('unit-z'), changed = target('unit-a');
  z.auditoriaPedagogica.units[0].observation = structuredClone(a.auditoriaPedagogica.units[0].observation);
  changed.auditoriaPedagogica.units[0].observation.question = 'Outra pergunta literal.';
  const input = { studyUnits: [a, z, changed] };
  const output = shareHumanAuditContext(input, COURSE);
  assert.equal(output.auditoriasPedagogicas.length, 1);
  assert.equal(output.auditoriasPedagogicas[0].unidadesParaConfronto.length, 3);
  assert.deepEqual(output.studyUnits.map(t => t.auditoriaPedagogica.unidadesParaConfronto), [[1], [2], [3]]);
  assert.deepEqual(restore(output), input);
});

test('campos desconhecidos, histórico, pesquisa, null e ausência sobrevivem à ida e volta', () => {
  const a = target('unit-a'), explanation = target('ms-a', 'microsequence_explanation');
  const row = a.auditoriaPedagogica.units[0];
  row.extra = { historical: [null, literal] };
  row.observation.question = null;
  delete row.observation.content;
  row.observation.operation = null;
  row.observation.unrecognized = { literal, empty: null };
  a.auditoriaPedagogica.basis.studyUnits[0].design = { historical: null, parameters: {
    practice_position: { mode: 'fixed', value: 'before_and_after', origin: 'research_condition',
      reason: literal, sourceScope: { kind: 'didactic_microsequence', ref: 'ms-a' } }, unknown: null
  } };
  explanation.auditoriaPedagogica.basis.studyUnits = structuredClone(a.auditoriaPedagogica.basis.studyUnits);
  explanation.auditoriaPedagogica.units = [structuredClone(row)];
  const input = { studyUnits: [a], explicacoes: [explanation] };
  const output = shareHumanAuditContext(input, COURSE);
  assert.equal(output.auditoriasPedagogicas[0].unidadesParaConfronto.length, 1);
  assert.deepEqual(restore(output), input);
  const obs = output.auditoriasPedagogicas[0].unidadesParaConfronto[0].observation;
  assert.equal(obs.declarado.operation, null);
  assert.equal(obs.tarefaApresentada.question, null);
  assert.equal(Object.hasOwn(obs.tarefaApresentada, 'content'), false);
});

test('observações sem identidade ou com nomes já ocupados continuam locais sem perda', () => {
  const entries = [target('missing'), target('null'), target('occupied'), target('empty')];
  delete entries[0].auditoriaPedagogica.units[0].unitId;
  entries[1].auditoriaPedagogica.units[0].observation = null;
  entries[2].auditoriaPedagogica.units[0].observation.declarado = { literal };
  entries[3].auditoriaPedagogica.units = [];
  const input = { studyUnits: entries };
  const output = shareHumanAuditContext(input, COURSE);
  assert.ok(output.studyUnits.every(t => !Object.hasOwn(t.auditoriaPedagogica, 'unidadesParaConfronto')));
  assert.equal(Object.hasOwn(output.auditoriasPedagogicas[0], 'unidadesParaConfronto'), false);
  assert.deepEqual(restore(output), input);
});

test('mesmo título não junta identidades, bases ou instruções diferentes', () => {
  const a = target('unit-a');
  const b = target('unit-b', 'study_unit', 'ms-b');
  const differentBase = target('unit-c');
  differentBase.auditoriaPedagogica.basis.studyUnits[0].application.declaration = { practice: true };
  const differentInstruction = target('unit-d');
  differentInstruction.auditoriaPedagogica.instruction = 'Outra instrução.';
  const input = { studyUnits: [a, b, differentBase, differentInstruction],
    explicacoes: [target('ms-a', 'microsequence_explanation'), target('ms-b', 'microsequence_explanation', 'ms-b')] };
  const output = shareHumanAuditContext(input, COURSE);
  assert.deepEqual(output.studyUnits.map(item => item.auditoriaPedagogica.foco), [1, 2, 3, 4]);
  assert.deepEqual(output.explicacoes.map(item => item.auditoriaPedagogica.foco), [1, 2]);
  assert.deepEqual(restore(output), input);
});

test('ausência, null e representação literal distinta não são normalizados para compartilhar', () => {
  const missing = target('missing');
  delete missing.auditoriaPedagogica.basis.audience;
  delete missing.auditoriaPedagogica.instruction;
  const nullInstruction = target('null-instruction');
  nullInstruction.auditoriaPedagogica.instruction = null;
  const reordered = target('reordered');
  reordered.auditoriaPedagogica.basis.microsequence = {
    title: 'Mesmo título', id: 'ms-a', goal: literal, explanation: null
  };
  const input = { studyUnits: [target('present'), missing, nullInstruction, reordered] };
  const output = shareHumanAuditContext(input, COURSE);
  assert.equal(output.auditoriasPedagogicas.length, 4);
  assert.deepEqual(restore(output), input);
});

test('sem identidade interna não agrupa por título; cada página, chamada e revisão tem base própria', () => {
  const unidentified = target('unit-a');
  delete unidentified.auditoriaPedagogica.basis.microsequence.id;
  const noIdentity = { studyUnits: [unidentified] };
  assert.deepEqual(shareHumanAuditContext(noIdentity, COURSE), noIdentity);
  assert.deepEqual(shareHumanAuditContext({ explicacoes: [] }, COURSE), { explicacoes: [] });
  for (const course of [COURSE, { ...COURSE, revision: 8 }, { ...COURSE, id: 'course-b' }]) {
    const page = { studyUnits: [target('unit-a', 'study_unit', 'ms-page-2')] };
    const shared = shareHumanAuditContext(page, course);
    assert.equal(shared.studyUnits[0].auditoriaPedagogica.foco, 1);
    assert.equal(shared.auditoriasPedagogicas[0].basis.microsequence.id, 'ms-page-2');
    assert.deepEqual(restore(shared), page);
  }
});

test('paginação real do foco conserva digest, fragmentos literais e limites do envelope', async () => {
  const input = { studyUnits: [target('unit-a')], explicacoes: [target('ms-a', 'microsequence_explanation')] };
  for (const entry of [...input.studyUnits, ...input.explicacoes]) {
    entry.auditoriaPedagogica.basis.microsequence.explanation = { text: literal.repeat(500) };
  }
  const context = shareHumanAuditContext(input, COURSE);
  const initial = await openHumanReadContinuation({ args: {}, course: COURSE, task: 'preparar_revisao' });
  let state = initial, json = '', count = 0;
  for (;;) {
    const page = await paginateHumanReadContext(context, { state });
    assert.ok(JSON.stringify(page).length <= 12_000);
    assert.ok(Buffer.byteLength(JSON.stringify(page)) <= 16 * 1024);
    assert.equal(page.fragmento.inicio, json.length);
    json += page.fragmento.texto;
    count++;
    if (!page.continuacao) break;
    state = await openHumanReadContinuation({ args: { continuacao: page.continuacao }, course: COURSE, task: 'preparar_revisao' });
    if (count === 1) {
      const changed = structuredClone(context);
      changed.auditoriasPedagogicas[0].basis.studyUnits[0].application.declaration = {};
      await assert.rejects(() => paginateHumanReadContext(changed, { state }), { code: 'human_read_context_changed' });
      for (const course of [{ ...COURSE, revision: 8 }, { ...COURSE, id: 'course-b' }]) {
        await assert.rejects(() => openHumanReadContinuation({ args: { continuacao: page.continuacao },
          course, task: 'preparar_revisao' }), { code: 'human_read_context_changed' });
      }
    }
  }
  assert.ok(count > 1);
  assert.deepEqual(restore(JSON.parse(json)), input);
});

// --- Citações: referência posicional por foco ---------------------------------

test('citations ausente, null, vazio ou inesperado permanece intacto e não cria registry', () => {
  const missing = target('missing');
  delete missing.auditoriaPedagogica.basis.citations;
  const nullValue = target('null-value');
  nullValue.auditoriaPedagogica.basis.citations = null;
  const empty = target('empty');
  empty.auditoriaPedagogica.basis.citations = [];
  const unexpected = target('unexpected');
  unexpected.auditoriaPedagogica.basis.citations = { nota: literal };
  const textValue = target('text-value');
  textValue.auditoriaPedagogica.basis.citations = literal;
  const input = { studyUnits: [missing, nullValue, empty, unexpected, textValue] };
  const output = shareHumanAuditContext(input, COURSE);
  assert.equal(Object.hasOwn(output.auditoriasPedagogicas[0], 'citacoes'), false,
    'nenhum registry é publicado sem array válido e não vazio');
  const expected = [undefined, null, [], { nota: literal }, literal];
  input.studyUnits.forEach((entry, index) => {
    const audit = output.studyUnits[index].auditoriaPedagogica;
    assert.equal(Object.hasOwn(audit, 'citacoesDoFoco'), false, 'sem posições para representação inválida');
    assert.equal(Object.hasOwn(audit.basis, 'citations'), expected[index] !== undefined);
    if (expected[index] !== undefined) assert.deepEqual(audit.basis.citations, expected[index]);
  });
  assert.deepEqual(restore(output), input);
});

test('ordem, repetições e fronteira entre focos sobrevivem à referência posicional', () => {
  const a = target('unit-a');
  const b = target('unit-b');
  const other = target('unit-c', 'study_unit', 'ms-b');
  const first = a.auditoriaPedagogica.basis.citations[0];
  const second = b.auditoriaPedagogica.basis.citations[0];
  a.auditoriaPedagogica.basis.citations = [first, second, first];
  b.auditoriaPedagogica.basis.citations = [second, first];
  const input = { studyUnits: [a, b, other] };
  const output = shareHumanAuditContext(input, COURSE);
  assert.equal(output.auditoriasPedagogicas.length, 2, 'microssequências distintas não compartilham foco');
  const [primeiro, segundo] = output.auditoriasPedagogicas;
  assert.equal(primeiro.citacoes.length, 2, 'deduplicação por objeto completo dentro do foco');
  assert.deepEqual(output.studyUnits[0].auditoriaPedagogica.citacoesDoFoco, [1, 2, 1], 'ordem e repetição do alvo');
  assert.deepEqual(output.studyUnits[1].auditoriaPedagogica.citacoesDoFoco, [2, 1], 'ordem própria do segundo alvo');
  assert.equal(segundo.citacoes.length, 1, 'foco distinto tem registry próprio');
  assert.deepEqual(output.studyUnits[2].auditoriaPedagogica.citacoesDoFoco, [1], 'posições reiniciam no foco');
  assert.notEqual(output.studyUnits[0].auditoriaPedagogica.foco, output.studyUnits[2].auditoriaPedagogica.foco);
  assert.deepEqual(restore(output), input);
});

test('reaplicar a projeção é idempotente e não reescreve a página já compartilhada', () => {
  const input = { studyUnits: [target('unit-a'), target('unit-b')],
    explicacoes: [target('ms-a', 'microsequence_explanation')] };
  const once = shareHumanAuditContext(input, COURSE);
  assert.equal(shareHumanAuditContext(once, COURSE), once, 'segunda passada devolve a mesma referência');
  assert.deepEqual(shareHumanAuditContext(structuredClone(once), COURSE), once, 'mesma forma por valor');
  assert.equal(Object.hasOwn(once.auditoriasPedagogicas[0], 'citacoes'), true);
  assert.ok(once.studyUnits.every(entry => Array.isArray(entry.auditoriaPedagogica.citacoesDoFoco)));
});

const AUDIT_DIMENSIONS = ['alignment', 'evidence', 'representation', 'feedback', 'citations', 'configuration'];
const ASTRAL = String.fromCodePoint(0x1F600) + String.fromCodePoint(0x1D518, 0x1D52B, 0x1D526);
function volumePool(poolSize, pad) {
  return Array.from({ length: poolSize }, (_, index) => ({
    targetKind: 'study_unit', targetId: 'unit-' + (index + 1), targetTitle: 'Unidade ' + (index + 1),
    bibliography: index % 2 ? 'abnt-2025' : 'apa-7',
    links: Array.from({ length: 4 }, (_, link) => ({
      relation: 'supported_by', roles: ['evidence'],
      source: { title: 'Fonte ' + (index + 1) + '-' + (link + 1),
        url: 'https://example.test/' + (index + 1) + '/' + (link + 1),
        citationText: 'Citação '.repeat(pad) + ASTRAL },
      anchors: [{ selector: { kind: 'text_quote', exact: 'trecho '.repeat(pad) + ASTRAL },
        humanLocator: 'p. ' + (link + 1), verificationExcerpt: null, needsReverification: false }],
      occurrences: [{ quote: 'ocorrência '.repeat(pad) + String.fromCodePoint(0x1F600),
        prefix: '', suffix: '', start: 0, end: pad }]
    }))
  }));
}
function volumeTarget(id, kind, msId, pool, picks) {
  const entry = target(id, kind, msId);
  entry.auditoriaPedagogica.basis.citations = picks.map(index => structuredClone(pool[index % pool.length]));
  entry.inspecaoIA = { state: 'current', dimensoesAtuaisCompletas: true,
    report: { outcome: 'consistent', checks: AUDIT_DIMENSIONS.map(dimension => ({ dimension, result: 'sufficient' })) } };
  return entry;
}
async function joinFragments(context) {
  let state = await openHumanReadContinuation({ args: {}, course: COURSE, task: 'preparar_revisao' });
  const parts = [];
  let fragments = 0;
  for (;;) {
    const page = await paginateHumanReadContext(context, { state });
    if (!page.fragmento) { parts.push(JSON.stringify(page)); break; }
    parts.push(page.fragmento.texto);
    fragments += 1;
    if (!page.continuacao) break;
    state = await openHumanReadContinuation({ args: { continuacao: page.continuacao },
      course: COURSE, task: 'preparar_revisao' });
  }
  return { text: parts.join(''), fragments };
}

// Baseline REAL desta mudança é a projeção ANTERIOR (db79f9d6): mesma base compartilhada, citações
// inline no alvo. inlineCitationSharing retira SOMENTE o novo passo; nada mais da projeção muda.
function inlineCitationSharing(projected) {
  const resolved = structuredClone(projected);
  if (!Array.isArray(resolved.auditoriasPedagogicas)) return resolved;
  for (const key of ['studyUnits', 'explicacoes']) {
    for (const target of resolved[key] ?? []) {
      const audit = target.auditoriaPedagogica;
      if (!Array.isArray(audit?.citacoesDoFoco)) continue;
      const focus = resolved.auditoriasPedagogicas.find(item => item.foco === audit.foco);
      audit.basis.citations = audit.citacoesDoFoco.map(position => focus.citacoes[position - 1]);
      delete audit.citacoesDoFoco;
    }
  }
  for (const record of resolved.auditoriasPedagogicas) delete record.citacoes;
  return resolved;
}

test('contexto sintético volumoso (8 unidades + Explicação, 5+3) mede só o delta das citações', async (t) => {
  const pad = 110;
  const picks = [0, 3, 6, 9, 1, 4, 7, 10];
  const poolOne = volumePool(12, pad);
  const poolTwo = volumePool(12, pad);
  const pageOne = { alcanceDaAuditoria: { escopo: 'unidades_selecionadas' }, observations: [],
    studyUnits: Array.from({ length: 5 }, (_, index) => volumeTarget('unit-' + (index + 1), 'study_unit',
      'ms-volume', poolOne, picks.map(pick => pick + index))),
    explicacoes: [volumeTarget('exp-volume', 'microsequence_explanation', 'ms-volume', poolOne, picks)] };
  const pageTwo = { alcanceDaAuditoria: { escopo: 'unidades_selecionadas' }, observations: [],
    studyUnits: Array.from({ length: 3 }, (_, index) => volumeTarget('unit-' + (index + 6), 'study_unit',
      'ms-volume', poolTwo, picks.map(pick => pick + index))),
    explicacoes: [] };
  const targetCount = page => page.studyUnits.length + (page.explicacoes?.length ?? 0);
  assert.equal(targetCount(pageOne) + targetCount(pageTwo), 9, '8 unidades + Explicação em duas páginas 5+3');
  const sixDimensions = page => [...page.studyUnits, ...(page.explicacoes ?? [])]
    .every(entry => entry.inspecaoIA.report.checks.length === 6);
  assert.ok(sixDimensions(pageOne) && sixDimensions(pageTwo), 'seis dimensões por alvo');

  const measure = async (page) => {
    const current = shareHumanAuditContext(page, COURSE);
    const previous = inlineCitationSharing(current);
    assert.ok(previous.studyUnits.every(entry => Object.hasOwn(entry.auditoriaPedagogica.basis, 'citations')),
      'baseline mantém as citações inline no basis do alvo, como a projeção anterior');
    assert.ok(previous.studyUnits.every(entry => !Object.hasOwn(entry.auditoriaPedagogica, 'citacoesDoFoco')));
    assert.ok(previous.auditoriasPedagogicas.every(record => !Object.hasOwn(record, 'citacoes')));
    assert.ok(current.studyUnits.every(entry => Array.isArray(entry.auditoriaPedagogica.citacoesDoFoco)));
    const previousBytes = Buffer.byteLength(JSON.stringify(previous), 'utf8');
    const currentBytes = Buffer.byteLength(JSON.stringify(current), 'utf8');
    // Mesmo protocolo nas duas formas: 1 warmup + melhor de 2 medições.
    const timing = async (context) => {
      let best = Infinity;
      let fragments = 0;
      for (let run = 0; run < 3; run += 1) {
        const started = performance.now();
        const joined = await joinFragments(context);
        fragments = joined.fragments;
        if (run > 0) best = Math.min(best, performance.now() - started);
      }
      return { ms: Number(best.toFixed(1)), fragments };
    };
    const previousTiming = await timing(previous);
    const currentTiming = await timing(current);
    const joined = await joinFragments(current);
    assert.deepEqual(inlineCitationSharing(JSON.parse(joined.text)), previous,
      'reidratação devolve a projeção anterior; só o novo passo é retirado');
    assert.deepEqual(restore(JSON.parse(joined.text)), page, 'ida e volta reconstrói o contexto de entrada');
    assert.ok(joined.text.includes(ASTRAL), 'Unicode astral preservado no recorte literal');
    return { previousBytes, currentBytes, previousMs: previousTiming.ms, currentMs: currentTiming.ms,
      previousFragments: previousTiming.fragments, currentFragments: currentTiming.fragments,
      storedOnce: current.auditoriasPedagogicas.reduce((sum, record) => sum + (record.citacoes?.length ?? 0), 0),
      bibliographies: new Set(current.auditoriasPedagogicas
        .flatMap(record => (record.citacoes ?? []).map(citation => citation.bibliography))).size };
  };

  const first = await measure(pageOne);
  const second = await measure(pageTwo);
  const totalPrevious = first.previousBytes + second.previousBytes;
  const totalCurrent = first.currentBytes + second.currentBytes;
  const occurrences = [...pageOne.studyUnits, ...pageOne.explicacoes, ...pageTwo.studyUnits]
    .reduce((sum, entry) => sum + entry.auditoriaPedagogica.basis.citations.length, 0);
  const storedOnce = first.storedOnce + second.storedOnce;
  // Delta contra a projeção ANTERIOR (mesma base compartilhada, citações inline) — não contra o cru.
  t.diagnostic('delta-citacoes ' + JSON.stringify({ totalPrevious, totalCurrent, occurrences, storedOnce,
    reductionPercentAgainstPrevious: Number(((1 - totalCurrent / totalPrevious) * 100).toFixed(2)), first, second }));
  assert.ok(totalPrevious > 700000, 'contexto sintético volumoso (' + totalPrevious + ' B); não é curso real');
  assert.ok(totalCurrent < totalPrevious, 'só o novo compartilhamento de citações reduz o payload');
  assert.ok(storedOnce < occurrences, 'citações repetidas passam a ser guardadas uma vez');
  assert.ok(first.bibliographies + second.bibliographies >= 4, 'bibliografia distinta por foco');
});

test('interrupção no meio do recorte retoma em nova execução com o mesmo cursor opaco', async () => {
  const input = { studyUnits: [target('unit-a')], explicacoes: [target('ms-a', 'microsequence_explanation')] };
  for (const entry of [...input.studyUnits, ...input.explicacoes]) {
    entry.auditoriaPedagogica.basis.microsequence.explanation = { text: literal.repeat(400) };
  }
  const context = shareHumanAuditContext(input, COURSE);
  const start = await openHumanReadContinuation({ args: {}, course: COURSE, task: 'preparar_revisao' });
  const first = await paginateHumanReadContext(context, { state: start });
  assert.ok(first.fragmento && first.continuacao, 'a página lógica exige continuação');
  const repeated = await paginateHumanReadContext(context, { state: start });
  assert.equal(repeated.fragmento.texto, first.fragmento.texto, 'releitura determinística não avança sozinha');
  let state = await openHumanReadContinuation({ args: { continuacao: first.continuacao },
    course: COURSE, task: 'preparar_revisao' });
  let json = first.fragmento.texto;
  let fragments = 1;
  for (;;) {
    const page = await paginateHumanReadContext(context, { state });
    assert.equal(page.fragmento.inicio, json.length, 'retomada continua exatamente onde parou');
    json += page.fragmento.texto;
    fragments += 1;
    if (!page.continuacao) break;
    state = await openHumanReadContinuation({ args: { continuacao: page.continuacao },
      course: COURSE, task: 'preparar_revisao' });
  }
  assert.ok(fragments > 2, 'a retomada atravessa mais de um fragmento');
  assert.deepEqual(restore(JSON.parse(json)), input, 'retomada em nova execução reconstrói a página anterior');
  await assert.rejects(() => openHumanReadContinuation({ args: { continuacao: first.continuacao },
    course: { ...COURSE, revision: 8 }, task: 'preparar_revisao' }), { code: 'human_read_context_changed' });
  await assert.rejects(() => openHumanReadContinuation({ args: { continuacao: first.continuacao.slice(0, -2) + 'zz' },
    course: COURSE, task: 'preparar_revisao' }), { code: 'invalid_read_continuation' });
});
