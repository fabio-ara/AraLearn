import assert from "node:assert/strict";
import { createHash, randomUUID } from "node:crypto";
import { pathToFileURL } from "node:url";
import { CourseSupabaseAdapter } from "../functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";
import { resolveHumanCourseContext } from "../functions/_shared/aralearn-authoring/courseHumanTaskExecutor.js";
import { curricularMap, explanationUnit, practiceUnit, paragraph } from "./course-authoring-current-local-smoke.mjs";
import { localSupabaseConfiguration, createConfirmedLocalUser, signInLocalUser, removeLocalUser,
  authorizeLocalMcpSession, cleanupLocalMcpSession, authorizeLocalActionSession,
  LOCAL_APPLICATION_ORIGIN, CHATGPT_ACTION_ORIGIN } from "../../tests/support/localSupabaseE2e.js";

const SOURCE = "Fonte sintética sobre sockets";
const CASES = ["navegador", "cliente de correio", "aplicativo de mensagens", "monitor de serviço", "cliente de arquivos", "aplicativo de agenda"];
const digest = value => createHash("sha256").update(JSON.stringify(value)).digest("hex");
const size = text => ({ utf8Bytes: Buffer.byteLength(text, "utf8"), utf16CodeUnits: text.length,
  unicodeCodePoints: [...text].length });
const microsequences = exported => exported.artifact.document.courses[0].modules.flatMap(module =>
  module.lessons.flatMap(lesson => lesson.microsequences));

function fixtures(course) {
  const map = curricularMap(course, false);
  const names = CASES.map(label => `Socket no ${label}`);
  const coverage = CASES.map(label => `Identificar a interface local no ${label}.`);
  map.itensDeEscopo = coverage;
  map.modulos[0].licoes[0].microssequencias = names.map((titulo, index) => ({ titulo,
    objetivo: coverage[index], dependencias: index ? [names[index - 1]] : [], cobertura: [coverage[index]],
    explicacao: { proposito: `Relacionar processo, socket e transporte no ${CASES[index]}.`,
      pressupostos: ["Um processo é um programa em execução."],
      relacoes: ["O socket é a interface local; a conexão relaciona as pontas da comunicação."],
      fontesPrevistas: [SOURCE] } }));
  const links = () => [{ fonte: SOURCE, relacao: "supported_by", papeis: ["tecnica_conceitual"], ancoras: [1] }];
  const lots = [0, 1].map(lot => {
    const indexes = [lot * 3, lot * 3 + 1, lot * 3 + 2];
    const units = indexes.flatMap(index => {
      const theory = explanationUnit(); const practice = practiceUnit();
      for (const unit of [theory, practice]) {
        unit.microssequencia = names[index]; unit.fontes = links();
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
      return [theory, practice];
    });
    const explanations = indexes.map(index => ({ microssequencia: names[index], fontes: links(), conteudo: {
      title: `Processo e interface no ${CASES[index]}`,
      content: [paragraph(`support-${index + 1}`, `Um processo é um programa em execução. Para enviar dados, ele usa uma interface local chamada socket. Essa interface permite entregar dados ao transporte e receber os dados destinados ao processo. Uma conexão relaciona as pontas da comunicação; um socket representa a interface local de uma dessas pontas. No ${CASES[index]}, separe o programa em execução, a interface que ele usa e a relação entre os participantes. Um processo pode usar vários sockets. O socket pode existir antes de uma conexão. Esses papéis distintos explicam por que trocar o programa não equivale simplesmente a trocar a conexão.`)] } }));
    return { part: { curso: course, titulo: `Casos de comunicação ${lot + 1}`,
      intencao: "Distinguir processo, interface e relação entre participantes em três casos concretos.",
      microssequencias: indexes.map(index => names[index]), progressao: indexes.map(index => coverage[index]) },
    materialization: { curso: course, parte: lot + 1, unidades: units, explicacoes: explanations } };
  });
  return { map, lots };
}

function wireClient(config, channel, accessToken, measurements) {
  let serial = 0;
  const endpoint = `${config.projectUrl}/functions/v1/aralearn-authoring-${channel === "mcp" ? "mcp" : "action"}`;
  async function exchange(task, args, method = "tools/call") {
    const value = channel === "mcp" ? { jsonrpc: "2.0", id: ++serial, method,
      params: method === "tools/call" ? { name: task, arguments: args } : args } : args;
    const body = JSON.stringify(value); const started = performance.now();
    const response = await fetch(channel === "mcp" ? endpoint : `${endpoint}/${task}`, {
      method: "POST", headers: { Authorization: `Bearer ${accessToken}`, "Content-Type": "application/json",
        Accept: "application/json, text/event-stream", "MCP-Protocol-Version": "2025-11-25",
        Origin: channel === "mcp" ? LOCAL_APPLICATION_ORIGIN : CHATGPT_ACTION_ORIGIN }, body });
    const source = await response.text();
    measurements.push({ channel, task, method: channel === "mcp" ? method : "POST", status: response.status,
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

export async function runLocalAuthoringChannels(environment = process.env) {
  const config = localSupabaseConfiguration(environment);
  const marker = randomUUID(); const password = `Channels-${marker}-Aa1!`;
  const email = `channels-${marker}@example.test`; const courses = []; const measurements = [];
  const mcpLifecycle = {}; const actionLifecycle = {}; let userId; let primaryError;
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
    const principal = { actorId: userId, authenticationKind: "oauth", scopes: ["authoring:read", "authoring:write"] };
    for (const channel of ["actions", "mcp"]) {
      const lifecycle = channel === "mcp" ? mcpLifecycle : actionLifecycle;
      await (channel === "mcp" ? authorizeLocalMcpSession : authorizeLocalActionSession)(config, {
        userAccessToken, userId, lifecycle,
        applicationOrigin: environment.ARALEARN_LOCAL_APPLICATION_ORIGIN || LOCAL_APPLICATION_ORIGIN });
      const client = wireClient(config, channel, lifecycle.accessToken, measurements);
      await client.initialize();
      const title = `Fixture canais ${channel} ${marker.slice(0, 8)}`;
      const fixture = fixtures(title);
      await client.call("criar_curso", { titulo: title, objetivo: "Distinguir processo, socket e conexão em seis casos sintéticos." });
      const initial = await resolveHumanCourseContext({ adapter, principal, course: title });
      const courseId = initial.course.id; courses.push(courseId);
      await client.call("manter_fonte", { curso: title, metadados: { titulo: SOURCE,
        papeisSugeridos: ["tecnica_conceitual"], citacao: "AraLearn. Fonte sintética sobre sockets para testes locais. 2026.",
        verificacao: "nao_verificada", visibilidadeNoEstudo: "citacao" }, ancoras: [{
        seletor: { tipo: "paginas", paginaInicial: 1, paginaFinal: 1 }, localizadorHumano: "p. 1 da fixture",
        trechoDeVerificacao: "Um socket liga o processo ao transporte." }] });
      await client.call("salvar_mapa_curricular", fixture.map);
      await client.call("salvar_mapa_curricular", { ...fixture.map, aprovado: true });
      let firstLot; let firstSourceLinks; const lots = [];
      for (const [index, lot] of fixture.lots.entries()) {
        await client.call("salvar_parte", lot.part);
        const prepared = await completeRead(client, "preparar_materializacao", { curso: title, parte: index + 1 });
        assert.equal(prepared.context.parte.microssequencias.length, 3);
        await client.call("materializar_parte", lot.materialization);
        const read = await completeRead(client, "exportar_autoria", { recorte: { curso: title } });
        const exported = read.context.authoringExport;
        const context = await resolveHumanCourseContext({ adapter, principal, course: title });
        const independentlyRead = await adapter.getCourseAuthoringExport({ principal, courseId,
          expectedRevision: context.course.revision, scope: { kind: "course", ref: null } });
        assert.deepEqual(exported, independentlyRead, "O canal deve devolver o mesmo export integral da revisão corrente.");
        const all = microsequences(exported); const materialized = all.filter(ms => ms.explanation);
        assert.equal(materialized.length, (index + 1) * 3);
        assert.equal(materialized.reduce((total, ms) => total + ms.studyUnits.length, 0), (index + 1) * 6);
        assert.equal(exported.artifact.explanationSources.length, (index + 1) * 3);
        for (const expected of lot.materialization.explicacoes) {
          assert.deepEqual(all.find(ms => ms.title === expected.microssequencia).explanation, expected.conteudo);
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
    await adapter.maintainCourse({ principal: { actorId: userId }, courseId,
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
