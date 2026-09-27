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
      units: [{ observation: { title: id, literal } }], instruction: 'Leia criticamente.',
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
    assert.equal(audit.basis.citations.length, 1, 'não unir fontes dos alvos');
    assert.deepEqual(audit.basis.citations, original[key][0].auditoriaPedagogica.basis.citations);
    assert.deepEqual(audit.basis.unknownBasisField, original[key][0].auditoriaPedagogica.basis.unknownBasisField);
    assert.equal(Object.hasOwn(audit.basis, 'studyUnits'), false);
  }
  assert.match(shared.leituraDaAuditoria, /citações pertencem ao alvo/u);
  assert.match(shared.leituraDaAuditoria, /sem reenviar a base/u);
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
