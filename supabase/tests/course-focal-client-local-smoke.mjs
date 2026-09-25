import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { randomUUID } from "node:crypto";
import { fileURLToPath } from "node:url";
import { curricularMap } from "./course-authoring-current-local-smoke.mjs";
import { wireClient } from "./course-authoring-channels-local-smoke.mjs";
import { completeHumanContent } from "../functions/_shared/aralearn-authoring/courseFocalMaterialization.js";
import { explanationReconciliationTargets } from "../../src/domain/courseExplanationReconciliation.js";
import {
  localSupabaseConfiguration, createConfirmedLocalUser, signInLocalUser, removeLocalUser,
  authorizeLocalMcpSession, authorizeLocalActionSession, cleanupLocalMcpSession,
  LOCAL_APPLICATION_ORIGIN
} from "../../tests/support/localSupabaseE2e.js";

const EXPERIMENT_URL = new URL("../../docs/experimentos/revisao-v7/corrected-B-2/final.json", import.meta.url);
const STACK_PORT = 44221;
const REPORT_DIMENSIONS = ["alignment", "evidence", "representation", "feedback", "sufficiency"];

async function loadExperiment() {
  const value = JSON.parse(await readFile(EXPERIMENT_URL, "utf8"));
  assert.equal(value.length, 1, "O experimento B-2 precisa conter um lote focal.");
  const [batch] = value;
  assert.equal(batch.unidades.length, 3, "O B-2 focal precisa conservar as três práticas.");
  assert.ok(batch.unidades.every(unit => unit.conteudo.role === "practice" && unit.conteudo.response && unit.conteudo.feedback?.length),
    "O B-2 precisa trazer resposta e feedback específico em cada prática.");
  return batch;
}

function focalMap(course, batch) {
  const map = curricularMap(course);
  map.publico = "Pessoas iniciantes em aritmética de endereços e intervalos de memória";
  map.preRequisitos = ["Ler endereços hexadecimais", "Reconhecer início e fim de um intervalo"];
  map.itensDeEscopo = [
    "Calcular o extremo final e o tamanho de intervalos inclusivos de bytes.",
    "Distinguir contiguidade, sobreposição e lacuna comparando os extremos."
  ];
  map.modulos[0].titulo = "Intervalos de memória";
  map.modulos[0].objetivo = "Calcular e comparar intervalos inclusivos de bytes.";
  map.modulos[0].licoes[0].titulo = "Intervalos e limites";
  map.modulos[0].licoes[0].objetivo = "Aplicar as regras de extremos e relações entre intervalos.";
  map.modulos[0].licoes[0].microssequencias = [{
    titulo: batch.microssequencia,
    objetivo: "Calcular extremos e classificar relações entre intervalos inclusivos.",
    dependencias: [], cobertura: map.itensDeEscopo,
    explicacao: { proposito: "Explicar as regras de inclusão e a comparação dos extremos.",
      pressupostos: map.preRequisitos,
      relacoes: ["O tamanho inclui os dois extremos; a relação depende da posição do segundo início."],
      fontesPrevistas: [] }
  }];
  return map;
}

function focalPart(course, batch) {
  return { curso: course, titulo: "Intervalos e limites de memória",
    intencao: "Produzir três práticas graduadas sobre tamanho, extremo e relação entre intervalos.",
    microssequencias: [batch.microssequencia],
    progressao: ["Calcular o extremo.", "Calcular o tamanho.", "Classificar contiguidade, lacuna e sobreposição."] };
}

const ANALYSIS = [
  ["Intervalo inclusivo de bytes", "Representa que os dois extremos pertencem ao intervalo."],
  ["Contiguidade e sobreposição", "Distingue próximo endereço, compartilhamento de extremo e lacuna."]
];
const REQUIREMENTS = [
  "Calcular um extremo e o tamanho de um intervalo inclusivo",
  "Distinguir contiguidade de sobreposição comparando extremos"
];

function unitCalibration() {
  return { motivo: "Calibração contextual do B-2 para três práticas graduadas.", parametros: {
    maximo_ideias_novas_por_unidade: 1,
    formas_de_explicacao: ["plain_definition"],
    oportunidades_distintas_por_requisito: 1,
    dimensoes_de_variacao_da_pratica: ["case_or_data"],
    alvo_palavras_conversa: 90,
    alvo_palavras_unidade: 60,
    distribuicao_da_pratica: "interleaved",
    posicao_da_pratica: "after_explanation",
    alvo_microssequencias_por_parte: 1,
    alvo_partes_por_lote: 1,
    frequencia_de_pausa: "each_part",
    preferencia_da_conversa: "concise"
  } };
}

function materializationUnits(batch) {
  return batch.unidades.map((original, index) => {
    const unit = withoutDerivedPosition(original);
    const application = unit.aplicacaoPedagogica ?? {};
    const introduced = index === 0 ? [ANALYSIS[0][0]]
      : index === 2 ? [ANALYSIS[1][0]] : [];
    const ideas = [...new Set(application.ideiasUtilizadas ?? [])]
      .filter(idea => !introduced.includes(idea));
    const explanations = (application.explicacoes ?? [])
      .filter(explanation => introduced.includes(explanation.ideia))
      .map(explanation => ({ ...explanation,
        formas: [...new Set(["plain_definition", ...(explanation.formas ?? [])])] }));
    const requirement = index < 2 ? REQUIREMENTS[0] : REQUIREMENTS[1];
    unit.configuracao = unit.configuracao ?? unitCalibration();
    unit.aplicacaoPedagogica = { ...application, modo: "practice",
      ideiasIntroduzidas: introduced,
      ideiasUtilizadas: ideas,
      explicacoes: explanations,
      cobertura: [index < 2
        ? "Calcular o extremo final e o tamanho de intervalos inclusivos de bytes."
        : "Distinguir contiguidade, sobreposição e lacuna comparando os extremos."],
      praticas: (application.praticas ?? []).map(practice => ({ ...practice, requisito: requirement })) };
    return unit;
  });
}

function materializationExplanations(batch) {
  const explanations = structuredClone(batch.explicacoes);
  explanations[0].conteudo = completeHumanContent(explanations[0].conteudo, { explanation: true });
  const content = explanations[0].conteudo.content;
  explanations[0].reconciliacao = explanationReconciliationTargets(explanations[0].conteudo)
    .filter(target => target.text.trim())
    .map((target, index) => ({
      recurso: content.findIndex(instance => instance.id === target.resourceId) + 1,
      folha: target.path,
      trecho: target.text,
      papel: index === 0 ? "introduced" : "support",
      motivo: index === 0
        ? "A passagem introduz inclusão dos extremos e prepara as três práticas do B-2."
        : "A passagem real do B-2 sustenta a representação ou o exemplo observado.",
      ideias: index === 0 ? [ANALYSIS[0][0]] : [],
      requisitos: index === 0 ? REQUIREMENTS : []
    }));
  return explanations;
}

function withoutDerivedPosition(unit) {
  const value = structuredClone(unit);
  delete value.posicao;
  return value;
}

function contentOf(entry) {
  if (entry?.studyUnit) return entry.studyUnit;
  if (entry?.content && !Array.isArray(entry.content)) return entry.content;
  return entry;
}

function observed(value) { return String(value).trim().slice(0, 480); }

function choiceOptionFeedback(content) {
  return (content?.response?.data?.options ?? [])
    .map(option => option.feedback)
    .filter(value => typeof value === "string" && value.trim());
}

function syntheticNegativeControl(original) {
  const value = structuredClone(original);
  delete value.id;
  delete value.position;
  value.response = { ...value.response, data: { ...value.response.data,
    options: value.response.data.options.map(({ feedback, ...option }) => option) } };
  const feedback = value.feedback[0];
  value.feedback = [{ ...feedback, data: { ...feedback.data,
    text: "Revise a classificação comparando os extremos." } }];
  return value;
}

function decodeBasisHash(reference) {
  const encoded = String(reference).replaceAll("-", "+").replaceAll("_", "/");
  return JSON.parse(Buffer.from(encoded, "base64").toString("utf8")).basisHash;
}

async function readFocalReview(client, course, batch) {
  const query = { curso: course, microssequencia: batch.microssequencia };
  const response = await client.call("preparar_revisao", query);
  let context = response.context;
  if (context?.fragmento) {
    const fragments = [];
    for (;;) {
      assert.equal(context.fragmento.formato, "application/json");
      fragments.push(context.fragmento.texto);
      if (!context.temMais || context.continuacao === null) break;
      const next = await client.call("preparar_revisao", { ...query, continuacao: context.continuacao });
      context = next.context;
      assert.ok(context?.fragmento, "A continuação da revisão deve devolver o próximo fragmento literal.");
    }
    context = JSON.parse(fragments.join(""));
  }
  const studies = context?.studyUnits;
  assert.ok(Array.isArray(studies) && studies.length === 3,
    `A revisão focal deve devolver as três práticas do B-2 (recebidas ${Array.isArray(studies) ? studies.length : "não-array"}: ${JSON.stringify((studies ?? []).map(entry => contentOf(entry)?.title ?? null))}).`);
  const missingStudyEvidence = studies.filter(entry => {
    const content = contentOf(entry);
    return !(content?.response && content?.feedback?.length);
  });
  assert.equal(missingStudyEvidence.length, 0,
    `A leitura real perdeu resposta ou feedback específico de uma prática: ${JSON.stringify(missingStudyEvidence.map(entry => ({
      entryKeys: Object.keys(entry), studyUnitKeys: Object.keys(entry.studyUnit ?? {}),
      contentKeys: Object.keys(contentOf(entry) ?? {}), directResponse: Boolean(entry.response),
      directFeedback: Array.isArray(entry.feedback) ? entry.feedback.length : null,
      studyResponse: Boolean(entry.studyUnit?.response), studyFeedback: Array.isArray(entry.studyUnit?.feedback) ? entry.studyUnit.feedback.length : null
    })))}.`);
  const explanation = context?.explicacoes?.find(item => item.microssequencia === batch.microssequencia);
  assert.ok(explanation?.referenciaInspecao, "A explicação focal precisa devolver referência de inspeção.");
  assert.equal(explanation.auditoriaPedagogica.units.length, 3);
  return { response, context, studies, explanation };
}

function initialNeedsAttentionReport(batch, review) {
  const first = contentOf(review.studies[0]);
  const third = contentOf(review.studies[2]);
  const explanationText = batch.explicacoes[0].conteudo.content[0].data.text;
  const tableTitle = batch.explicacoes[0].conteudo.content[3].data.title;
  const thirdFeedback = third.feedback[0].data.text;
  return { summary: "Controle negativo sintético: a unidade foi degradada deliberadamente para testar a detecção de feedback insuficiente.",
    outcome: "needs_attention",
    findings: ["O controle removeu os feedbacks específicos das alternativas e deixou apenas uma orientação geral; a base degradada não explica cada decisão dos pares."],
    checks: [
      { dimension: "alignment", result: "sufficient", reason: "A explicação e as três práticas seguem o objetivo de calcular e comparar intervalos.", evidence: [observed(explanationText)] },
      { dimension: "evidence", result: "sufficient", reason: "A primeira prática expõe o cálculo com dados e resposta observável.", evidence: [observed(first.content[0].data.text)] },
      { dimension: "representation", result: "sufficient", reason: "A tabela corrente explicita os testes nos extremos.", evidence: [observed(tableTitle)] },
      { dimension: "feedback", result: "insufficient", reason: "A degradação controlada removeu a explicação específica de cada alternativa; restaure o B-2 original antes de declarar consistência.", evidence: [observed(thirdFeedback)] },
      { dimension: "sufficiency", result: "sufficient", reason: "As três práticas cobrem extremo, tamanho e comparação de relações.", evidence: batch.unidades.map(unit => observed(unit.conteudo.content[0].data.text)) }
    ] };
}

function currentReport(batch, restoredThird) {
  const explanationText = batch.explicacoes[0].conteudo.content[0].data.text;
  const restoredFeedback = choiceOptionFeedback(restoredThird)[0];
  return { summary: "A nova leitura confirma as três práticas e o feedback comparativo reparado.", outcome: "consistent", findings: [], checks: [
    { dimension: "alignment", result: "sufficient", reason: "O percurso e as três práticas seguem o objetivo do mapa.", evidence: [observed(explanationText)] },
    { dimension: "evidence", result: "sufficient", reason: "Cada prática possui dados, resposta e regra observável.", evidence: batch.unidades.map(unit => observed(unit.conteudo.content[0].data.text)) },
    { dimension: "representation", result: "sufficient", reason: "A memória e a tabela representam os extremos e as relações necessárias.", evidence: [observed(batch.explicacoes[0].conteudo.content[1].data.prompt)] },
    { dimension: "feedback", result: "sufficient", reason: "O B-2 original restaurado retém feedback específico nas alternativas e a explicação geral da classificação.", evidence: [observed(restoredFeedback)] },
    { dimension: "sufficiency", result: "sufficient", reason: "A sequência cobre cálculo, tamanho e classificação com variação real.", evidence: batch.unidades.map(unit => observed(unit.conteudo.title)) }
  ] };
}

async function anonymousActionMustFail(config) {
  const response = await fetch(`${config.projectUrl}/functions/v1/aralearn-authoring-action/criar_curso`, {
    method: "POST", headers: { "Content-Type": "application/json", Origin: "https://chatgpt.com" },
    body: JSON.stringify({ arguments: { titulo: "sem autenticação", objetivo: "deve falhar" } })
  });
  assert.ok([401, 403].includes(response.status), `A Action anônima não foi recusada: HTTP ${response.status}`);
  await response.arrayBuffer();
}

async function warmActionWorker(config) {
  const response = await fetch(`${config.projectUrl}/functions/v1/aralearn-authoring-action`, {
    method: "OPTIONS", headers: { Origin: "https://chatgpt.com", "Access-Control-Request-Method": "POST",
      "Access-Control-Request-Headers": "authorization,content-type" }
  });
  assert.equal(response.status, 200, `Aquecimento do worker Actions: HTTP ${response.status}`);
  await response.arrayBuffer();
}

export async function runFocalClientProof(environment = process.env) {
  const config = localSupabaseConfiguration(environment);
  assert.equal(new URL(config.projectUrl).port, String(STACK_PORT), "A prova exige a porta isolada 44221.");
  const batch = await loadExperiment();
  const marker = randomUUID();
  const email = `b2-${marker}@example.test`;
  const password = `B2-${marker}-Aa1!`;
  const measurements = [];
  const mcpLifecycle = {};
  const actionLifecycle = {};
  let userId;
  let primaryError = null;
  const result = { contract: "aralearn.revisao-v7.focal-client-proof.v3", stack: {
    projectUrl: config.projectUrl, apiPort: STACK_PORT, sourceStackTouched: false
  }, authorization: {}, persistence: {}, measurements };
  try {
    const created = await createConfirmedLocalUser(config, { email, password, marker });
    assert.equal(created.response.status, 200);
    userId = created.payload.id;
    const signedIn = await signInLocalUser(config, { email, password });
    assert.equal(signedIn.response.status, 200);
    const userAccessToken = signedIn.payload.access_token;
    await warmActionWorker(config);
    await anonymousActionMustFail(config);
    result.authorization.anonymousAction = "rejected";
    await authorizeLocalMcpSession(config, { userAccessToken, userId, lifecycle: mcpLifecycle });
    await authorizeLocalActionSession(config, { userAccessToken, userId, lifecycle: actionLifecycle,
      applicationOrigin: LOCAL_APPLICATION_ORIGIN });
    result.authorization.mcp = { oauth: true, userId };
    result.authorization.actions = { oauth: true, userId };
    const mcp = wireClient(config, "mcp", mcpLifecycle.accessToken, measurements);
    const actions = wireClient(config, "actions", actionLifecycle.accessToken, measurements);
    await mcp.initialize();

    const courseTitle = `${batch.curso} — prova local B-2 ${marker.slice(0, 8)}`;
    const createdCourse = await mcp.call("criar_curso", { titulo: courseTitle,
      objetivo: "Calcular e comparar intervalos inclusivos de bytes." });
    const courseId = createdCourse.deepLink?.match(/\/courses\/([0-9a-f-]{36})/u)?.[1] || null;
    assert.ok(courseId, "A criação MCP não devolveu deep link do curso.");
    const savedMap = await mcp.call("salvar_mapa_curricular", focalMap(courseTitle, batch));
    const savedPlan = await mcp.call("consultar_planejamento", { curso: courseTitle });
    assert.equal(savedPlan.context.mapaCurricular.publico, "Pessoas iniciantes em aritmética de endereços e intervalos de memória");
    await mcp.call("aprovar_mapa_curricular", { referencia: savedMap.context.referenciaParaAprovar });
    for (const [enunciado, descricao] of ANALYSIS) await mcp.call("manter_unidade_analise", {
      curso: courseTitle, operacao: "criar", enunciado, descricao
    });
    for (const enunciado of REQUIREMENTS) await mcp.call("manter_requisito_evidencia", {
      curso: courseTitle, operacao: "criar", enunciado
    });
    await mcp.call("vincular_repertorio_instrucional", { curso: courseTitle,
      microssequencia: batch.microssequencia, analise: ANALYSIS.map(([enunciado]) => enunciado), evidencias: REQUIREMENTS });
    await mcp.call("salvar_parte", focalPart(courseTitle, batch));
    await mcp.call("materializar_parte", { curso: courseTitle, microssequencia: batch.microssequencia,
      concluir: true, unidades: materializationUnits(batch), explicacoes: materializationExplanations(batch) });

    const pristine = await readFocalReview(mcp, courseTitle, batch);
    const pristineThird = structuredClone(contentOf(pristine.studies[2]));
    assert.equal(choiceOptionFeedback(pristineThird).length, pristineThird.response.data.options.length,
      "O B-2 pristine precisa conservar feedback específico em cada alternativa.");
    const pristineBasisHash = decodeBasisHash(pristine.explanation.referenciaInspecao);

    const degradedContent = syntheticNegativeControl(pristineThird);
    await actions.call("aplicar_correcoes", { curso: courseTitle, correcoes: [{
      unidade: degradedContent.title, conteudo: degradedContent
    }] });
    const degraded = await readFocalReview(mcp, courseTitle, batch);
    const degradedThird = contentOf(degraded.studies[2]);
    assert.equal(choiceOptionFeedback(degradedThird).length, 0,
      "O controle negativo sintético precisa remover os feedbacks específicos das alternativas.");
    const degradedBasisHash = decodeBasisHash(degraded.explanation.referenciaInspecao);
    assert.notEqual(degradedBasisHash, pristineBasisHash, "A degradação controlada precisa gerar nova base.");

    const needs = await actions.call("registrar_inspecao", { referencia: degraded.explanation.referenciaInspecao,
      parecer: initialNeedsAttentionReport(batch, degraded) });
    assert.equal(needs.context.inspecaoIA.state, "current");
    assert.equal(needs.context.inspecaoIA.report.outcome, "needs_attention");

    const restoredContent = structuredClone(pristineThird);
    delete restoredContent.id;
    delete restoredContent.position;
    await actions.call("aplicar_correcoes", { curso: courseTitle, correcoes: [{
      unidade: restoredContent.title, conteudo: restoredContent
    }] });

    const restored = await readFocalReview(mcp, courseTitle, batch);
    const restoredThird = contentOf(restored.studies[2]);
    assert.equal(choiceOptionFeedback(restoredThird).length, restoredThird.response.data.options.length,
      "A restauração precisa devolver literalmente o feedback específico do B-2.");
    assert.deepEqual(restoredThird.response, pristineThird.response,
      "A resposta restaurada deve conservar todas as alternativas e seus feedbacks originais.");
    assert.deepEqual(restoredThird.feedback, pristineThird.feedback,
      "O feedback geral restaurado deve coincidir com o B-2 original.");
    const restoredBasisHash = decodeBasisHash(restored.explanation.referenciaInspecao);
    assert.notEqual(restoredBasisHash, degradedBasisHash, "A restauração precisa gerar nova base, não reciclar a base degradada.");
    const current = await actions.call("registrar_inspecao", { referencia: restored.explanation.referenciaInspecao,
      parecer: currentReport(batch, restoredThird) });
    assert.equal(current.context.inspecaoIA.state, "current");
    assert.equal(current.context.inspecaoIA.report.outcome, "consistent");
    assert.deepEqual(current.context.inspecaoIA.report.checks.map(check => check.dimension), REPORT_DIMENSIONS);

    const final = await readFocalReview(mcp, courseTitle, batch);
    assert.equal(choiceOptionFeedback(contentOf(final.studies[2])).length,
      contentOf(final.studies[2]).response.data.options.length,
      "A leitura final precisa conservar o B-2 original, não o controle degradado.");
    assert.deepEqual(contentOf(final.studies[2]).response, pristineThird.response);
    assert.deepEqual(contentOf(final.studies[2]).feedback, pristineThird.feedback);
    assert.equal(final.explanation.inspecaoIA.state, "current");
    assert.equal(final.explanation.inspecaoIA.report.outcome, "consistent");
    assert.equal(final.explanation.auditoriaPedagogica.units.length, 3);
    assert.ok(final.studies.every(entry => contentOf(entry)?.response && contentOf(entry)?.feedback?.length));
    result.persistence = { courseId, targetKind: "microsequence_explanation",
      basisHash: final.explanation.inspecaoIA.basisHash, inspectionState: final.explanation.inspecaoIA.state,
      control: { type: "synthetic_negative_control", target: "third study unit",
        pristineBasisHash, degradedBasisHash, restoredBasisHash,
        degradedOutcome: "needs_attention", restoredOutcome: "consistent" },
      initialOutcome: "needs_attention", finalOutcome: "consistent",
      practiceCount: final.explanation.auditoriaPedagogica.units.length,
      checks: final.explanation.inspecaoIA.report.checks.map(check => ({ dimension: check.dimension, result: check.result })),
      crossChannel: "MCP create/materialize/read + Actions inspect/repair/inspect", sourceStackTouched: false };
  } catch (error) {
    primaryError = error;
  }

  const cleanupErrors = [];
  if (mcpLifecycle.clientId) try { await cleanupLocalMcpSession(config, mcpLifecycle); }
  catch (error) { cleanupErrors.push(error); }
  if (userId) try {
    const removed = await removeLocalUser(config, userId);
    if (!removed || ![200, 204].includes(removed.response.status)) throw new Error(`Remoção da pessoa fixture: HTTP ${removed?.response?.status}`);
  } catch (error) { cleanupErrors.push(error); }
  if (cleanupErrors.length) throw new AggregateError(primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors,
    "A limpeza da prova focal isolada falhou.");
  if (primaryError) throw primaryError;
  return result;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) {
  console.log(JSON.stringify(await runFocalClientProof(process.env), null, 2));
}
