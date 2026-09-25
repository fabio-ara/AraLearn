import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { completeFocalMaterialization, completeHumanContent } from '../supabase/functions/_shared/aralearn-authoring/courseFocalMaterialization.js';
import { validatePackageSchema } from '../src/resources/kernel/schemaValidation.js';
import { validateStudyUnitEnvelope } from '../src/resources/kernel/studyUnitEnvelope.js';
import { RESOURCE_PACKAGE_REGISTRY as registry } from '../src/resources/packages/index.js';
import { renderPackageStudyUnitBlocks } from '../src/render/renderPackageStudyUnit.js';

const root = fileURLToPath(new URL('../docs/experimentos/revisao-v7/', import.meta.url));
const schemas = Object.fromEntries(['tool', 'tool-assisted-v2'].map(name => [name,
  JSON.parse(fs.readFileSync(path.join(root, `${name}.json`), 'utf8')).inputSchema]));
const micros = ['Garantias e limites de protocolos', 'Intervalos e limites de memória', 'Transições de um controle de acesso']
  .map((title, i) => ({ id: `m${i}`, title, position: i, productionPosition: i }));
const part = { id: 'part', title: 'Recorte de modelos', position: 0, microsequences: micros };
const context = { plan: { plan: { parts: [part] } } };
const results = [];
for (const name of fs.readdirSync(root).filter(name => /^(single|group|assisted-v2|corrected)-/u.test(name))) {
  const schema = schemas[/^(assisted-v2|corrected)-/u.test(name) ? 'tool-assisted-v2' : 'tool'];
  for (const stage of ['first', 'final']) {
    const file = path.join(root, name, `${stage}.json`);
    if (!fs.existsSync(file)) continue;
    const result = { name, stage, errors: [], calls: [], bytes: fs.statSync(file).size };
    try {
      const parsed = JSON.parse(fs.readFileSync(file, 'utf8'));
      const calls = Array.isArray(parsed) ? parsed : [parsed];
      if (!Array.isArray(parsed)) result.experimentFormat = 'Objeto único; o ensaio pedia lista. O argumento da ferramenta é validado normalmente.';
      for (const [index, call] of calls.entries()) {
        const structural = validatePackageSchema(call, schema);
        if (!structural.valid) result.errors.push({ call: index, kind: 'tool_schema', error: structural.error });
        let focal;
        try { focal = completeFocalMaterialization(call, context); }
        catch (error) { result.errors.push({ call: index, kind: 'focus', error: error.code, message: error.message }); }
        if (call.parte !== undefined && call.parte !== part.title) result.errors.push({ call: index, kind: 'part', error: 'Referência de parte não fornecida pelo planejamento.' });
        const units = focal?.units ?? call.unidades ?? [];
        for (const [i, explanation] of (call.explicacoes ?? []).entries()) {
          try {
            const content = completeHumanContent(explanation.conteudo, { explanation: true });
            for (const item of content.content) {
              const validation = registry.validateInstance(item, 'content');
              if (!validation.valid) result.errors.push({ call: index, kind: 'explanation', explanation: i, errors: validation.errors });
            }
          } catch (error) { result.errors.push({ call: index, kind: 'explanation', explanation: i, error: error.message }); }
        }
        if (focal) for (const [i, entry] of units.entries()) {
          const validation = validateStudyUnitEnvelope({ ...entry.conteudo, id: `u${i}`, position: i + 1 }, registry);
          if (!validation.valid) result.errors.push({ call: index, kind: 'unit', unit: i, errors: validation.errors });
        }
        const responses = units.map(unit => unit.conteudo?.response).filter(Boolean);
        const parts = [...(call.explicacoes ?? []).flatMap(e => e.conteudo?.content ?? []),
          ...units.flatMap(u => [...(u.conteudo?.content ?? []), ...(u.conteudo?.feedback ?? [])])];
        result.calls.push({ title: call.microssequencia, units: units.length,
          components: [...new Set(parts.map(part => part.package.replace(/^aralearn\.resource\./u, '')))],
          explanationCharacters: JSON.stringify(call.explicacoes ?? []).length,
          practices: responses.map(response => ({ component: response.package, mode: response.data.selectionMode ?? null,
            alternatives: response.data.options?.length ?? null, correct: response.data.answerIds?.length ?? null,
            gaps: response.data.blanks?.length ?? null,
            specificFeedback: response.data.options?.filter(option => option.feedback).length ?? null })) });
      }
    } catch (error) { result.errors.push({ kind: 'parse', error: error.message }); }
    results.push(result);
  }
}

for (const name of ['gap-Q020', 'gap-Q020-replica']) {
  const file = path.join(root, name, 'final.json');
  const value = JSON.parse(fs.readFileSync(file, 'utf8'));
  for (const unit of value.positives ?? value.units) {
    const errors = [];
    const validation = validateStudyUnitEnvelope(unit, registry);
    if (!validation.valid) errors.push({ kind: 'unit', errors: validation.errors });
    let probes = 0;
    try {
      registry.prepareStudyUnitForSemantics(unit);
      const html = renderPackageStudyUnitBlocks(unit);
      if ((html.match(/data-action="(?:complete-input|text-gap-open-choice)"/gu) ?? []).length !== unit.response.data.blanks.length) {
        errors.push({ kind: 'controls', error: 'Quantidade de controles divergente.' });
      }
      const answers = Object.fromEntries(unit.response.data.blanks.map(blank => [blank.id, blank.answer]));
      if (!registry.evaluateResponse(unit.response, { values: answers }, unit).correct) errors.push({ kind: 'answer', error: 'Gabarito rejeitado.' });
      for (const blank of unit.response.data.blanks) for (const distractor of blank.distractors ?? []) {
        probes++;
        if (registry.evaluateResponse(unit.response, { values: { ...answers, [blank.id]: distractor } }, unit).correct) {
          errors.push({ kind: 'distractor', blank: blank.id, error: 'Distrator aceito no alvo.' });
        }
      }
    } catch (error) { errors.push({ kind: 'runtime', error: error.message }); }
    results.push({ name: `${name}/${unit.id}`, stage: 'final', bytes: Buffer.byteLength(JSON.stringify(unit)), errors,
      checks: { distractorProbes: probes }, calls: [{ units: 1, practices: [{ component: unit.response.package, gaps: unit.response.data.blanks.length }] }] });
  }
}
console.log(JSON.stringify(results.map(({ name, stage, errors, calls, bytes, experimentFormat, checks }) => ({ name, stage, bytes, experimentFormat, checks,
  errors, units: calls.reduce((n, call) => n + call.units, 0),
  components: [...new Set(calls.flatMap(call => call.components ?? []))],
  practices: calls.flatMap(call => call.practices) })), null, 2));
