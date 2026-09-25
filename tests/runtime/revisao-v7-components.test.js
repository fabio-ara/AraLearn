import assert from 'node:assert/strict';
import test from 'node:test';
import { RESOURCE_PACKAGE_REGISTRY as registry } from '../../src/resources/packages/index.js';
import { validateStudyUnitEnvelope } from '../../src/resources/kernel/studyUnitEnvelope.js';
import { renderPackageStudyUnitBlocks, readPackageStudyUnitText } from '../../src/render/renderPackageStudyUnit.js';
import { inspectPedagogicalEvidence } from '../../src/domain/coursePedagogicalAudit.js';

const resource = (name, data) => ({ id: 'object', package: `aralearn.resource.${name}`, version: '1.0.0', data });
const unit = content => ({ id: 'unit', position: 1, title: 'Interpretar a representação', role: 'practice', topics: [],
  content: [content], response: null, feedback: [{ ...resource('paragraph', { text: 'A resposta decorre das relações observadas no objeto.' }), id: 'feedback' }] });
const gap = blanks => ({ id: 'response', package: 'aralearn.response.gap', version: '1.0.0', data: { blanks } });

test('exemplo canônico multiple discrimina o conjunto exato e conserva feedback específico', () => {
  const data = structuredClone(registry.get('aralearn.response.choice', '1.0.0').authoringContract.example);
  assert.equal(data.selectionMode, 'multiple');
  assert.equal(data.answerIds.length, 2);
  assert.equal(new Set(data.options.map(option => option.feedback)).size, 4);
  const response = { id: 'r', package: 'aralearn.response.choice', version: '1.0.0', data };
  assert.equal(registry.evaluateResponse(response, { selectedIds: data.answerIds }).correct, true);
  assert.equal(registry.evaluateResponse(response, { selectedIds: data.answerIds.slice(0, 1) }).correct, false);
  assert.equal(registry.evaluateResponse(response, { selectedIds: data.options.map(option => option.id) }).correct, false);
});

for (const count of [2, 4, 6]) test(`tabela-verdade com ${count} lacunas mantém enums, controles e avaliação global`, () => {
  const data = structuredClone(registry.get('aralearn.resource.truth_table', '1.0.0').authoringContract.example);
  const value = unit(resource('truth_table', data));
  const fields = [...data.rows[0].values.map((answer, i) => ({ answer, targetPath: `rows[0].values[${i}]` })),
    ...data.rows[0].results.map((answer, i) => ({ answer, targetPath: `rows[0].results[${i}]` }))].slice(0, count);
  value.response = gap(fields.map((field, i) => ({ ...field, id: `b${i}`, targetInstanceId: 'object', responseMode: 'choice',
    distractors: [field.answer === 'true' ? 'false' : 'true'] })));
  const validation = validateStudyUnitEnvelope(value, registry);
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  const html = renderPackageStudyUnitBlocks(value);
  assert.equal((html.match(/data-action="text-gap-open-choice"/gu) || []).length, count);
  assert.equal((readPackageStudyUnitText(value).match(/\blacuna\b/gu) || []).length, count);
  const answers = Object.fromEntries(value.response.data.blanks.map(blank => [blank.id, blank.answer]));
  assert.equal(registry.evaluateResponse(value.response, { values: answers }).correct, true);
  answers.b0 = value.response.data.blanks[0].distractors[0];
  assert.equal(registry.evaluateResponse(value.response, { values: answers }).correct, false);
  assert.deepEqual(inspectPedagogicalEvidence({ content: value }).issues, []);
});

test('distrator cruzado é legítimo em outro alvo, mas equivalente local é ambíguo', () => {
  const value = unit(resource('paragraph', { text: 'DNS resolve nomes; TCP recupera perdas.' }));
  value.response = gap(['DNS', 'TCP'].map((answer, i) => ({ id: `b${i}`, targetInstanceId: 'object', targetPath: `text:b${i}`,
    responseMode: 'choice', answer, distractors: [i ? 'DNS' : 'TCP'] })));
  assert.equal(validateStudyUnitEnvelope(value, registry).valid, true);
  assert.equal(registry.evaluateResponse(value.response, { values: { b0: 'TCP', b1: 'DNS' } }).correct, false);
  assert.deepEqual(inspectPedagogicalEvidence({ content: value }).issues, []);
  value.response.data.blanks[0].acceptedAnswers = ['Domain Name System'];
  value.response.data.blanks[0].distractors.push('domain name system');
  assert.equal(inspectPedagogicalEvidence({ content: value }).issues[0].code, 'pedagogical_ambiguous_gap');
});

test('mapa de memória recolhe endereços de 64 bits sem arredondar nem revelar resposta', () => {
  const value = unit(resource('memory_layout', { addressBase: 'hexadecimal', addressOrder: 'ascending', segments: [
    { id: 'b', start: '0xfffffffffffffff1', end: '0xfffffffffffffff2', label: 'Segundo intervalo', kind: 'custom', description: 'Dois bytes' },
    { id: 'a', start: '0xfffffffffffffff0', end: '0xfffffffffffffff0', label: 'Primeiro intervalo', kind: 'custom', description: 'Um byte' }
  ] }));
  value.response = gap([{ id: 'address', targetInstanceId: 'object', targetPath: 'segments[0].end', responseMode: 'text', answer: '0xfffffffffffffff2' }]);
  const validation = validateStudyUnitEnvelope(value, registry);
  assert.equal(validation.valid, true, validation.errors.join('\n'));
  const html = renderPackageStudyUnitBlocks(value);
  assert.ok(html.indexOf('Primeiro intervalo') < html.indexOf('Segundo intervalo'));
  assert.match(html, /data-action="complete-input"/u);
  assert.doesNotMatch(readPackageStudyUnitText(value), /fffffffffffffff2/u);
  for (const address of ['0XFFFFFFFFFFFFFFF2', '00FFFFFFFFFFFFFFF2']) {
    const state = registry.createResponseState(value.response);
    state.values = [address];
    assert.equal(registry.submitResponseState(value.response, state, { studyUnit: value }), true);
    assert.equal(state.feedback, 'correct');
  }
  assert.equal(registry.evaluateResponse(value.response, { values: { address: '0xfffffffffffffff1' } }, value).correct, false);
  value.response.data.blanks[0].acceptedAnswers = ['FFFFFFFFFFFFFFF2'];
  assert.equal(validateStudyUnitEnvelope(value, registry).valid, true);
  value.response.data.blanks[0].responseMode = 'choice';
  value.response.data.blanks[0].distractors = ['0XFFFFFFFFFFFFFFF2'];
  assert.equal(inspectPedagogicalEvidence({ content: value }).issues[0].code, 'pedagogical_ambiguous_gap');
});

test('digitação usa V/F da tabela sem normalizar variáveis e código', () => {
  const value = unit(resource('truth_table', { variables: ['P'], derivedColumns: ['¬P'], rows: [{ values: ['true'], results: ['false'] }] }));
  value.response = gap([{ id: 'result', targetInstanceId: 'object', targetPath: 'rows[0].results[0]', responseMode: 'text', answer: 'false', acceptedAnswers: ['F'] }]);
  assert.equal(validateStudyUnitEnvelope(value, registry).valid, true);
  const state = registry.createResponseState(value.response);
  state.values = ['f'];
  assert.equal(registry.submitResponseState(value.response, state, { studyUnit: value }), true);
  assert.equal(registry.evaluateResponse(value.response, { values: { result: 'V' } }, value).correct, false);
  assert.equal(registry.normalizePracticeValue(value.content[0], 'variables[0]', 'p'), 'p');

  const code = unit(resource('code', { prompt: 'Complete o identificador respeitando maiúsculas.', language: 'javascript', code: 'const Name = 1;' }));
  code.response = gap([{ id: 'identifier', targetInstanceId: 'object', targetPath: 'code', responseMode: 'text', answer: 'Name' }]);
  assert.equal(validateStudyUnitEnvelope(code, registry).valid, true);
  assert.equal(registry.evaluateResponse(code.response, { values: { identifier: 'name' } }, code).correct, false);
  code.response.data.blanks[0].responseMode = 'choice';
  code.response.data.blanks[0].distractors = ['name'];
  assert.deepEqual(inspectPedagogicalEvidence({ content: code }).issues, []);
});

test('Código exibe linguagem e terminal conserva saída com expansão progressiva', () => {
  const code = registry.renderInstance(resource('code', { prompt: 'Observe a saída.', language: 'python', code: 'print(1)' }), 'content');
  assert.match(code, /class="runtime-code-language">python</u);
  const terminal = registry.get('aralearn.resource.terminal_session', '1.0.0');
  const html = terminal.render(terminal.authoringContract.example);
  assert.equal((html.match(/package-terminal-result" open/gu) ?? []).length, 1);
  const editing = terminal.render(terminal.authoringContract.example, { manualEditing: true });
  assert.equal((editing.match(/package-terminal-result" open/gu) ?? []).length,
    terminal.authoringContract.example.interactions.length);
  assert.match(html, /Mostrar ou recolher resultado/u);
  assert.doesNotMatch(html, /<code>(input|stdout|stderr)<\/code>|exit code/u);
});
