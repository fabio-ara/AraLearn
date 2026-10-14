import test from "node:test";
import assert from "node:assert/strict";
import Ajv2020 from "ajv/dist/2020.js";

import { COURSE_HUMAN_TASKS, executeHumanCourseTask } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js";
import { AuthoringApiError } from
  "../../supabase/functions/_shared/aralearn-authoring/errors.js";
import { executeTrustedCourseWrite } from
  "../../supabase/functions/_shared/aralearn-authoring/courseHumanTaskExecutor.js";
import { projectHumanWriteRecovery } from
  "../../supabase/functions/_shared/aralearn-authoring/toolErrorEnvelope.js";
import { projectHumanAuthoringTasksForActions } from
  "../../scripts/projectHumanAuthoringActions.mjs";

// Recorte sintético: nenhum identificador ou payload da ocorrência privada entra
// no repositório. O recibo vivo é a única leitura permitida na recuperação.
const COURSE_ID = "10000000-0000-4000-8000-000000000001";
const PART_ID = "20000000-0000-4000-8000-000000000001";
const REQUEST_ID = "materializacao-original-0001";
const PRINCIPAL = { actorId: "40000000-0000-4000-8000-000000000001",
  scopes: ["authoring:read", "authoring:write"] };
const RECOVERY = Object.freeze({ courseId: COURSE_ID, requestId: REQUEST_ID, operation: "course_write" });
const MATERIALIZATION_RESULT = Object.freeze({
  contract: "aralearn.course-part-materialization.v1", courseId: COURSE_ID, courseRevision: 7,
  authoringPartId: PART_ID, changed: true, studyUnitCount: 2, idempotent: true
});
const receipt = (status, result = MATERIALIZATION_RESULT) => ({
  contract: "aralearn.course-part-materialization-receipt.v1", status,
  courseId: COURSE_ID, requestId: REQUEST_ID,
  ...(status === "confirmed" ? { result: structuredClone(result) } : {})
});

// Adaptador hostil: qualquer leitura fora do recibo falha. A recuperação não
// pode carregar curso, processo, preparo nem reaplicar a escrita.
function recoveryAdapter(outcome) {
  const calls = [];
  const known = {
    publicAppUrl: "https://app.example/",
    calls,
    async getCoursePartMaterializationReceipt(input) {
      calls.push(structuredClone(input));
      if (outcome instanceof Error) throw outcome;
      return typeof outcome === "function" ? outcome(calls.length) : structuredClone(outcome);
    }
  };
  return new Proxy(known, { get(target, property, receiver) {
    if (typeof property !== "string" || property in target ||
        ["then", "constructor", "toJSON"].includes(property)) {
      return Reflect.get(target, property, receiver);
    }
    throw new TypeError(`A recuperação não pode usar ${property}.`);
  } });
}

const recover = (adapter, recuperacao = RECOVERY) => executeHumanCourseTask({
  adapter, principal: PRINCIPAL, name: "materializar_parte", rawArguments: { recuperacao } });

async function rejection(run) {
  try {
    await run;
  } catch (error) {
    return error;
  }
  throw new Error("A recuperação deveria falhar.");
}

test("recuperação confirmada devolve o recibo original sem carga, preparo ou escrita", async () => {
  const adapter = recoveryAdapter(receipt("confirmed"));
  const value = await recover(adapter);
  assert.equal(value.context.recuperacao, "confirmed");
  assert.equal(value.context.unidadesMaterializadas, 2);
  assert.equal(value.context.changed, true);
  assert.match(value.result, /recibo confirmado/iu);
  assert.match(value.result, /sem nova escrita/iu);
  assert.match(value.deepLink, new RegExp(`authoringPartId=${PART_ID}`, "u"));
  assert.equal(value.links.length, 1);
  assert.equal(adapter.calls.length, 1);
  assert.deepEqual(adapter.calls[0].principal, PRINCIPAL);
  assert.equal(adapter.calls[0].courseId, COURSE_ID);
  assert.equal(adapter.calls[0].requestId, REQUEST_ID);
  assert.equal(Number.isFinite(adapter.calls[0].deadlineAt), true);
});

test("a repetição da recuperação devolve o mesmo recibo da tentativa original", async () => {
  // O recibo pertence à tentativa original (parte e quantidades guardadas); a
  // recuperação não relê o curso, o preparo nem a revisão corrente.
  const adapter = recoveryAdapter(receipt("confirmed", { ...MATERIALIZATION_RESULT, studyUnitCount: 5 }));
  const first = await recover(adapter);
  const second = await recover(adapter);
  assert.equal(first.context.recuperacao, "confirmed");
  assert.equal(first.context.unidadesMaterializadas, 5);
  assert.deepEqual(second.context, first.context);
  assert.equal(second.deepLink, first.deepLink);
  assert.match(first.deepLink, new RegExp(`authoringPartId=${PART_ID}`, "u"));
  assert.equal(adapter.calls.length, 2, "cada recuperação consulta o mesmo recibo");
});

test("escrita em voo preserva a tentativa e pede espera", async () => {
  const adapter = recoveryAdapter(receipt("in_flight"));
  const error = await rejection(recover(adapter));
  assert.equal(error.code, "course_write_uncertain");
  assert.equal(error.status, 409);
  assert.deepEqual(error.details, { requestId: REQUEST_ID, operation: "course_write", targetCourseId: COURSE_ID });
  assert.match(error.message, /processamento|aguarde/iu);
  assert.equal(adapter.calls.length, 1);
});

test("ausência de recibo não é declarada como ausência de efeito nem reaplica a escrita", async () => {
  const adapter = recoveryAdapter(receipt("not_recorded"));
  const error = await rejection(recover(adapter));
  assert.equal(error.code, "course_write_uncertain");
  assert.deepEqual(error.details, { requestId: REQUEST_ID, operation: "course_write", targetCourseId: COURSE_ID });
  assert.match(error.message, /não confirma que a escrita terminou sem efeito/iu);
  assert.match(error.message, /reconcilie/iu);
  assert.doesNotMatch(error.message, /sem efeito\./u);
  assert.equal(adapter.calls.length, 1);
});

test("recibo expirado distingue a expiração sem alegar reversão", async () => {
  const adapter = recoveryAdapter(receipt("expired"));
  const error = await rejection(recover(adapter));
  assert.equal(error.code, "course_write_uncertain");
  assert.match(error.message, /expirou/iu);
  assert.match(error.message, /não prova que a escrita terminou sem efeito/iu);
  assert.deepEqual(error.details, { requestId: REQUEST_ID, operation: "course_write", targetCourseId: COURSE_ID });
  assert.equal(adapter.calls.length, 1);
});

test("recusa final de autorização, alvo ou identidade não é mascarada como incerteza", async () => {
  for (const [status, code] of [[401, "authentication_required"], [403, "course_service_unavailable"],
    [404, "human_reference_not_found"], [409, "request_id_conflict"], [422, "invalid_course_command"]]) {
    const adapter = recoveryAdapter(new AuthoringApiError(status, code, "A tentativa pertence a outra alteração."));
    const error = await rejection(recover(adapter));
    assert.equal(error.status, status, code);
    assert.equal(error.code, code, code);
  }
});

test("falha transitória da consulta conserva a tentativa sem reaplicar", async () => {
  for (const [status, code] of [[408, "request_timeout"], [425, "temporarily_unavailable"],
    [429, "rate_limited"], [500, "internal_error"], [503, "course_service_unavailable"]]) {
    const adapter = recoveryAdapter(new AuthoringApiError(status, code, "Consulta indisponível."));
    const error = await rejection(recover(adapter));
    assert.equal(error.code, "course_write_uncertain", code);
    assert.deepEqual(error.details, { requestId: REQUEST_ID, operation: "course_write", targetCourseId: COURSE_ID });
  }
});

test("recuperação é fechada e exclusiva com os argumentos de produção", async () => {
  const invalid = [
    { recuperacao: RECOVERY, curso: "Curso de Redes" },
    { recuperacao: RECOVERY, unidades: [] },
    { recuperacao: { ...RECOVERY, operation: "course_observation_correction" } },
    { recuperacao: { ...RECOVERY, operation: "course_write " } },
    { recuperacao: { ...RECOVERY, requestId: "curto" } },
    { recuperacao: { ...RECOVERY, courseId: "não-é-uuid" } },
    { recuperacao: { ...RECOVERY, extra: 1 } },
    { recuperacao: {} },
    { recuperacao: null },
    { curso: "Curso de Redes" }
  ];
  for (const rawArguments of invalid) {
    const adapter = recoveryAdapter(receipt("confirmed"));
    const error = await rejection(executeHumanCourseTask({ adapter, principal: PRINCIPAL,
      name: "materializar_parte", rawArguments }));
    assert.ok(["invalid_materialization_recovery", "unknown_human_task_argument",
      "missing_human_task_argument"].includes(error.code), `${JSON.stringify(rawArguments)}: ${error.code}`);
    assert.equal(adapter.calls.length, 0, "a recusa antecede qualquer leitura de recibo");
  }
});

test("esquema do cliente fecha o modo e recusa a mistura com a produção", () => {
  const actionTool = projectHumanAuthoringTasksForActions(COURSE_HUMAN_TASKS)
    .find(({ name }) => name === "materializar_parte");
  for (const tool of [COURSE_HUMAN_TASKS.find(({ name }) => name === "materializar_parte"), actionTool]) {
    const validate = new Ajv2020({ allErrors: true, strict: false }).compile(tool.inputSchema);
    assert.equal(validate({ recuperacao: { ...RECOVERY } }), true, JSON.stringify(validate.errors));
    assert.equal(validate({ recuperacao: { ...RECOVERY, operation: "course_observation_correction" } }), false);
    assert.equal(validate({ recuperacao: { ...RECOVERY, requsetId: REQUEST_ID } }), false, "campo alheio na recuperação");
    assert.equal(validate({ recuperacao: { ...RECOVERY }, curso: "Curso de Redes" }), false);
    assert.equal(validate({ recuperacao: { ...RECOVERY }, unidades: [] }), false);
    assert.equal(validate({ curso: "Curso de Redes" }), false, "a produção continua exigindo as unidades");
  }
});

test("o objeto recovery do erro de escrita alimenta a nova entrada sem novo payload", async () => {
  let writes = 0;
  const error = await rejection(executeTrustedCourseWrite({
    load: async () => ({ revision: 1 }),
    build: async () => ({ courseId: COURSE_ID, body: { requestId: null } }),
    commit: async () => { writes += 1; throw new AuthoringApiError(504, "request_timeout", "Resposta perdida"); },
    requestIdFactory: () => REQUEST_ID
  }));
  assert.equal(error.code, "course_write_uncertain");
  const recovery = projectHumanWriteRecovery(error);
  assert.deepEqual(recovery, { requestId: REQUEST_ID, operation: "course_write", courseId: COURSE_ID });
  assert.equal(writes, 2, "a repetição interna continua pertencendo ao executor original");
  const adapter = recoveryAdapter(receipt("confirmed"));
  const value = await recover(adapter, recovery);
  assert.equal(value.context.recuperacao, "confirmed");
  assert.equal(adapter.calls[0].courseId, COURSE_ID);
  assert.equal(adapter.calls[0].requestId, REQUEST_ID);
});

