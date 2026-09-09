import test from 'node:test';
import assert from 'node:assert/strict';
import { CourseController } from '../../src/supabase/CourseController.js';
import { inspectCurricularMapCompleteness } from '../../src/domain/courseCurricularMapSlices.js';
const courseId='20000000-0000-4000-8000-000000000001';
const map={audience:'',prerequisites:[],scopeItems:[],modules:[]};
const read={contract:'aralearn.course-curricular-map.v1',courseId,courseRevision:1,planVersion:1,map,
  mapApprovalReference:'referencia_original',completeness:inspectCurricularMapCompleteness(map)};
const result={contract:'aralearn.course-curricular-map-change.v1',courseId,courseRevision:2,planVersion:2,
  approval:'approved',changed:true,idempotent:true};
function harness() {
  const cache=new Map(); const events=[]; let lost=true;
  const store={ getCache:async key=>cache.get(key),putCache:async(key,value)=>cache.set(key,structuredClone(value)),
    deleteCachePrefix:async prefix=>{for(const key of cache.keys()) if(key.startsWith(prefix))cache.delete(key);} };
  const api={listCourses:async()=>[],getCourse:async()=>({}),getCurricularMap:async()=>{events.push('read');return structuredClone(read);},
    approveCurricularMap:async(id,ref)=>{events.push(['approve',id,ref]);
      assert.ok(cache.get(`course.v1.pending-curricular-map:${courseId}`),'A tentativa precede a rede.');
      if(lost){lost=false;throw Object.assign(new Error('Resposta perdida'),{status:503});} return structuredClone(result);}};
  return {controller:new CourseController({api,store,ownerOnly:true}),events,cache};
}
test('mapa guarda tentativa antes da rede e após reabertura relê antes de recuperar a mesma referência',async()=>{
  const {controller,events,cache}=harness();
  for(const kind of ['header','instructional-plan','outline','study-unit-inspection','verified-composition']) {
    cache.set(`course-authoring.v1.${kind}:${courseId}`,{revision:1});
  }
  await assert.rejects(controller.approveCurricularMap(courseId,read.mapApprovalReference),/perdida/);
  const pending=await controller.getPendingCurricularMapChange(courseId);
  assert.equal(pending.command.reference,read.mapApprovalReference);
  await assert.rejects(controller.approveCurricularMap(courseId,'outra_referencia'),/pendente/);
  assert.equal((await controller.approveCurricularMap(courseId,pending.command.reference)).idempotent,true);
  assert.equal(await controller.getPendingCurricularMapChange(courseId),null);
  for(const kind of ['header','instructional-plan','outline','study-unit-inspection','verified-composition']) {
    assert.equal(cache.has(`course-authoring.v1.${kind}:${courseId}`),false,`Cache ${kind} precisa refletir a mudança persistida.`);
  }
  assert.deepEqual(events,[['approve',courseId,'referencia_original'],'read',['approve',courseId,'referencia_original']]);
});
test('mapa privado e contagem de revisão não são liberados por controller de estudo',async()=>{
  const {controller}=harness(); controller.ownerOnly=false;
  await assert.rejects(controller.getCurricularMap(courseId),/autoria/);
  await assert.rejects(controller.approveCurricularMap(courseId,read.mapApprovalReference),/autoria/);
});
