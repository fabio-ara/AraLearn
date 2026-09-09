import test from "node:test";
import assert from "node:assert/strict";
import { AuthoringApiError } from "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { executeTrustedCourseWrite } from "../../supabase/functions/_shared/aralearn-authoring/courseHumanTaskExecutor.js";

const COURSE = "11111111-1111-4111-8111-111111111111";
const OTHER = "22222222-2222-4222-8222-222222222222";
const requestId = "trusted-original-write-0001";
const timeout = () => new AuthoringApiError(504, "request_timeout", "Resposta perdida");

test("timeout seguido de conflito nunca entra em CAS, troca alvo ou regenera identidades", async () => {
  let loads = 0, builds = 0, identities = 0;
  const committed = [], order = [];
  await assert.rejects(executeTrustedCourseWrite({
    operation: "save_course_authoring_part_v1", maxCasRetries: 2,
    load: async recovery => {
      loads++; order.push("read");
      if (recovery) assert.equal(recovery.request.courseId, COURSE);
      return { courseId: loads === 1 ? COURSE : OTHER, revision: loads };
    },
    build: async (state, { newId }) => {
      builds++;
      return { courseId: state.courseId, expectedRevision: state.revision,
        partId: await newId("part"), body: { title: "Título inicial" } };
    },
    commit: async request => {
      order.push("commit"); committed.push(structuredClone(request));
      if (committed.length === 1) {
        request.body.title = "Mutação local não deve contaminar replay";
        throw timeout();
      }
      throw new AuthoringApiError(409, "stale_course_state", "A primeira escrita pode ter avançado a revisão");
    },
    requestIdFactory: () => { identities++; return requestId; }
  }), error => {
    assert.equal(error.code, "course_write_uncertain");
    assert.equal(error.status, 409);
    assert.deepEqual(error.details, { requestId, operation: "save_course_authoring_part_v1", targetCourseId: COURSE });
    return true;
  });
  assert.deepEqual(order, ["read", "commit", "read", "commit"]);
  assert.equal(loads, 2); assert.equal(builds, 1); assert.equal(identities, 1);
  assert.deepEqual(committed[1], committed[0]);
});

test("recibo confirmado encerra recuperação sem reaplicar correção ou consumo de observação", async () => {
  let writes = 0, reads = 0;
  const persisted = { correctionId: "correction-1", consumedObservationVersion: 3 };
  const result = await executeTrustedCourseWrite({
    load: async () => { reads++; return { version: 3 }; },
    build: async state => ({ courseId: COURSE, observationVersion: state.version }),
    commit: async () => { writes++; throw timeout(); },
    reconcile: async ({ request, state, error }) => {
      assert.equal(request.requestId, requestId);
      assert.equal(request.observationVersion, 3);
      assert.equal(state.version, 3);
      assert.equal(error.code, "request_timeout");
      return { status: "confirmed", result: persisted };
    },
    requestIdFactory: () => requestId
  });
  assert.equal(result, persisted);
  assert.equal(writes, 1); assert.equal(reads, 1);
});

test("recibo ausente, em voo, parcial ou inválido não autoriza outro commit", async () => {
  for (const outcome of [null, undefined, { status: "pending" }, { status: "absent" },
    { status: "partial", confirmedObservationVersions: [1] }, { status: "confirmed" }]) {
    let writes = 0, builds = 0, identities = 0;
    await assert.rejects(executeTrustedCourseWrite({
      load: async () => ({}),
      build: async () => { builds++; return { courseId: COURSE }; },
      commit: async () => { writes++; throw timeout(); },
      reconcile: async () => outcome,
      requestIdFactory: () => { identities++; return requestId; }
    }), error => error.code === "course_write_uncertain");
    assert.equal(writes, 1); assert.equal(builds, 1); assert.equal(identities, 1);
  }
});

test("releitura que perde sessão, acesso ou alvo mantém a incerteza original sem despachar replay", async () => {
  for (const status of [401, 403, 404, 429, 503]) {
    let reads = 0, writes = 0;
    await assert.rejects(executeTrustedCourseWrite({
      load: async () => {
        if (++reads > 1) throw new AuthoringApiError(status, "read_failed", "Não foi possível reler");
        return {};
      },
      build: async () => ({ courseId: COURSE }),
      commit: async () => { writes++; throw timeout(); },
      requestIdFactory: () => requestId
    }), error => error.code === "course_write_uncertain" && error.details.requestId === requestId);
    assert.equal(reads, 2); assert.equal(writes, 1);
  }
});

test("erro de recuperação de recibo não publica resultado negativo como prova de não execução", async () => {
  let commits = 0;
  await assert.rejects(executeTrustedCourseWrite({
    load: async () => ({}), build: async () => ({}),
    commit: async () => { commits++; throw timeout(); },
    reconcile: async () => { throw new AuthoringApiError(409, "stale_course_state", "Observação editada depois"); },
    requestIdFactory: () => requestId
  }), error => error.code === "course_write_uncertain");
  assert.equal(commits, 1);
});

test("replay transacional espera escrita em voo e recupera um único efeito mesmo após leitura sem recibo", async () => {
  let release;
  const transaction = new Promise(resolve => { release = resolve; });
  let stored = null, effects = 0, commits = 0, reads = 0;
  const result = await executeTrustedCourseWrite({
    load: async () => {
      reads++;
      if (reads === 2) {
        assert.equal(stored, null, "ausência instantânea é compatível com transação em voo");
        queueMicrotask(() => { effects++; stored = { requestId, effectId: "effect-1" }; release(); });
      }
      return { revision: 1 };
    },
    build: async state => ({ expectedRevision: state.revision }),
    commit: async request => {
      commits++;
      if (commits === 1) throw timeout();
      await transaction; // Same receipt lock, modeled locally.
      assert.equal(request.requestId, stored.requestId);
      return stored;
    },
    requestIdFactory: () => requestId
  });
  assert.equal(result.effectId, "effect-1");
  assert.equal(effects, 1); assert.equal(commits, 2); assert.equal(reads, 2);
});

test("referência de recuperação é delimitada e não carrega corpo, credenciais ou erro bruto", async () => {
  for (const code of ["course_source_pdf_write_uncertain", "course_media_write_uncertain"]) {
    await assert.rejects(executeTrustedCourseWrite({
      operation: "ingest_file", load: async () => ({}),
      build: async () => ({ courseId: COURSE, content: "x".repeat(300000), privateData: "não deve sair" }),
      commit: async () => { throw new AuthoringApiError(409, code, "Mensagem interna", { raw: "privado" }); },
      reconcile: async () => ({ status: "pending" }),
      requestIdFactory: () => requestId
    }), error => {
      assert.equal(error.code, code);
      assert.deepEqual(error.details, { requestId, operation: "ingest_file", targetCourseId: COURSE });
      assert.ok(JSON.stringify(error).length < 600);
      assert.doesNotMatch(JSON.stringify(error), /privado|Mensagem interna|não deve sair/u);
      return true;
    });
  }
});

test("reconciler e nome de operação inválidos falham antes de qualquer efeito", async () => {
  for (const options of [{ reconcile: true }, { operation: "x".repeat(97) }, { operation: "nome com espaços" }]) {
    await assert.rejects(executeTrustedCourseWrite({
      load: async () => { assert.fail("Dependências inválidas não iniciam leitura"); },
      build: async () => ({}), commit: async () => ({}), ...options
    }), /Dependências/u);
  }
});
