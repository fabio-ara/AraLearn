import assert from "node:assert/strict";
import test from "node:test";
import {fixture, installCourseCompositionFixture, completeSavedReceiptMigration,
  COURSE, PART, IDEA, EVIDENCE, parameters} from "../support/authoringMaterializationPglite.js";
import {CourseSupabaseAdapter} from "../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js";

test("fechamento vazio atravessa composição real: 22023 antes, recibo e CAS preservados depois", async () => {
  const db=await fixture({completeSavedReceipt:false});
  const trace=[];
  try {
  const snapshot={contract:'aralearn.study-unit-design-snapshot.v2',parameterCatalogVersion:'1.2.0',didacticMicrosequenceId:'micro',instructionalAnalysisUnitIds:[IDEA],evidenceRequirementIds:[EVIDENCE],parameters,editorialDirections:[],componentPolicy:{policy:{},origin:'automatic',sourceScopeKind:'course'}};
  const application={mode:'mixed',introducedInstructionalAnalysisUnitIds:[IDEA],usedInstructionalAnalysisUnitIds:[],curriculumScopeItemIds:[],explanationApplications:[{instructionalAnalysisUnitId:IDEA,developedForms:['plain_definition','concrete_example'],notApplicable:[]}],practiceApplications:[{evidenceRequirementId:EVIDENCE,opportunityId:'case-1',invariantTaskOperation:'Distinguir os casos',variedDimensions:[]}],componentRefs:[]};
  await db.query(`insert into private.course_entities(course_id,entity_type,entity_id,parent_type,parent_id,position,content,design_snapshot,design_application) values($1,'study_unit','unit-existing','microsequence','micro',1,$2,$3,$4)`,[COURSE,{title:'Unidade existente',role:'theory',content:[{text:'Texto preservado'}]},snapshot,application]);
  await installCourseCompositionFixture(db);
  const adapter=new CourseSupabaseAdapter({supabaseUrl:'http://127.0.0.1:54321',serverApiKey:'local-only',publishableKey:'local-only',publicAppUrl:'http://127.0.0.1:5173',attempts:1,
    fetchImpl:async(url,init)=>{
      assert.ok(url.endsWith('/rpc/materialize_course_authoring_part_for_actor_v2'));
      const p=JSON.parse(init.body);trace.push({url,request:p});
      try{
        const value=(await db.query(`select public.materialize_course_authoring_part_for_actor_v2($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) value`,[p.p_actor_id,p.p_course_id,p.p_authoring_part_id,p.p_expected_course_revision,p.p_expected_authoring_part_version,p.p_plan_item_upserts,p.p_target_plan_items,p.p_units,p.p_request_id,p.p_request_hash,p.p_explanations,p.p_complete,p.p_placements,p.p_allow_draft_map])).rows[0].value;
        trace.push({response:value});return new Response(JSON.stringify(value),{status:200,headers:{'content-type':'application/json'}});
      }catch(e){trace.push({databaseError:{code:e.code,message:e.message,where:e.where}});return new Response(JSON.stringify({code:e.code,message:e.message}),{status:e.code==='PT409'?409:e.code==='42501'?403:e.code==='PT404'?404:400,headers:{'content-type':'application/json'}});}
    }});
  const request={principal:{actorId:COURSE},courseId:COURSE,authoringPartId:PART,requestId:'closure422-local-0001',expectedCourseRevision:1,expectedAuthoringPartVersion:1,targetPlanItems:[{didacticMicrosequenceId:'micro',instructionalAnalysisUnitIds:[IDEA],evidenceRequirementIds:[EVIDENCE]}],units:[],explanations:[],placements:[{studyUnitId:'unit-existing',didacticMicrosequenceId:'micro',position:1}],complete:true};
  const call=overrides=>adapter.materializeCourseAuthoringPart({...request,...overrides});
  const databaseSnapshot=async()=>({entities:(await db.query('select * from private.course_entities order by entity_type,entity_id')).rows,receipts:(await db.query('select * from private.course_change_receipts order by request_id')).rows,courses:(await db.query('select * from public.courses')).rows,parts:(await db.query('select * from private.course_authoring_parts')).rows});
  await assert.rejects(call({}), e => e.status === 422 && e.code === 'invalid_course_command');
  assert.equal(trace.at(-1).databaseError.code, '22023');
  assert.equal(trace.at(-1).databaseError.message, 'Lote de composição do Curso inválido.');
  assert.match(trace.at(-1).databaseError.where, /commit_course_composition_core_v1/u);
  assert.match(trace.at(-1).databaseError.where, /commit_course_composition_for_actor_v1/u);
  assert.match(trace.at(-1).databaseError.where, /materialize_course_authoring_part_core_v1/u);
  assert.equal((await db.query('select count(*)::int n from private.course_change_receipts')).rows[0].n, 0);
  await db.exec(completeSavedReceiptMigration);
  // A failure after the core inserted its receipt must roll everything back.
  const beforeRollback = await databaseSnapshot();
  await db.exec(`create function pg_temp.reject_completion() returns trigger language plpgsql as $$
    begin raise exception 'Injected failure after core receipt' using errcode='P0001'; end$$;
    create trigger reject_completion before update on private.course_authoring_parts
    for each row when (new.materialization_complete is true)
    execute function pg_temp.reject_completion();`);
  await assert.rejects(call({requestId: "rollback-after-core-0001"}),
    error => error.code === "course_service_unavailable");
  assert.deepEqual(await databaseSnapshot(), beforeRollback);
  await db.exec("drop trigger reject_completion on private.course_authoring_parts;");
  const beforeSuccess=await databaseSnapshot();
  const success=await call({});
  assert.equal(success.changed,true);assert.equal(success.courseRevision,2);assert.equal(success.studyUnitCount,0);
  const afterSuccess=await databaseSnapshot();assert.deepEqual(afterSuccess.entities,beforeSuccess.entities);
  assert.equal(afterSuccess.parts[0].materialization_complete,true);
  assert.equal(afterSuccess.receipts.length,1);assert.equal(afterSuccess.receipts[0].operation,'materialize_course_authoring_part_v2');assert.deepEqual(afterSuccess.receipts[0].result,Object.fromEntries(Object.entries(success).filter(([key])=>key!=="deepLink")));
  const replay=await call({});assert.equal(replay.idempotent,true);assert.equal(replay.courseRevision,2);assert.deepEqual(await databaseSnapshot(),afterSuccess);
  const rejected = async (name, overrides, code) => {
    const before = await databaseSnapshot();
    await assert.rejects(call(overrides), error => error.code === code, name);
    assert.deepEqual(await databaseSnapshot(), before, name + " must be atomic");
  };
  await rejected('stale course revision',{requestId:'stale-course-0001'},'stale_course_state');
  await rejected('stale part version',{requestId:'stale-part-0001',expectedCourseRevision:2,expectedAuthoringPartVersion:99},'stale_course_state');
  await rejected('request replay with incompatible payload',{expectedCourseRevision:2},'request_id_conflict');
  await rejected('partial empty remains invalid',{requestId:'partial-empty-0001',complete:false},'invalid_course_part_materialization');
  await db.exec("set request.jwt.claim.role='authenticated';");
  await rejected('non-service role',{requestId:'wrong-role-0001',expectedCourseRevision:2},'not_authorized');
  await db.exec("set request.jwt.claim.role='service_role';");
  const other='99999999-0000-4000-8000-000000000009';
  await db.query('insert into auth.users values($1)',[other]);await db.query('insert into public.person_profiles values($1)',[other]);await db.query('insert into public.course_access values($1,$2)',[COURSE,other]);
  await rejected('shared non-owner',{requestId:'non-owner-0001',expectedCourseRevision:2,principal:{actorId:other}},'not_authorized');
  await assert.rejects(db.query("select public.commit_course_composition_for_actor_v1($1,$1,2,'[]','[]','[]','no-op-general-0001')",[COURSE]),e=>e.code==='22023');
  const noChange=await call({requestId:'already-complete-0001',expectedCourseRevision:2});assert.equal(noChange.changed,false);assert.equal(noChange.courseRevision,2);assert.deepEqual((await databaseSnapshot()).entities,beforeSuccess.entities);
  } finally {await db.close();}
});
