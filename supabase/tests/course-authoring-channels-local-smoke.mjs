import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { CourseSupabaseAdapter } from "../functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { encodeCourseActionTaskRequest } from "../functions/_shared/aralearn-authoring/courseActionBindings.js";
import { resolveHumanCourseContext } from "../functions/_shared/aralearn-authoring/courseHumanTaskExecutor.js";
import { humanMaterializationUnitPlan } from "../functions/_shared/aralearn-authoring/courseHumanMaterialization.js";
import { inspectExplanationReconciliation } from "../../src/domain/courseExplanationReconciliation.js";
import { canonicalAuthoringValue } from "../../src/domain/courseAuthoringBasis.js";
import { curricularMap, explanationUnit, practiceUnit, paragraph } from "./course-authoring-current-local-smoke.mjs";
import { localSupabaseConfiguration, createConfirmedLocalUser, signInLocalUser, removeLocalUser,
  createLocalFixtureClient, trackLocalFixtureCreation,
  authorizeLocalMcpSession, cleanupLocalMcpSession, authorizeLocalActionSession,
  LOCAL_APPLICATION_ORIGIN, CHATGPT_ACTION_ORIGIN } from "../../tests/support/localSupabaseE2e.js";

const SOURCE = "Fonte sintética sobre sockets";
const CASES = ["navegador", "cliente de correio", "aplicativo de mensagens", "monitor de serviço", "cliente de arquivos", "aplicativo de agenda"];
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const size = text => ({ utf8Bytes: Buffer.byteLength(text, "utf8"), utf16CodeUnits: text.length,
  unicodeCodePoints: [...text].length });
const microsequences = exported => exported.artifact.document.courses[0].modules.flatMap(module =>
  module.lessons.flatMap(lesson => lesson.microsequences));

export function channelFixtures(course) {
  const map = curricularMap(course);
  const idea = explanationUnit().aplicacaoPedagogica.ideiasIntroduzidas[0];
  const names = CASES.map(label => `Socket no ${label}`);
  const coverage = CASES.map(label => `Identificar a interface local no ${label}.`);
  const detail = (index, field) => `${field} no ${CASES[index]}. ` +
    "Distinguir o processo em execução, sua interface local e a relação entre as pontas preserva as condições de cada caso. ".repeat(15).trimEnd();
  map.itensDeEscopo = coverage;
  map.modulos[0].licoes[0].microssequencias = names.map((titulo, index) => ({ titulo,
    objetivo: detail(index, "Objetivo"), dependencias: index ? [names[index - 1]] : [], cobertura: [coverage[index]],
    explicacao: { proposito: detail(index, "Propósito"),
      pressupostos: [1, 2, 3].map(position => detail(index, `Pressuposto ${position}`)),
      relacoes: [1, 2, 3].map(position => detail(index, `Relação ${position}`)),
      fontesPrevistas: [SOURCE] } }));
  assert.ok(JSON.stringify(encodeCourseActionTaskRequest("salvar_mapa_curricular", map).arguments).length < 99_999);
  assert.ok(JSON.stringify(map).length > 80_000, "A fixture exercita um mapa extenso sem exceder a entrada Actions.");
  for (const microsequence of map.modulos[0].licoes[0].microssequencias) {
    for (const text of [microsequence.objetivo, microsequence.explicacao.proposito,
      ...microsequence.explicacao.pressupostos, ...microsequence.explicacao.relacoes]) assert.ok(text.length <= 2000);
  }
  const links = content => [{ fonte: SOURCE, relacao: "supported_by", papeis: ["tecnica_conceitual"], ancoras: [1],
    ocorrencias: [{ lugar: "conteudo", recurso: 1, folha: "text", trecho: content.content[0].data.text }] }];
  const lots = [0, 1].map(lot => {
    const indexes = [lot * 3, lot * 3 + 1, lot * 3 + 2];
    const units = indexes.flatMap(index => {
      const theory = explanationUnit(); const practice = practiceUnit();
      for (const unit of [theory, practice]) {
        unit.microssequencia = names[index];
        unit.configuracao.parametros.alvo_microssequencias_por_parte = 3;
        unit.aplicacaoPedagogica.cobertura = [coverage[index]];
        unit.conteudo.title += ` — ${CASES[index]}`;
      }
      theory.conteudo.content[0].data.text += ` No ${CASES[index]}, o processo usa essa interface para entregar dados ao transporte.`;
      if (index > 0) {
        theory.aplicacaoPedagogica.ideiasIntroduzidas = [];
      }
      practice.posicao = 2;
      practice.conteudo.content[0].data.text = `Um ${CASES[index]} precisa entregar dados ao transporte. Identifique a interface local usada pelo processo; diferencie-a da relação entre as pontas da comunicação.`;
      practice.aplicacaoPedagogica.praticas[0].requisito = coverage[index];
      practice.aplicacaoPedagogica.praticas[0].oportunidade = `identificar-interface-caso-${index + 1}`;
      for (const unit of [theory, practice]) unit.fontes = links(unit.conteudo);
      return [theory, practice];
    });
    const explanations = indexes.map(index => ({ microssequencia: names[index], conteudo: {
      title: `Processo e interface no ${CASES[index]}`,
      content: [paragraph(`support-${index + 1}`, `Um processo é um programa em execução. Para enviar dados, ele usa uma interface local chamada socket. Essa interface permite entregar dados ao transporte e receber os dados destinados ao processo. Uma conexão relaciona as pontas da comunicação; um socket representa a interface local de uma dessas pontas. No ${CASES[index]}, separe o programa em execução, a interface que ele usa e a relação entre os participantes. Um processo pode usar vários sockets. O socket pode existir antes de uma conexão. Esses papéis distintos explicam por que trocar o programa não equivale simplesmente a trocar a conexão.`)] } }));
    for (const [position, explanation] of explanations.entries()) {
      const index = indexes[position];
      explanation.fontes = links(explanation.conteudo);
      explanation.reconciliacao = [{ recurso: 1, folha: "text", trecho: explanation.conteudo.content[0].data.text,
        papel: index === 0 ? "introduced" : "revisited", ideias: [idea.nome], requisitos: [coverage[index]],
        motivo: index === 0 ? "Introduz a interface local a partir dos pré-requisitos de processo e transporte."
          : "Retoma a interface local estabelecida no primeiro caso para uma aplicação distinta." }];
    }
    return { part: { curso: course, titulo: `Casos de comunicação ${lot + 1}`,
      intencao: "Distinguir processo, interface e relação entre participantes em três casos concretos.",
      microssequencias: indexes.map(index => names[index]), progressao: indexes.map(index => coverage[index]) },
    materialization: { curso: course, parte: lot + 1, unidades: units, explicacoes: explanations } };
  });
  const repertoire = [{ task: "manter_unidade_analise", args: {
    curso: course, operacao: "criar", enunciado: idea.nome, descricao: idea.descricao } },
  ...coverage.map(enunciado => ({ task: "manter_requisito_evidencia", args: { curso: course, operacao: "criar", enunciado } })),
  ...names.map((microssequencia, index) => ({ task: "vincular_repertorio_instrucional", args: {
    curso: course, microssequencia, analise: [idea.nome], evidencias: [coverage[index]] } }))];
  return { map, lots, repertoire };
}

export function wireClient(config, channel, accessToken, measurements) {
  let serial = 0;
  const endpoint = `${config.projectUrl}/functions/v1/aralearn-authoring-${channel === "mcp" ? "mcp" : "action"}`;
  async function exchange(task, args, method = "tools/call") {
    const action = channel === "mcp" ? null : encodeCourseActionTaskRequest(task, args);
    const value = channel === "mcp" ? { jsonrpc: "2.0", id: ++serial, method,
      params: method === "tools/call" ? { name: task, arguments: args } : args } : action.arguments;
    const body = JSON.stringify(value); const started = performance.now();
    const response = await fetch(channel === "mcp" ? endpoint : `${endpoint}/${encodeURIComponent(action.operationName)}`, {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json",
        Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25",
        Origin: channel === "mcp" ? LOCAL_APPLICATION_ORIGIN : CHATGPT_ACTION_ORIGIN }, body });
    const source = await response.text();
    measurements.push({ channel, task, method: channel === "mcp" ? method : "POST", status: response.status,
      ...(action ? { operationName: action.operationName } : {}),
      elapsedMs: Math.round((performance.now() - started) * 100) / 100,
      arguments: size(JSON.stringify(args)), request: size(body), response: size(source),
      contract: response.headers.get("x-aralearn-authoring-contract") });
    assert.equal(response.status, 200, `${channel}/${task}: HTTP ${response.status}: ${source.slice(0, 2000)}`);
    const parsed = JSON.parse(source);
    if (channel === "mcp") {
      assert.ok(!parsed.error && !parsed.result?.isError, `${task}: ${JSON.stringify(parsed).slice(0, 2200)}`);
      return method === "tools/call" ? parsed.result.structuredContent : parsed.result;
    }
    assert.ok(!parsed.error, `${task}: ${JSON.stringify(parsed).slice(0, 2200)}`);
    return parsed;
  }
  return { call: (task, args) => exchange(task, args), initialize: async () => {
    if (channel !== "mcp") return;
    await exchange("initialize", { protocolVersion: "2025-11-25", capabilities: {}, clientInfo: {
      name: "aralearn-synthetic-local-channel-proof", version: "1.0.0" } }, "initialize");
    const listed = await exchange("tools/list", {}, "tools/list");
    for (const name of ["criar_curso", "materializar_parte", "exportar_autoria"]) {
      assert.ok(listed.tools.some(tool => tool.name === name), `Catálogo MCP sem ${name}.`);
    }
  } };
}

async function completeRead(client, task, args) {
  let continuation; let literal = ""; let pages = 0; let result;
  do {
    result = await client.call(task, { ...args, ...(continuation ? { continuacao: continuation } : {}) });
    if (result.context.fragmento) {
      const fragment = result.context.fragmento;
      assert.equal(fragment.inicio, literal.length); literal += fragment.texto;
      assert.equal(fragment.fim, literal.length);
    }
    continuation = result.context.continuacao;
    assert.ok(++pages < 80, "A leitura integral não terminou em 80 páginas.");
  } while (continuation);
  return { context: literal ? JSON.parse(literal) : result.context, pages };
}

export async function materializeChannelPart(client, lot) {
  const { curso, parte, unidades, explicacoes } = lot.materialization;
  const prepared = await completeRead(client, "preparar_materializacao", {
    curso, parte, plano: unidades.map(humanMaterializationUnitPlan), explicacoes });
  assert.equal(prepared.context.preflight.state, "ready", JSON.stringify(prepared.context.preflight.blockers));
  assert.equal(prepared.context.parte.microssequencias.length, lot.part.microssequencias.length);
  await client.call("materializar_parte", { ...lot.materialization,
    referenciaPreparo: prepared.context.preflight.referencia });
  return prepared;
}

export async function runLocalAuthoringChannels(environment = process.env) {
  const config = localSupabaseConfiguration(environment);
  const marker = randomUUID(); const password = `Channels-${marker}-Aa1!`;
  const email = `channels-${marker}@example.test`; const courses = []; const measurements = [];
  const mcpLifecycle = {}; const actionLifecycle = {}; let userId; let primaryError; let ownerClient;
  const adapter = new CourseSupabaseAdapter({ supabaseUrl: config.projectUrl, publicSupabaseUrl: config.projectUrl,
    serverApiKey: config.adminKey, publishableKey: config.publishableKey,
    publicAppUrl: environment.ARALEARN_LOCAL_APPLICATION_ORIGIN || LOCAL_APPLICATION_ORIGIN, attempts: 1 });
  const results = [];
  try {
    const created = await createConfirmedLocalUser(config, { email, password, marker });
    assert.equal(created.response.status, 200);
    userId = created.payload.id;
    const signIn = await signInLocalUser(config, { email, password });
    assert.equal(signIn.response.status, 200);
    const userAccessToken = signIn.payload.access_token;
    ownerClient = await createLocalFixtureClient(config, { ownerId: userId, accessToken: userAccessToken,
      origin: environment.ARALEARN_LOCAL_APPLICATION_ORIGIN || LOCAL_APPLICATION_ORIGIN });
    const principal = { actorId: userId, authenticationKind: "oauth", scopes: ["authoring:read", "authoring:write"] };
    for (const channel of ["actions", "mcp"]) {
      const lifecycle = channel === "mcp" ? mcpLifecycle : actionLifecycle;
      await (channel === "mcp" ? authorizeLocalMcpSession : authorizeLocalActionSession)(config, {
        userAccessToken, userId, lifecycle,
        applicationOrigin: environment.ARALEARN_LOCAL_APPLICATION_ORIGIN || LOCAL_APPLICATION_ORIGIN });
      const client = wireClient(config, channel, lifecycle.accessToken, measurements);
      await client.initialize();
      const title = `Fixture canais ${channel} ${marker.slice(0, 8)}`;
      const fixture = channelFixtures(title);
      await trackLocalFixtureCreation(config, { ownerId: userId,
        courseIdFromResult: result => { const id = result.deepLink?.match(/\/courses\/([0-9a-f-]{36})/u)?.[1]; if (id) courses.push(id); return id; },
        create: () => client.call("criar_curso", { titulo: title, objetivo: "Distinguir processo, socket e conexão em seis casos sintéticos." }) });
      const initial = await resolveHumanCourseContext({ adapter, principal, course: title });
      const courseId = initial.course.id; assert.ok(courses.includes(courseId));
      await client.call("manter_fonte", { curso: title, metadados: { titulo: SOURCE,
        papeisSugeridos: ["tecnica_conceitual"], citacao: "AraLearn. Fonte sintética sobre sockets para testes locais. 2026.",
        verificacao: "nao_verificada", visibilidadeNoEstudo: "citacao" }, ancoras: [{
        seletor: { tipo: "paginas", paginaInicial: 1, paginaFinal: 1 }, localizadorHumano: "p. 1 da fixture",
        trechoDeVerificacao: "Um socket liga o processo ao transporte." }] });
      const confirmation = await client.call("salvar_mapa_curricular", fixture.map);
      assert.ok(measurements.at(-1).response.utf8Bytes < 4000, "A confirmação de escrita não deve repetir o mapa.");
      const recovered = await client.call("consultar_planejamento", { curso: title, resumo: true });
      assert.ok(measurements.at(-1).response.utf8Bytes < 4000, "A recuperação deve permanecer pequena.");
      assert.equal(recovered.context.referenciaParaAprovar, confirmation.context.referenciaParaAprovar);
      assert.equal(recovered.context.revisaoDoCurso, confirmation.context.revisaoDoCurso);
      assert.ok(recovered.context.referenciaParaAprovar);
      assert.ok(Number.isInteger(recovered.context.revisaoDoCurso));
      const savedMap = await completeRead(client, "consultar_planejamento", { curso: title });
      assert.ok(savedMap.pages > 1, "O planejamento extenso precisa de continuação.");
      assert.equal(savedMap.context.referenciaParaAprovar, recovered.context.referenciaParaAprovar);
      const expectedMicros = fixture.map.modulos[0].licoes[0].microssequencias;
      const savedMicros = savedMap.context.mapaCurricular.modulos[0].licoes[0].microssequencias;
      assert.equal(savedMicros.length, expectedMicros.length);
      for (const [index, expected] of expectedMicros.entries()) {
        assert.equal(savedMicros[index].objetivo, expected.objetivo);
        for (const field of ["proposito", "pressupostos", "relacoes"]) {
          assert.deepEqual(savedMicros[index].explicacao[field], expected.explicacao[field]);
        }
      }
      for (const task of ["consultar_planejamento", "retomar_curso"]) {
        const start = measurements.length;
        const focused = await completeRead(client, task, { ...(task === "retomar_curso" ? { titulo: title } : { curso: title }),
          microssequencia: expectedMicros[0].titulo });
        const focalLiteral = JSON.stringify(focused.context);
        assert.ok(focalLiteral.includes(expectedMicros[0].objetivo), "O foco conserva seu objetivo integral.");
        assert.ok(!focalLiteral.includes(expectedMicros.at(-1).titulo), "A retomada focal não inclui o último ramo do curso.");
        assert.ok(focused.pages < savedMap.pages, "O foco não deve transportar o mapa completo.");
        for (const measurement of measurements.slice(start)) {
          assert.ok(measurement.response.utf8Bytes < 20_000, "Cada resposta focal deve caber no orçamento de transporte.");
        }
      }
      await client.call("aprovar_mapa_curricular", { referencia: savedMap.context.referenciaParaAprovar });
      for (const entry of fixture.repertoire) await client.call(entry.task, entry.args);
      let firstLot; let firstSourceLinks; const lots = [];
      for (const [index, lot] of fixture.lots.entries()) {
        await client.call("salvar_parte", lot.part);
        const prepared = await materializeChannelPart(client, lot);
        const read = await completeRead(client, "exportar_autoria", { recorte: { curso: title } });
        const exported = read.context.authoringExport;
        const context = await resolveHumanCourseContext({ adapter, principal, course: title, part: index + 1 });
        const independentlyRead = await adapter.getCourseAuthoringExport({ principal, courseId,
          expectedRevision: context.course.revision, scope: { kind: "course", ref: null } });
        assert.deepEqual(exported, independentlyRead, "O canal deve devolver o mesmo export integral da revisão corrente.");
        const all = microsequences(exported); const materialized = all.filter(ms => ms.explanation);
        assert.equal(materialized.length, (index + 1) * 3);
        assert.equal(materialized.reduce((total, ms) => total + ms.studyUnits.length, 0), (index + 1) * 6);
        assert.equal(exported.artifact.explanationSources.length, (index + 1) * 3);
        for (const expected of lot.materialization.explicacoes) {
          const actual = all.find(ms => ms.title === expected.microssequencia).explanation;
          assert.deepEqual({ title: actual.title, content: actual.content }, expected.conteudo);
          const reconciliation = actual.reconciliation;
          const checked = inspectExplanationReconciliation(actual, {
            contentBasis: createHash("sha256").update(canonicalAuthoringValue(expected.conteudo)).digest("hex"),
            analysisUnitIds: context.plan.plan.instructionalAnalysisUnits.map(item => item.id),
            evidenceRequirementIds: context.plan.plan.evidenceRequirements.map(item => item.id),
            microsequenceIds: all.map(item => item.id) });
          assert.equal(checked.ready, true, JSON.stringify(checked.blockers));
          assert.equal(reconciliation.entries.length, 1);
          assert.equal(reconciliation.entries[0].quote, expected.reconciliacao[0].trecho);
          assert.equal(reconciliation.entries[0].role, expected.reconciliacao[0].papel);
          assert.deepEqual(reconciliation.entries[0].analysisUnitIds, expected.reconciliacao[0].ideias.map(statement =>
            context.plan.plan.instructionalAnalysisUnits.find(item => item.statement === statement).id));
          assert.deepEqual(reconciliation.entries[0].evidenceRequirementIds, expected.reconciliacao[0].requisitos.map(statement =>
            context.plan.plan.evidenceRequirements.find(item => item.statement === statement).id));
        }
        const stableSourceLinks = all.slice(0, 3).map(ms => {
          const read = exported.artifact.explanationSources.find(item => item.query.targetId === ms.id);
          assert.ok(read, "A Explicação do primeiro lote perdeu sua leitura de proveniência.");
          return { microsequenceId: read.query.targetId, items: read.items };
        });
        if (index === 0) { firstLot = structuredClone(all.slice(0, 3)); firstSourceLinks = structuredClone(stableSourceLinks); }
        else {
          assert.deepEqual(all.slice(0, 3), firstLot, "O segundo lote alterou o conteúdo do primeiro.");
          assert.deepEqual(stableSourceLinks, firstSourceLinks, "O segundo lote alterou as fontes do apoio do primeiro.");
        }
        lots.push({ lot: index + 1, revision: context.course.revision, preparePages: prepared.pages,
          exportPages: read.pages, studyUnits: (index + 1) * 6, explanations: materialized.length,
          firstLotContentSha256: digest(firstLot), firstLotSourceLinksSha256: digest(firstSourceLinks) });
      }
      results.push({ channel, lots, firstLotPreserved: true, independentExportMatches: true });
    }
  } catch (error) { primaryError = error; }
  const cleanupErrors = [];
  for (const courseId of courses) {
    await ownerClient.maintainCourse({ courseId,
      operation: "delete_owned_course", confirmed: true, requestId: randomUUID() })
      .then(result => assert.equal(result.fileCleanupPending, false, "A limpeza do curso sintético deve terminar antes da conta."))
      .catch(error => cleanupErrors.push(error));
  }
  await cleanupLocalMcpSession(config, mcpLifecycle).catch(error => cleanupErrors.push(error));
  if (userId && cleanupErrors.length === 0) await removeLocalUser(config, userId).then(result => {
    assert.ok([200, 204, 404].includes(result.response.status), `Limpeza de usuário: HTTP ${result.response.status}`);
  }).catch(error => cleanupErrors.push(error));
  if (cleanupErrors.length) throw new AggregateError(primaryError ? [primaryError, ...cleanupErrors] : cleanupErrors,
    "Falha na limpeza sintética dos canais; identidades pendentes foram preservadas.");
  if (primaryError) throw primaryError;
  return { contract: "aralearn.local-authoring-channels-proof.v1", recordedAt: new Date().toISOString(),
    evidence: "HTTP Edge + OAuth + PostgREST/Auth/Postgres locais reais; cliente Node sintético",
    notProven: ["cliente ChatGPT", "catálogo importado no GPT", "ambiente hospedado", "eficácia pedagógica"],
    cleanup: { completed: true, coursesRemoved: courses.length, syntheticUserRemoved: true, mcpClientRemoved: true }, results, measurements };
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.stdout.write(`${JSON.stringify(await runLocalAuthoringChannels())}\n`);
}
