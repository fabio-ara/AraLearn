// Issue 469: eliminar só duplicatas exatas na projeção humana da auditoria.
// Round-trip determinístico reconstrói o original; nada de suite ampla aqui.
import test from 'node:test';
import assert from 'node:assert/strict';
import { executeHumanCourseTask } from '../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js';
import { shareHumanAuditContext } from '../../supabase/functions/_shared/aralearn-authoring/courseHumanAuditContext.js';
import { openHumanReadContinuation, paginateHumanReadContext } from '../../supabase/functions/_shared/aralearn-authoring/courseHumanReadContext.js';
import { sha256Hex } from '../../supabase/functions/_shared/aralearn-authoring/security.js';
import { defaultAuthoringProcessPreferences } from '../../src/domain/authoringProcessPreferences.js';
import { normalizeMicrosequenceExplanation } from '../../src/domain/courseExplanation.js';
import { focusOf, resolveCitation, resolveLinkSource, resolveUnit } from '../support/auditProjection.js';

const COURSE = { id: '1a000000-0000-4000-8000-000000000469', revision: 3 };
const TEXT = 'Abertura literal do alvo 😀 α com relação explicada.';
const SOURCE_A = { title: 'Fonte A', citationText: 'A. Obra.', url: 'https://example.test/a', status: 'active' };
const SOURCE_B = { title: 'Fonte B', citationText: 'B. Obra.', url: 'https://example.test/b', status: 'active' };
const INICIO_REMISSION_PATH = 'tarefaApresentada.studentContent[0].text';

// Bytes UTF-8 sem depender de Buffer do Node: a mesma medida usada pelo produto.
const utf8Bytes = value => new TextEncoder().encode(JSON.stringify(value)).byteLength;

function observation(overrides = {}) {
  return { title: 'Unidade', studentContent: [{ component: 'aralearn.resource.paragraph', text: TEXT }],
    content: [TEXT], feedback: [], ...overrides };
}

function citation(targetId, source, extra = {}) {
  return { targetKind: 'study_unit', targetId, targetTitle: `Alvo ${targetId}`,
    links: [{ relation: 'informed_by', anchors: [{ selector: { kind: 'page_range', from: 3, to: 4 } }],
      source: structuredClone(source) }], ...extra };
}

function target(id, { microsequenceId = 'ms-a', citations = [], observation: obs } = {}) {
  return { referenciaInspecao: `opaque-${id}`, auditoriaPedagogica: {
    basis: { targetKind: 'study_unit', targetId: id, audience: null,
      microsequence: { id: microsequenceId, title: 'MS', goal: 'Relacionar.', explanation: null },
      planItems: [], dependencies: [], studyUnits: [], citations },
    units: [{ unitId: id, issues: [], observation: obs ?? observation() }], instruction: 'Leia criticamente.' } };
}

// Expansão de TODA a projeção: posições de unidade, citação e fonte no mesmo
// foco, mais a abertura remitida. Determinística e sem tocar a entrada.
function expand(context) {
  const expanded = structuredClone(context);
  for (const key of ['studyUnits', 'explicacoes']) {
    for (const item of expanded[key] ?? []) {
      const audit = item.auditoriaPedagogica;
      if (!audit?.foco) continue;
      const focus = focusOf(expanded, audit.foco);
      assert.ok(focus, 'foco resolvido na mesma página lógica');
      audit.basis = { ...focus.basis, ...audit.basis };
      if (Object.hasOwn(focus, 'instruction')) audit.instruction = focus.instruction;
      if (Array.isArray(audit.citacoesDoFoco)) {
        audit.basis.citations = audit.citacoesDoFoco.map(position =>
          resolveCitation(focus.citacoes[position - 1], focus));
        delete audit.citacoesDoFoco;
      }
      if (Array.isArray(audit.unidadesParaConfronto)) {
        audit.units = audit.unidadesParaConfronto.map(position => resolveUnit(focus.unidadesParaConfronto[position - 1]));
        delete audit.unidadesParaConfronto;
      }
      delete audit.foco;
    }
  }
  delete expanded.auditoriasPedagogicas;
  delete expanded.leituraDaAuditoria;
  return expanded;
}

// Desfaz SÓ as otimizações da 469 — abertura remitida e fonte por posição —,
// preservando os compartilhamentos anteriores; isola assim o ganho desta mudança.
function revert469(context) {
  const reverted = structuredClone(context);
  for (const focus of reverted.auditoriasPedagogicas ?? []) {
    for (const unit of focus.unidadesParaConfronto ?? []) {
      const observation = unit.observation;
      if (observation?.inicioRemitido !== INICIO_REMISSION_PATH || Object.hasOwn(observation, 'inicio')) continue;
      const rest = { ...observation };
      delete rest.inicioRemitido;
      unit.observation = { ...rest, inicio: observation.tarefaApresentada?.studentContent?.[0]?.text ?? '' };
    }
    if (!Array.isArray(focus.fontes)) continue;
    for (const citation of focus.citacoes ?? []) {
      if (!Array.isArray(citation?.links)) continue;
      citation.links = citation.links.map(link => {
        if (!link || Object.hasOwn(link, 'source') || !Object.hasOwn(link, 'fonteDoFoco')) return link;
        const { fonteDoFoco, ...rest } = link;
        return { ...rest, source: focus.fontes[fonteDoFoco - 1] };
      });
    }
    delete focus.fontes;
  }
  return reverted;
}

test('abertura idêntica sai com remissão local; divergente, nula, vazia e ausente ficam', () => {
  const iguais = shareHumanAuditContext({ studyUnits: [target('unit-1',
    { observation: observation({ inicio: TEXT }) })], explicacoes: [] }, COURSE);
  const unidade = iguais.auditoriasPedagogicas[0].unidadesParaConfronto[0].observation;
  assert.equal(Object.hasOwn(unidade, 'inicio'), false, 'a abertura redundante sai');
  assert.equal(unidade.inicioRemitido, 'tarefaApresentada.studentContent[0].text');
  assert.deepEqual(unidade.tarefaApresentada.studentContent[0].text, TEXT, 'a abertura continua acessível');

  const casos = [
    ['divergente', { inicio: 'outra abertura', studentContent: [{ text: TEXT }] }],
    ['nula', { inicio: null, studentContent: [{ text: TEXT }] }],
    ['vazia', { inicio: '', studentContent: [{ text: '' }] }],
    ['ausente', { studentContent: [{ text: TEXT }] }],
    ['sem-primeiro-texto', { inicio: TEXT, studentContent: [] }],
    ['remissão-já-ocupada', { inicio: TEXT, inicioRemitido: 'campo alheio', studentContent: [{ text: TEXT }] }]
  ];
  for (const [nome, obs] of casos) {
    const shared = shareHumanAuditContext({ studyUnits: [target(nome, { observation: obs })], explicacoes: [] }, COURSE);
    const entregue = shared.auditoriasPedagogicas[0].unidadesParaConfronto[0].observation;
    if (Object.hasOwn(obs, 'inicio')) assert.deepEqual(entregue.inicio, obs.inicio, `${nome}: inicio preservado`);
    else assert.equal(Object.hasOwn(entregue, 'inicio'), false, `${nome}: ausência preservada`);
    if (Object.hasOwn(obs, 'inicioRemitido')) {
      assert.equal(entregue.inicioRemitido, 'campo alheio', `${nome}: campo desconhecido não é sobrescrito`);
    }
  }
});

test('fonte integral idêntica compartilha por posição no foco; variantes e ordem preservadas', () => {
  const citations = [citation('unit-1', SOURCE_A), citation('unit-2', SOURCE_A), citation('unit-1', SOURCE_B),
    citation('unit-2', { ...SOURCE_B, citationText: 'B variante. Obra.' })];
  const context = { studyUnits: [target('unit-1', { citations }), target('unit-2', { citations })], explicacoes: [] };
  const snapshot = structuredClone(context);
  const shared = shareHumanAuditContext(context, COURSE);
  const focus = shared.auditoriasPedagogicas[0];
  assert.equal(focus.fontes.length, 3, 'fonte igual entra uma vez; variante entra separada');
  const resolvidas = shared.studyUnits[0].auditoriaPedagogica.citacoesDoFoco
    .map(position => resolveCitation(focus.citacoes[position - 1], focus));
  assert.deepEqual(resolvidas, citations, 'ordem, repetições, relação, âncoras e variantes intactas');
  assert.deepEqual(context, snapshot, 'a base canônica recebida não é alterada');
  assert.deepEqual(expand(shared), snapshot, 'a expansão reconstrói o original exatamente');
});

test('sem repetição real nada muda: vínculos voltam intactos e nenhum registro é publicado', () => {
  const citations = [citation('unit-1', SOURCE_A), citation('unit-2', SOURCE_B)];
  const context = { studyUnits: [target('unit-1', { citations }), target('unit-2', { citations })], explicacoes: [] };
  const shared = shareHumanAuditContext(context, COURSE);
  assert.equal(Object.hasOwn(shared.auditoriasPedagogicas[0], 'fontes'), false);
  assert.deepEqual(shared.auditoriasPedagogicas[0].citacoes, citations, 'sem repetição os vínculos ficam como vieram');
  assert.deepEqual(expand(shared), context, 'nada se perde sem repetição');
});

// Reprodução mínima da colisão relatada pela raiz: no caminho sem repetição, o
// desfazer não pode expandir um fonteDoFoco que já existia no vínculo, sob pena
// de trocar a fonte real por undefined e levar campo desconhecido junto.
test('fonteDoFoco preexistente sobrevive ao caminho sem repetição, com source e campo alheio', () => {
  const originais = [{ relation: 'informed_by', source: { title: 'A' }, anchors: [] },
    { relation: 'informed_by', source: { title: 'Preservar' }, fonteDoFoco: 77, extra: 'desconhecido',
      anchors: [] }];
  const citations = [{ targetKind: 'study_unit', targetId: 'unit-1', links: structuredClone(originais) }];
  const original = { studyUnits: [target('unit-1', { citations })], explicacoes: [] };
  const snapshot = structuredClone(original);
  const shared = shareHumanAuditContext(original, COURSE);
  const focus = shared.auditoriasPedagogicas[0];
  assert.deepEqual(focus.citacoes[0].links, originais,
    'vínculo com posição preexistente permanece exatamente como veio');
  assert.deepEqual(focus.citacoes[0].links[1].source, { title: 'Preservar' }, 'a fonte real não vira undefined');
  assert.equal(focus.citacoes[0].links[1].fonteDoFoco, 77, 'a posição preexistente é preservada');
  assert.equal(focus.citacoes[0].links[1].extra, 'desconhecido', 'campo desconhecido não se perde');
  assert.deepEqual(expand(shared), snapshot, 'round-trip exato: nada é desfeito nem inventado');
});

test('com repetição e posição preexistente, o foco inteiro deixa de compartilhar fonte', () => {
  const links = [{ relation: 'informed_by', source: { title: 'A' }, anchors: [] },
    { relation: 'informed_by', source: { title: 'A' }, anchors: [] },
    { relation: 'informed_by', source: { title: 'B' }, fonteDoFoco: 77, extra: 'alheio', anchors: [] }];
  const citations = [{ targetKind: 'study_unit', targetId: 'unit-1', links: structuredClone(links) }];
  const original = { studyUnits: [target('unit-1', { citations })], explicacoes: [] };
  const snapshot = structuredClone(original);
  const shared = shareHumanAuditContext(original, COURSE);
  const focus = shared.auditoriasPedagogicas[0];
  assert.equal(Object.hasOwn(focus, 'fontes'), false, 'colisão desativa o compartilhamento no foco');
  assert.deepEqual(focus.citacoes[0].links, links, 'vínculos idênticos, com fonte e campo alheio');
  assert.deepEqual(expand(shared), snapshot, 'round-trip exato: nada é desfeito nem inventado');
});

test('citação repetida no mesmo foco conta uma vez; nada é publicado sem ganho', () => {
  const repetida = citation('unit-1', SOURCE_A);
  const citations = [repetida, structuredClone(repetida)];
  const context = { studyUnits: [target('unit-1', { citations })], explicacoes: [] };
  const shared = shareHumanAuditContext(context, COURSE);
  const focus = shared.auditoriasPedagogicas[0];
  assert.equal(focus.citacoes.length, 1, 'a identidade original deduplica a citação');
  assert.equal(Object.hasOwn(focus, 'fontes'), false, 'sem segunda entrada armazenada não há ganho');
  assert.deepEqual(expand(shared), context, 'round-trip exato');
});

// Condição real de composição: dois alvos da MESMA microssequência, cada base
// trazendo a mesma citação da Explicação. Depois da deduplicação original resta
// uma entrada armazenada, então não há ganho e nada é publicado.
test('mesma citação entre alvos da mesma microssequência não conta como repetição armazenada', () => {
  const compartilhada = citation('ms', SOURCE_A);
  const context = { studyUnits: [target('unit-1', { citations: [structuredClone(compartilhada)] }),
    target('unit-2', { citations: [structuredClone(compartilhada)] })], explicacoes: [] };
  const snapshot = structuredClone(context);
  const shared = shareHumanAuditContext(context, COURSE);
  const focus = shared.auditoriasPedagogicas[0];
  assert.equal(focus.citacoes.length, 1, 'uma única citação armazenada no foco');
  assert.equal(Object.hasOwn(focus, 'fontes'), false, 'sem segunda entrada armazenada não há inflação');
  assert.deepEqual(focus.citacoes[0].links[0].source, SOURCE_A, 'a fonte segue integral no vínculo');
  assert.deepEqual(expand(shared), snapshot, 'round-trip exato entre alvos');
});

test('múltiplos focos, alvo fora da página e entrada congelada sobrevivem ao round-trip', () => {
  const foraDaPagina = [{ studyUnit: { id: 'fora' }, auditoriaPedagogica: { basis: {}, units: [] } }];
  const context = { studyUnits: [target('unit-1', { citations: [citation('unit-1', SOURCE_A), citation('unit-2', SOURCE_A)] }),
    target('unit-2', { microsequenceId: 'ms-b' })], explicacoes: [], foraDaPagina };
  const snapshot = structuredClone(context);
  const shared = shareHumanAuditContext(context, COURSE);
  assert.equal(shared.auditoriasPedagogicas.length, 2, 'um foco por microssequência');
  assert.deepEqual(context, snapshot, 'a entrada não é alterada');
  assert.deepEqual(shared.foraDaPagina, foraDaPagina, 'alvo fora da página permanece intacto');
  assert.deepEqual(expand(shared), snapshot, 'round-trip exato com dois focos');
});

test('entradas congeladas sobrevivem; representações inesperadas ficam intactas', () => {
  const citations = [citation('unit-1', SOURCE_A), { targetKind: 'study_unit', targetId: 'unit-2' },
    { targetKind: 'study_unit', targetId: 'unit-3', links: [{ source: 'texto solto', anchors: [] }] },
    { targetKind: 'study_unit', targetId: 'unit-4', links: [{ source: null, fonteDoFoco: 9, anchors: [] }] }];
  const context = Object.freeze({ studyUnits: Object.freeze([Object.freeze(target('unit-1',
    { citations: Object.freeze(citations) }))]), explicacoes: Object.freeze([]) });
  const shared = shareHumanAuditContext(context, COURSE);
  const focus = shared.auditoriasPedagogicas[0];
  assert.equal(Object.hasOwn(focus, 'fontes'), false, 'posição preexistente desativa o compartilhamento');
  assert.deepEqual(focus.citacoes[1], { targetKind: 'study_unit', targetId: 'unit-2' });
  assert.equal(focus.citacoes[2].links[0].source, 'texto solto', 'representação inesperada preservada');
  assert.equal(focus.citacoes[3].links[0].fonteDoFoco, 9, 'posição desconhecida não é sobrescrita');
});

// Sem ganho de serialização o registro não entra: a posição custa o mesmo que a
// fonte pequena e o registro soma, então nada muda e o round-trip é idêntico.
test('fonte pequena repetida não paga o registro e nada é publicado', () => {
  const citations = [citation('unit-1', { a: 1 }), citation('unit-2', { a: 1 })];
  const context = { studyUnits: [target('unit-1', { citations }), target('unit-2', { citations })], explicacoes: [] };
  const snapshot = structuredClone(context);
  const shared = shareHumanAuditContext(context, COURSE);
  const focus = shared.auditoriasPedagogicas[0];
  assert.equal(focus.citacoes.length, 2, 'as duas citações continuam armazenadas');
  assert.equal(Object.hasOwn(focus, 'fontes'), false, 'sem ganho real o registro não entra');
  assert.deepEqual(focus.citacoes.map(item => item.links[0].source), [{ a: 1 }, { a: 1 }]);
  assert.deepEqual(expand(shared), snapshot, 'round-trip exato sem ganho');
  assert.equal(utf8Bytes(shared), utf8Bytes(revert469(shared)), 'sem ganho a serialização entregue é a mesma');
});

test('fonte extensa repetida compensa o registro e entra por posição', () => {
  const extensa = { title: 'Fonte extensa', citationText: 'passagem longa '.repeat(30),
    url: 'https://example.test/g', status: 'active' };
  const citations = [citation('unit-1', extensa), citation('unit-2', extensa)];
  const context = { studyUnits: [target('unit-1', { citations }), target('unit-2', { citations })], explicacoes: [] };
  const snapshot = structuredClone(context);
  const shared = shareHumanAuditContext(context, COURSE);
  const focus = shared.auditoriasPedagogicas[0];
  assert.equal(focus.fontes.length, 1, 'a mesma fonte entra uma vez no registro');
  assert.deepEqual(focus.citacoes.map(item => item.links[0].fonteDoFoco), [1, 1]);
  assert.deepEqual(focus.citacoes.map(item => Object.hasOwn(item.links[0], 'source')), [false, false]);
  assert.ok(utf8Bytes(shared) < utf8Bytes(revert469(shared)), 'o registro encolhe a serialização entregue');
  assert.deepEqual(expand(shared), snapshot, 'round-trip exato com ganho');
});

// O alias não pode esconder referência real: com registro fontes e sem source, a
// posição precisa resolver; fora do intervalo é falha, não ausência silenciosa.
test('posição de fonte fora do registro falha em vez de esconder a referência', () => {
  const focus = { fontes: [SOURCE_A] };
  assert.deepEqual(resolveLinkSource({ relation: 'informed_by', fonteDoFoco: 1, anchors: [] }, focus),
    { relation: 'informed_by', anchors: [], source: SOURCE_A }, 'posição válida devolve a fonte registrada');
  assert.throws(() => resolveLinkSource({ relation: 'informed_by', fonteDoFoco: 2, anchors: [] }, focus),
    /fonteDoFoco sem fonte/u, 'posição inválida com registro presente falha');
  assert.deepEqual(resolveLinkSource({ relation: 'informed_by', fonteDoFoco: 2, anchors: [] }, {}),
    { relation: 'informed_by', fonteDoFoco: 2, anchors: [] }, 'sem registro o vínculo volta intacto');
  const comSource = { relation: 'informed_by', source: null, fonteDoFoco: 9, anchors: [] };
  assert.equal(resolveLinkSource(comSource, focus), comSource, 'source presente nunca depende do registro');
});

const MS = 'ms-protocolos';
const UNITS = [
  { role: 'theory', text: 'Abertura expositiva que já enuncia a resposta correta: ordem.' },
  { role: 'practice', gap: true, text: 'O transporte confiável mantém a ordem de entrega dos bytes.' },
  { role: 'practice', choice: true, text: 'Uma aplicação transfere arquivo e decide propriedades garantidas.' },
  { role: 'practice', ordering: true, text: 'Ordene as etapas do aperto de mão do protocolo.' }
];

function pedagogicalBasis(targetKind, targetId) {
  const citations = [{ targetKind, targetId, targetTitle: `Alvo ${targetId}`,
    links: [{ relation: 'supported_by', source: structuredClone(SOURCE_A),
      anchors: [{ selector: { kind: 'page_range', from: 11, to: 12 }, verificationExcerpt: 'trecho' }] }] }];
  return { targetKind, targetId, audience: 'estudante',
    microsequence: { id: MS, title: 'MS', goal: 'Relacionar.',
      explanation: normalizeMicrosequenceExplanation({ title: 'Explicação',
        content: [{ id: 'exp-p1', package: 'aralearn.resource.paragraph', version: '1.0.0',
          data: { text: 'Contexto compartilhado da microssequência. '.repeat(60) } }] }) },
    planItems: [{ id: 'req-1', kind: 'evidence_requirement', statement: 'Relacionar perdas', description: 'Justificar' }],
    dependencies: [{ title: 'Prévia', goal: 'Meta' }], citations,
    studyUnits: UNITS.map((unit, index) => ({ id: `unit-${index + 1}`, position: index + 1,
      content: { title: `Unidade ${index + 1}`, position: index + 1, role: unit.role, topics: [],
        content: [{ id: `p-u${index + 1}`, package: 'aralearn.resource.paragraph', version: '1.0.0',
          data: { text: `«u${index + 1}» ${unit.text}` } }],
        response: unit.gap ? { id: `r-u${index + 1}`, package: 'aralearn.response.gap', version: '1.0.0',
          data: { prompt: 'Complete.', blanks: [{ id: 'b1', targetInstanceId: `p-u${index + 1}`,
            targetPath: 'text:ordem', responseMode: 'text', answer: 'ordem', distractors: ['perde'],
            feedback: 'A ordem vem dos números de sequência.' }] } }
          : unit.choice ? { id: `r-u${index + 1}`, package: 'aralearn.response.choice', version: '1.0.0',
            data: { question: 'Quais propriedades?', selectionMode: 'multiple', selectionCriterion: 'correct',
              options: [{ id: 'ordem', text: 'Entrega em ordem.', feedback: 'Números de sequência remontam o fluxo.' },
                { id: 'prazo', text: 'Prazo garantido.', feedback: 'Confiabilidade não é prazo.' }], answerIds: ['ordem'] } }
          : unit.ordering ? { id: `r-u${index + 1}`, package: 'aralearn.response.ordering', version: '1.0.0',
            data: { targets: [{ id: 't1', targetInstanceId: `p-u${index + 1}`, targetPath: 'text:etapas',
              answer: 'SYN, SYN-ACK, ACK' }] } } : null, feedback: [] },
      application: { mode: unit.role, practiceApplications: unit.role === 'theory' ? [] :
        [{ evidenceRequirementId: 'req-1', invariantTaskOperation: 'discriminate' }] },
      design: { appliedAt: '2026-10-16T00:00:00.000Z', parameters: [{ id: 'explanation_form', value: 'expositive' }] } })) };
}

function producerAdapter() {
  const msSpec = () => ({ id: MS, title: 'MS', position: 0, goal: 'Relacionar.',
    explanationPlan: { purpose: 'Explicitar.', prerequisites: [], relations: [], sourceIds: [] },
    explanation: pedagogicalBasis('study_unit', 'unit-1').microsequence.explanation,
    contentReview: { state: 'draft' } });
  const sample = i => ({ ordinal: i, version: 5,
    curriculumPath: { didacticMicrosequence: { id: MS, title: 'MS' } },
    studyUnit: { id: `00000000-0000-4000-8000-00000000000${i}`, version: 5, kind: UNITS[i - 1].role === 'theory' ? 'theory' : 'practice',
      ...pedagogicalBasis('study_unit', `unit-${i}`).studyUnits[i - 1].content }, authorship: {} });
  const units = UNITS.map((_, index) => sample(index + 1));
  return { revision: COURSE.revision, publicAppUrl: 'https://app.example/', annotationSetVersion: 1,
    annotationItems: { 1: [] },
    async resolvePrincipal() { return { actorId: '2a000000-0000-4000-8000-000000000469', scopes: ['authoring:read', 'authoring:write'], authenticationKind: 'oauth' }; },
    async listCourses() { return { items: [{ courseId: COURSE.id, title: 'C' }], hasMore: false, nextCursor: null }; },
    async getCourse({ courseId }) { return { courseId, revision: COURSE.revision, title: 'C' }; },
    async getCourseInstructionalPlan() { return { courseRevision: COURSE.revision, plan: { title: 'C',
      curriculumMapStatus: 'approved', instructionalAnalysisUnits: [], evidenceRequirements: [], curriculumScopeItems: [],
      curriculum: { modules: [{ id: 'module-1', title: 'Módulo', lessons: [
        { id: 'lesson-1', title: 'Lição', microsequences: [msSpec()] }] }] },
      parts: [{ id: 'p1', position: 0, title: 'Parte', intent: 'Cobrir.', microsequences: [msSpec()] }] } }; },
    async getAuthoringProcessPreferences() { return { contract: 'aralearn.authoring-process-preferences.v1',
      revision: 0, updatedAt: null, preferences: defaultAuthoringProcessPreferences() }; },
    async getCourseContentReview(input) { return { contract: 'aralearn.course-content-review.v1', courseId: input.courseId,
      courseRevision: COURSE.revision, targetKind: input.targetKind, targetId: input.targetId, entityVersion: 5,
      basisHash: 'a'.repeat(64), contentReview: { state: 'draft' }, reviewPolicy: 'saved' }; },
    async getCourseContentInspection(input) { return { contract: 'aralearn.course-ai-inspection.v1', courseId: input.courseId,
      courseRevision: COURSE.revision, targetKind: input.targetKind, targetId: input.targetId, basisHash: 'b'.repeat(64),
      inspection: { state: 'unregistered', basisHash: 'b'.repeat(64) },
      pedagogicalBasis: pedagogicalBasis(input.targetKind, input.targetId) }; },
    async getCourseContentInspectionReceipt() { return null; },
    async listCourseStudyUnits(input) { const start = input.cursorStudyUnitId
      ? Number(String(input.cursorStudyUnitId).split('-').at(-1)) : 0;
      const items = units.slice(start, start + 12); const end = start + items.length;
      return { items: structuredClone(items), hasMore: end < units.length,
        nextCursor: end < units.length ? { studyUnitId: `unit-${end}` } : null }; },
    async getCourseSources(input) { return { items: [{ targetKind: input.targetKind, targetId: input.targetId,
      sourceLinks: [] }], nextCursor: null }; },
    async getCourseAnchoredAnnotations() { return { items: [], annotationSetVersion: 1,
      courseRevision: COURSE.revision, hasMore: false, nextCursor: null }; } };
}

function reassemble(adapter, first) {
  if (!first.fragmento) return first;
  let literal = first.fragmento.texto;
  let cursor = first.continuacao;
  return (async () => {
    while (cursor) {
      const next = await readPage(adapter, { unidades: [1, 2, 3, 4], continuacao: cursor });
      if (!next.fragmento) return JSON.parse(literal + JSON.stringify(next));
      literal += next.fragmento.texto;
      cursor = next.continuacao;
    }
    return JSON.parse(literal);
  })();
}
async function readPage(adapter, args = {}) {
  const response = await executeHumanCourseTask({ adapter,
    principal: { actorId: '2a000000-0000-4000-8000-000000000469', scopes: ['authoring:read', 'authoring:write'] },
    name: 'preparar_revisao', rawArguments: { curso: 'C', auditoria: true, ...args } });
  return response.context;
}

test('produtor real: expositiva + lacuna + escolha + ordenação encolhem sem perder nada', async () => {
  const adapter = producerAdapter();
  const page = await readPage(adapter, { unidades: [1, 2, 3, 4] });
  const completa = await reassemble(adapter, page);
  const focus = completa.auditoriasPedagogicas[0];
  assert.ok(Array.isArray(focus.fontes), 'fonte repetida entra no registro do foco');
  assert.ok(focus.fontes.length < UNITS.length + 1, 'as ocorrências superam as fontes distintas');
  const observacoes = focus.unidadesParaConfronto.map(entry => entry.observation);
  assert.ok(observacoes.every(obs => !Object.hasOwn(obs, 'inicio')),
    'toda abertura idêntica ao primeiro texto sai com remissão');
  assert.ok(observacoes.every(obs => obs.inicioRemitido === 'tarefaApresentada.studentContent[0].text'));
  const lacuna = observacoes[1].tarefaApresentada;
  const conteudo = lacuna.content.join(' ');
  const apresentado = lacuna.studentContent.map(entry => entry.text).join(' ');
  assert.match(conteudo, /ordem/u, 'content conserva o original não mascarado');
  assert.doesNotMatch(apresentado, /ordem/u, 'studentContent continua mascarando a lacuna');
  assert.ok(observacoes.some(obs => Array.isArray(obs.feedbackStates) || obs.feedbackStates === undefined));

  // A medida local desfaz SÓ as otimizações da 469; o total contra a base 1a22888
  // é medido fora da suíte, com o mesmo produtor e em bytes UTF-8.
  const semNovas = utf8Bytes(revert469(completa));
  const entregue = utf8Bytes(completa);
  console.log(JSON.stringify({ evento: 'reducao-469', semNovasOtimizacoes: semNovas, entregue,
    ganhoBytes: semNovas - entregue,
    ganhoPercentual: Number(((semNovas - entregue) / semNovas * 100).toFixed(2)),
    fontes: focus.fontes.length, ocorrencias: focus.citacoes.length,
    unidades: focus.unidadesParaConfronto.length }));
  assert.ok(entregue < semNovas, 'só as otimizações da 469 encolhem a projeção entregue');
});

test('cursor velho da mesma página recusa misturar fragmentos; página nova segue íntegra', async () => {
  const contexto = { studyUnits: [], explicacoes: [], explicacoesGrandes: 'x'.repeat(40000) };
  const args = { curso: 'C', auditoria: true };
  const start = await openHumanReadContinuation({ args, course: COURSE, task: 'preparar_revisao' });
  const primeiro = await paginateHumanReadContext(contexto, { state: start });
  assert.ok(primeiro.fragmento && primeiro.continuacao, 'a página lógica exige continuação');
  const estado = await openHumanReadContinuation({ args: { ...args, continuacao: primeiro.continuacao },
    course: COURSE, task: 'preparar_revisao' });
  const segundo = await paginateHumanReadContext(contexto, { state: estado });
  assert.equal(segundo.fragmento.inicio, primeiro.fragmento.fim, 'a retomada continua onde parou');
  const antigo = await sha256Hex('representação anterior da mesma página');
  await assert.rejects(() => paginateHumanReadContext(contexto, { state: { ...estado, h: antigo } }),
    { code: 'human_read_context_changed' });
  await assert.rejects(() => openHumanReadContinuation({ args: { ...args, continuacao: primeiro.continuacao.slice(0, -2) + 'zz' },
    course: COURSE, task: 'preparar_revisao' }), { code: 'invalid_read_continuation' });
});
