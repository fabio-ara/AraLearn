// Dispatcher e fronteira de comandos reais; o adapter abaixo substitui somente o banco.
import test from 'node:test';
import assert from 'node:assert/strict';
import { executeHumanCourseTask } from '../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js';
import { CourseSupabaseAdapter } from '../../supabase/functions/_shared/aralearn-authoring/courseSupabaseAdapter.js';
const courseId='10000000-0000-4000-8000-000000000001';
const actorId='20000000-0000-4000-8000-000000000001';
const personId='30000000-0000-4000-8000-000000000001';
const principal={actorId,authenticationKind:'oauth',scopes:['authoring:read','authoring:write']};
const execute=(adapter,name,args,who=principal)=>executeHumanCourseTask({adapter,principal:who,name,rawArguments:args});
function harness() {
  const events=[];
  const adapter={
    async listCourses(){return{items:[{courseId,title:'Curso'}],hasMore:false};},
    async getCourse(){events.push('read');return{courseId,title:'Curso',revision:4,visibility:'private',publicFileAccess:'restricted',reviewPolicy:'saved'};},
    async listCourseAccess(){return{contract:'aralearn.course-people.v3',courseId,owner:{handle:'autor'},
      people:[{handle:'pessoa',userId:personId,canCopy:false,avatarObjectKey:'private-key'}]};},
    async searchCourseAccessPeople(){return{items:[{userId:personId,handle:'pessoa',avatarUrl:'private-url'}],rateLimited:false};},
    async getCourseSources(){return{items:[{sourceId:'fonte',revision:3,title:'Referência'}],hasMore:false,nextCursor:null};},
    async setCourseVisibility(request){events.push(request);return{contract:'aralearn.course-visibility-change.v1',courseId,
      courseRevision:5,visibility:request.visibility,publicFileAccess:request.publicFileAccess,changed:true,idempotent:false};},
    async manageCourseAccess(request){events.push(request);return{contract:'aralearn.course-access-change.v3',courseId,
      operation:request.operation,changed:true,idempotent:false,person:{userId:personId,handle:'pessoa',canCopy:request.canCopy}};},
    async setCourseSourceFileAccess(request){events.push(request);return{contract:'aralearn.course-source-file-access-change.v1',courseId,
      courseRevision:5,sourceId:'fonte',sourceRevision:4,publicFileAccess:request.publicFileAccess,changed:true,idempotent:false};},
    async setCourseContentReviewPolicy(request){events.push(request);return{contract:'aralearn.course-content-review-policy.v1',courseId,
      courseRevision:5,reviewPolicy:request.policy,changed:true,idempotent:false};}
  };
  return{adapter,events};
}
test('consulta lê políticas reais e só identificadores necessários ao acesso',async()=>{
  const {adapter,events}=harness();const result=await execute(adapter,'consultar_acesso',{curso:'Curso'},
    {...principal,scopes:['authoring:read']});
  assert.equal(result.context.visibilidade,'private');assert.equal(result.context.arquivos,'restricted');
  assert.equal(result.context.politicaRevisao,'saved');
  assert.deepEqual(result.context.pessoas,[{identificador:'pessoa',permitirCopia:false}]);
  assert.doesNotMatch(JSON.stringify(result),/private-key|private-url|30000000/u);
  assert.ok(events.every(event=>event==='read'));
});
test('mutações exigem escopo e escolha expressa antes de escrever',async()=>{
  const {adapter,events}=harness();const args={curso:'Curso',visibilidade:'public',arquivos:'restricted',confirmado:true};
  await assert.rejects(execute(adapter,'definir_visibilidade',args,{...principal,scopes:['authoring:read']}),
    error=>error.code==='insufficient_scope');
  await assert.rejects(execute(adapter,'definir_visibilidade',{...args,confirmado:false}),/escolha expressa/u);
  assert.equal(events.length,0);
});
test('resposta perdida relê e consulta o escritor transacional com a mesma identidade, fences e escolha',async()=>{
  const {adapter,events}=harness();let calls=0;const write=adapter.setCourseVisibility;
  adapter.setCourseVisibility=async request=>{const receipt=await write(request);if(++calls===1)throw Object.assign(new Error('Resposta perdida'),{status:503});
    return{...receipt,idempotent:true};};
  const output=await execute(adapter,'definir_visibilidade',{curso:'Curso',visibilidade:'public',arquivos:'restricted',confirmado:true});
  const writes=events.filter(item=>typeof item==='object');assert.equal(writes.length,2);assert.deepEqual(writes[0],writes[1]);
  assert.equal(events[events.indexOf(writes[1])-1],'read');assert.equal(output.context.visibilidade,'public');
});
test('publicar sem política adicional disponibiliza arquivos; restrição expressa prevalece',async()=>{
  for(const arquivos of [undefined,'restricted']) {
    const {adapter,events}=harness();
    const output=await execute(adapter,'definir_visibilidade',{curso:'Curso',visibilidade:'public',confirmado:true,
      ...(arquivos===undefined?{}:{arquivos})});
    assert.deepEqual(output.context,{visibilidade:'public',arquivos:arquivos??'available'});
    assert.equal(events.find(item=>typeof item==='object').publicFileAccess,arquivos??'available');
  }
});
test('publicação relê um conflito focal e preserva a escolha sem repetir indefinidamente',async()=>{
  for(const persistent of [false,true]) {
    const {adapter,events}=harness();let revision=4;const write=adapter.setCourseVisibility;
    adapter.getCourse=async()=>{events.push('read');return{courseId,title:'Curso',revision,visibility:'private',publicFileAccess:'restricted'};};
    adapter.setCourseVisibility=async request=>{
      if(revision===4||persistent){events.push(request);revision++;throw Object.assign(new Error('Revisão avançou'),{code:'stale_course_state',status:409});}
      return write(request);
    };
    const pending=execute(adapter,'definir_visibilidade',{curso:'Curso',visibilidade:'public',arquivos:'available',confirmado:true});
    if(persistent)await assert.rejects(pending,{code:'stale_course_state'});
    else assert.deepEqual((await pending).context,{visibilidade:'public',arquivos:'available'});
    const writes=events.filter(item=>typeof item==='object');assert.equal(writes.length,2);
    assert.deepEqual(writes.map(item=>item.expectedRevision),[4,5]);
    assert.notEqual(writes[0].requestId,writes[1].requestId);
    for(const item of writes)assert.equal(item.publicFileAccess,'available');
    assert.equal(events[events.indexOf(writes[1])-1],'read');
  }
});
test('tornar privado sem política adicional conserva a política latente',async()=>{
  const {adapter}=harness();const read=adapter.getCourse;
  adapter.getCourse=async()=>({...await read(),visibility:'public',publicFileAccess:'available'});
  assert.deepEqual((await execute(adapter,'definir_visibilidade',{curso:'Curso',visibilidade:'private',confirmado:true})).context,
    {visibilidade:'private',arquivos:'available'});
});
test('falha persistente conserva tentativa e não anuncia alteração',async()=>{
  const {adapter,events}=harness();adapter.setCourseVisibility=async request=>{events.push(request);throw Object.assign(new Error('Rede'),{status:503});};
  let failure;try{await execute(adapter,'definir_visibilidade',{curso:'Curso',visibilidade:'public',arquivos:'restricted',confirmado:true});}catch(error){failure=error;}
  assert.equal(failure.code,'course_write_uncertain');assert.equal(failure.details.targetCourseId,courseId);
  const writes=events.filter(item=>typeof item==='object');assert.equal(writes.length,2);assert.equal(failure.details.requestId,writes[0].requestId);
});
test('concessão usa pessoa exata e escolha de cópia; não aceita prefixo nem busca limitada',async()=>{
  const {adapter,events}=harness();const args={curso:'Curso',pessoa:'pessoa',operacao:'conceder',permitirCopia:false,confirmado:true};
  await execute(adapter,'alterar_acesso',args);const write=events.find(item=>typeof item==='object');
  assert.equal(write.targetUserId,personId);assert.equal(write.canCopy,false);
  adapter.searchCourseAccessPeople=async()=>({items:[{userId:personId,handle:'pessoa-outra'}]});
  await assert.rejects(execute(adapter,'alterar_acesso',args),error=>error.code==='ambiguous_human_reference');
  adapter.searchCourseAccessPeople=async()=>({items:[],rateLimited:true});
  await assert.rejects(execute(adapter,'alterar_acesso',args),error=>error.code==='course_access_rate_limited');
  assert.equal(events.filter(item=>typeof item==='object').length,1);
});
test('política da fonte usa versão lida e política de revisão não escreve publicação ou concessões',async()=>{
  const {adapter,events}=harness();await execute(adapter,'definir_acesso_arquivos',{curso:'Curso',fonte:'Referência',arquivos:'restricted',confirmado:true});
  await execute(adapter,'definir_politica_revisao',{curso:'Curso',politica:'reviewed_only',confirmado:true});
  const writes=events.filter(item=>typeof item==='object');assert.equal(writes.length,2);
  assert.equal(writes[0].sourceRevision,3);assert.equal(writes[0].contentHash,null);assert.equal(writes[1].policy,'reviewed_only');
  for(const field of ['visibility','canCopy','publicFileAccess'])assert.equal(Object.hasOwn(writes[1],field),false);
});
test('adapter não repete mutações silenciosamente mesmo com três tentativas de leitura configuradas',async()=>{
  const invocations=[
    adapter=>adapter.createCourse({principal,requestId:'access-transport-1',title:'Curso',objective:'Aprender'}),
    adapter=>adapter.setCourseVisibility({principal,courseId,expectedRevision:4,visibility:'public',publicFileAccess:'restricted',confirmed:true,requestId:'access-transport-1'}),
    adapter=>adapter.setCourseSourceFileAccess({principal,courseId,expectedRevision:4,sourceId:'fonte',sourceRevision:3,publicFileAccess:'restricted',requestId:'access-transport-1'}),
    adapter=>adapter.manageCourseAccess({principal,courseId,operation:'grant_access',handle:'pessoa',targetUserId:personId,canCopy:false,confirmed:true,requestId:'access-transport-1'}),
    adapter=>adapter.setCourseContentReviewPolicy({principal,courseId,expectedRevision:4,policy:'saved',requestId:'access-transport-1'}),
    adapter=>adapter.maintainCourse({principal,courseId,operation:'delete_owned_course',confirmed:true,requestId:'access-transport-1'})
  ];
  for(const invoke of invocations){
    let calls=0;const adapter=new CourseSupabaseAdapter({supabaseUrl:'https://database.example',publicAppUrl:'https://app.example',
      serverApiKey:'synthetic-service',publishableKey:'synthetic-public',attempts:3,
      fetchImpl:async()=>{calls++;return new Response(JSON.stringify({message:'Resposta incerta'}),{status:503,headers:{'Content-Type':'application/json'}});}});
    await assert.rejects(invoke(adapter));assert.equal(calls,1);
  }
});
