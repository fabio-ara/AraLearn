import test from "node:test";
import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import {
  openInstructionalFixture,
  loadMigration,
  value,
  delegateParametersToContext,
  studyUnitParameterDefinitions,
  owner,
  other,
  courseId
} from "../support/instructionalCommandBudgetPglite.js";

const batchMigration = "20261017130000_atomic_design_command_batch.sql";

async function openBatchFixture() {
  const db = await openInstructionalFixture();
  await db.exec(`alter table private.course_change_receipts
    add constraint course_change_receipts_operation_fixture
    check(operation in ('apply_course_design_command_v3'))`);
  await db.exec(await loadMigration(batchMigration));
  await db.exec(`
    create or replace function private.apply_course_design_settings_core_v3(
      p_actor_id uuid,p_course_id uuid,p_expected_course_revision bigint,
      p_command jsonb,p_request_id text,p_request_hash text,p_channel text
    ) returns jsonb language plpgsql as $core$
    declare command_type text:=p_command->>'type'; v_parameter_id text:=p_command->>'parameterId';
      converted public.courses%rowtype;
    begin
      if p_expected_course_revision<>(select revision from public.courses where id=p_course_id) then
        raise exception 'stale' using errcode='PT409';
      end if;
      if command_type in('set_parameter','clear_parameter','delegate_parameter') then
        if not exists(select 1 from private.course_design_parameter_definitions where parameter_id=v_parameter_id) then
          raise exception 'unknown parameter' using errcode='22023';
        end if;
        delete from private.course_design_parameter_assignments
        where course_id=p_course_id and parameter_id=v_parameter_id
          and scope_kind=p_command#>>'{scope,kind}' and scope_ref=p_command#>>'{scope,ref}';
        if command_type<>'clear_parameter' then
          insert into private.course_design_parameter_assignments(
            course_id,parameter_id,scope_kind,scope_ref,mode,value,origin,reason
          ) values(
            p_course_id,v_parameter_id,p_command#>>'{scope,kind}',p_command#>>'{scope,ref}',
            case when command_type='delegate_parameter' then 'automatic' else 'fixed' end,
            case when command_type='delegate_parameter' then 'null'::jsonb else p_command->'value' end,
            p_command->>'origin',p_command->>'reason'
          );
        end if;
      elsif command_type in('set_guidance','clear_guidance') then
        delete from private.course_authoring_guidance_assignments
        where course_id=p_course_id and scope_kind=p_command#>>'{scope,kind}'
          and scope_ref=p_command#>>'{scope,ref}';
        if command_type='set_guidance' then
          insert into private.course_authoring_guidance_assignments(
            course_id,scope_kind,scope_ref,guidance,origin,reason
          ) values(
            p_course_id,p_command#>>'{scope,kind}',p_command#>>'{scope,ref}',
            p_command->>'guidance',p_command->>'origin',p_command->>'reason'
          );
        end if;
      else
        raise exception 'unsupported command' using errcode='22023';
      end if;
      update public.courses set revision=revision+1,updated_at=now()
      where id=p_course_id returning * into converted;
      return jsonb_build_object(
        'contract','aralearn.course-design-change.v3',
        'courseId',p_course_id,
        'courseRevision',converted.revision,
        'requestId',p_request_id,
        'idempotent',false,
        'changed',true,
        'change',jsonb_build_object(
          'type',command_type,
          'scope',p_command->'scope',
          'parameterId',case when command_type in('set_parameter','clear_parameter','delegate_parameter')
            then v_parameter_id else null end
        )
      );
    end $core$`);
  return db;
}

async function revision(db) {
  return value(db, "select revision value from public.courses where id=$1", [courseId]);
}

async function batch(db, commands, requestId, {
  actor = owner,
  expectedRevision = null
} = {}) {
  const current = expectedRevision ?? await revision(db);
  const hash = createHash("sha256")
    .update(JSON.stringify({ courseId, expectedCourseRevision: current, commands }))
    .digest("hex");
  return value(db, "select public.apply_course_design_command_batch_for_actor_v3($1,$2,$3,$4,$5,$6,'mcp') value",
    [actor, courseId, current, commands, requestId, hash]);
}

function delegatedBatch() {
  const parameters = studyUnitParameterDefinitions();
  return [
    ...parameters.map(definition => ({
      type: "delegate_parameter",
      scope: { kind: "didactic_microsequence", ref: "micro" },
      parameterId: definition.id,
      reason: "Delegado no lote atômico."
    })),
    {
      type: "set_guidance",
      scope: { kind: "didactic_microsequence", ref: "micro" },
      guidance: "Preserve o foco da microssequência.",
      origin: "author",
      reason: "Direção editorial do lote."
    }
  ];
}

test("lote aplica parâmetros e direção com um recibo externo e replay exato", async () => {
  const db = await openBatchFixture();
  try {
    const parameters = studyUnitParameterDefinitions();
    await delegateParametersToContext(db, parameters);
    const commands = delegatedBatch();
    const before = await revision(db);
    const result = await batch(db, commands, "atomic-design-batch-001");

    assert.equal(result.contract, "aralearn.course-design-batch-change.v1");
    assert.equal(result.changed, true);
    assert.equal(result.changes.length, commands.length);
    assert.equal(result.courseRevision, before + commands.length);
    assert.equal(await revision(db), result.courseRevision);
    assert.equal(await value(db, "select count(*)::integer value from private.course_change_receipts where request_id=$1",
      ["atomic-design-batch-001"]), 1);
    assert.equal(await value(db, "select count(*)::integer value from private.course_change_receipts where operation='apply_course_design_command_v3'"),
      0);

    const replay = await batch(db, commands, "atomic-design-batch-001", { expectedRevision: before });
    assert.equal(replay.idempotent, true);
    assert.equal(replay.courseRevision, result.courseRevision);
    assert.deepEqual(replay.changes, result.changes);
  } finally {
    await db.close();
  }
});
test("falha intermediária reverte todos os comandos e o recibo do lote", async () => {
  const db = await openBatchFixture();
  try {
    const parameters = studyUnitParameterDefinitions();
    await delegateParametersToContext(db, parameters);
    const commands = delegatedBatch();
    commands[5] = {
      type: "set_parameter",
      scope: { kind: "didactic_microsequence", ref: "micro" },
      parameterId: "unknown_parameter",
      value: 1,
      origin: "author",
      reason: "Falha intermediária intencional."
    };
    const beforeRevision = await revision(db);
    const beforeParameters = await value(db,
      "select jsonb_agg(to_jsonb(a) order by parameter_id,scope_kind,scope_ref) value from private.course_design_parameter_assignments a");
    await assert.rejects(() =>
      batch(db, commands, "atomic-design-batch-failing"), error => error.code === "22023");
    assert.equal(await revision(db), beforeRevision);
    assert.deepEqual(await value(db,
      "select jsonb_agg(to_jsonb(a) order by parameter_id,scope_kind,scope_ref) value from private.course_design_parameter_assignments a"),
    beforeParameters);
    assert.equal(await value(db, "select count(*)::integer value from private.course_change_receipts where request_id=$1",
      ["atomic-design-batch-failing"]), 0);
  } finally {
    await db.close();
  }
});

test("recuperação exata distingue confirmado, ausente, expirado e incompatível", async () => {
  const db = await openBatchFixture();
  try {
    const parameters = studyUnitParameterDefinitions();
    await delegateParametersToContext(db, parameters);
    const commands = delegatedBatch();
    assert.deepEqual(await value(db,
      "select public.get_course_design_recovery_receipt_for_actor_v1($1,$2,$3,$4) value",
      [owner, courseId, "apply_course_design_command_batch_v3", "atomic-design-batch-missing"]),
    { status: "absent" });

    const applied = await batch(db, commands, "atomic-design-batch-recovery");
    const confirmed = await value(db,
      "select public.get_course_design_recovery_receipt_for_actor_v1($1,$2,$3,$4) value",
      [owner, courseId, "apply_course_design_command_batch_v3", "atomic-design-batch-recovery"]);
    assert.equal(confirmed.status, "confirmed");
    assert.equal(confirmed.result.idempotent, true);
    assert.deepEqual(confirmed.result.changes, applied.changes);

    await db.query("update private.course_change_receipts set expires_at=statement_timestamp()-interval '1 second' where request_id=$1",
      ["atomic-design-batch-recovery"]);
    assert.deepEqual(await value(db,
      "select public.get_course_design_recovery_receipt_for_actor_v1($1,$2,$3,$4) value",
      [owner, courseId, "apply_course_design_command_batch_v3", "atomic-design-batch-recovery"]),
    { status: "expired" });

    const legacyChange = {
      type: commands[0].type,
      scope: commands[0].scope,
      parameterId: commands[0].parameterId
    };
    await db.query(`insert into private.course_change_receipts(
      actor_id,request_id,operation,course_id,request_hash,result
    ) values($1,$2,'apply_course_design_command_v3',$3,$4,$5::jsonb)`,
    [owner, "atomic-design-legacy-recovery", courseId, "b".repeat(64), JSON.stringify({
      contract: "aralearn.course-design-change.v3",
      courseId,
      courseRevision: applied.courseRevision,
      requestId: "atomic-design-legacy-recovery",
      idempotent: false,
      changed: true,
      change: legacyChange
    })]);
    const legacy = await value(db,
      "select public.get_course_design_recovery_receipt_for_actor_v1($1,$2,$3,$4) value",
      [owner, courseId, "apply_course_design_command_v3", "atomic-design-legacy-recovery"]);
    assert.equal(legacy.status, "confirmed");
    assert.deepEqual(legacy.result.change, legacyChange);
    assert.equal(Object.hasOwn(legacy.result, "changes"), false);
    await assert.rejects(() => value(db,
      "select public.get_course_design_recovery_receipt_for_actor_v1($1,$2,$3,$4) value",
      [owner, courseId, "apply_course_design_command_batch_v3", "atomic-design-legacy-recovery"]),
    error => error.code === "23514");

    await db.query(`insert into private.course_change_receipts(
      actor_id,request_id,operation,course_id,request_hash,result
    ) values($1,$2,'apply_course_design_command_v3',$3,$4,'{}'::jsonb)`,
    [owner, "atomic-design-batch-other", courseId, "a".repeat(64)]);
    await assert.rejects(() => value(db,
      "select public.get_course_design_recovery_receipt_for_actor_v1($1,$2,$3,$4) value",
      [owner, courseId, "apply_course_design_command_batch_v3", "atomic-design-batch-other"]),
    error => error.code === "23514");
  } finally {
    await db.close();
  }
});

test("lote e recuperação exigem o proprietário do Curso", async () => {
  const db = await openBatchFixture();
  try {
    const commands = delegatedBatch();
    const before = await revision(db);
    await assert.rejects(() => batch(db, commands, "atomic-design-batch-other-owner", { actor: other }),
      error => error.code === "42501");
    assert.equal(await revision(db), before);
    await assert.rejects(() => value(db,
      "select public.get_course_design_recovery_receipt_for_actor_v1($1,$2,$3,$4) value",
      [other, courseId, "apply_course_design_command_batch_v3", "atomic-design-batch-other-owner"]),
    error => error.code === "42501");
  } finally {
    await db.close();
  }
});

test("lote respeita o orçamento vigente antes de qualquer subcomando", async () => {
  const db = await openBatchFixture();
  try {
    const commands = Array.from({ length: 13 }, (_, index) => ({
      type: "set_guidance",
      scope: { kind: "didactic_microsequence", ref: "micro" },
      guidance: String(index).padEnd(4000, "x"),
      origin: "author",
      reason: "Direção editorial acima do orçamento."
    }));
    const before = await revision(db);
    await assert.rejects(() => batch(db, commands, "atomic-design-batch-oversized"),
      error => error.code === "22023");
    assert.equal(await revision(db), before);
    assert.equal(await value(db, "select count(*)::integer value from private.course_change_receipts where request_id=$1",
      ["atomic-design-batch-oversized"]), 0);
  } finally {
    await db.close();
  }
});
