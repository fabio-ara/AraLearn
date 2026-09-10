import test from 'node:test';
import assert from 'node:assert/strict';
import { executeHumanCourseTask } from '../../supabase/functions/_shared/aralearn-authoring/courseHumanTasks.js';
import { openContentReviewReference } from '../../supabase/functions/_shared/aralearn-authoring/courseContentReviewReference.js';
import { defaultAuthoringProcessPreferences } from '../../src/domain/authoringProcessPreferences.js';
import { courseDesignFixture } from '../helpers/courseDesignFixture.js';
const courseId='10000000-0000-4000-8000-000000000001';
const actorId='20000000-0000-4000-8000-000000000001';
const principal={actorId,authenticationKind:'oauth',scopes:['authoring:read','authoring:write']};
const annotationId='30000000-0000-4000-8000-000000000001';
const reference={annotationId,annotationVersion:2,targetKind:'microsequence_explanation',targetId:'micro'};
function harness({large=false}={}) {
  const events=[]; let revision=1; let reviewed=false;
  const queueRequests=[];
  const observations=[{annotationId,annotationVersion:2,provenance:{origin:'author',channel:'authoring_interface'},
    target:{kind:'microsequence_explanation',id:'micro',observedPath:[
      {kind:'course',id:courseId},{kind:'module',id:'module'},{kind:'lesson',id:'lesson'},
      {kind:'microsequence_explanation',id:'micro'}]},
    rawText:'Esclarecer a relação causal.',state:'considered',createdAt:'2026-09-09T00:00:00Z'}];
  const explanation={title:'Explicação',content:Array.from({length:large?20:1},(_,index)=>({id:`body-${index}`,
    package:'aralearn.resource.paragraph',version:'1.0.0',
    data:{text:large ? 'Conhecimento e relações. '.repeat(400).trim() : 'Base desenvolvida antes das unidades.'}}))};
  const micro={id:'micro',position:0,title:'Relações',objective:'Explicar relações.',goal:'Explicar relações.',
    dependencyMicrosequenceIds:[],explanationPlan:{purpose:'Explicar',prerequisites:[],relations:[],sourceIds:[]},explanation};
  const read=()=>({contract:'aralearn.course-content-review.v1',courseId,courseRevision:revision,
    targetKind:'microsequence_explanation',targetId:'micro',entityVersion:1,basisHash:'a'.repeat(64),
    contentReview:reviewed ? {state:'current',reviewedAt:'2026-09-09T00:00:00Z'} : {state:'draft'},reviewPolicy:'saved'});
  const adapter={publicAppUrl:'https://app.example',
    async getAuthoringProcessPreferences(){events.push('preferences');return {contract:'aralearn.authoring-process-preferences.v1',
      revision:1,updatedAt:'2026-09-09T00:00:00Z',preferences:{...defaultAuthoringProcessPreferences(),focus:'content',cadence:'batch'}};},
    async getCourseDesign(){events.push('design');return {...courseDesignFixture({courseId,moduleId:'module',lessonId:'lesson',microsequenceId:'micro',studyUnitId:'unit'}),courseRevision:revision};},
    async listCourses(){return{items:[{courseId,title:'Curso'}],hasMore:false};},
    async getCourse(){return{courseId,title:'Curso',revision};},
    async getCourseInstructionalPlan(){return{courseId,courseRevision:revision,plan:{version:1,title:'Curso',objective:'Aprender',
      curriculumMapStatus:'draft',audience:'Iniciantes',declaredPrerequisites:[],curriculumScopeItems:[],parts:[],
      curriculum:{modules:[{id:'module',position:0,title:'Módulo',objective:'Objetivo',lessons:[{id:'lesson',position:0,
        title:'Lição',objective:'Objetivo',microsequences:[structuredClone(micro)]}]}]}}};},
    async listCourseStudyUnits(){events.push('units');return{items:[],hasMore:false,nextCursor:null};},
    async getCourseSources(){events.push('sources');return{items:[],hasMore:false,nextCursor:null};},
    async getCourseContentReview(){events.push('review');return read();},
    async getCourseAnchoredAnnotations(request){events.push(['queue',request.query.hierarchy,request.query.states,request.annotationSetVersion]);
      queueRequests.push(structuredClone(request));
      const {hierarchy,states=[],origins=[],channels=[]}=request.query;
      const items=observations.filter(item=>(!states.length||states.includes(item.state))&&
        (!origins.length||origins.includes(item.provenance.origin))&&
        (!channels.length||channels.includes(item.provenance.channel))&&
        (!hierarchy||item.target.kind===hierarchy.target.kind&&item.target.id===hierarchy.target.id||
          hierarchy.includeDescendants&&item.target.observedPath.some(entry=>
            entry.kind===hierarchy.target.kind&&entry.id===hierarchy.target.id)));
      return{items:structuredClone(items),annotationSetVersion:4,hasMore:false,nextCursor:null};},
    async setCourseContentReview(request){events.push(['write',request]);reviewed=request.reviewed;revision++;
      throw Object.assign(new Error('Resposta perdida'),{status:503});}
  };
  return {adapter,events,read,observations,queueRequests};
}
const execute=(adapter,name,args,who=principal)=>executeHumanCourseTask({adapter,principal:who,name,rawArguments:args});
test('retomada focal inclui preferências atuais, condições, base e pendências sem modificar o curso',async()=>{
  const {adapter,events}=harness();
  const output=await execute(adapter,'retomar_curso',{titulo:'Curso',microssequencia:'Relações'});
  assert.equal(output.context.processoCorrente.foco,'content');
  assert.equal(output.context.processoCorrente.cadencia,'batch');
  assert.deepEqual(output.context.observations.items[0].referenciaObservacao,reference);
  assert.equal(output.context.explicacoes[0].revisao,'Rascunho');
  assert.match(output.nextDecision,/Explicação/u);
  assert.ok(events.includes('preferences')&&events.includes('design'));
  assert.equal(events.some(value=>Array.isArray(value)&&value[0]==='write'),false);
});
test('processo combinado conserva preferências do fluxo e informa mudança pessoal sem alterar condições do curso',async()=>{
  const {adapter}=harness();const args={titulo:'Curso',microssequencia:'Relações'};
  const first=await execute(adapter,'retomar_curso',args);const processo=first.context.referenciaProcesso;
  assert.equal(typeof processo,'string');
  const get=adapter.getAuthoringProcessPreferences;
  adapter.getAuthoringProcessPreferences=async()=>{const value=await get();return{...value,revision:2,
    preferences:{...value.preferences,focus:'full_cycle',cadence:'microsequence'}};};
  const continued=await execute(adapter,'retomar_curso',{...args,processo});
  assert.equal(continued.context.processoCorrente.foco,'content');assert.equal(continued.context.processoCorrente.cadencia,'batch');
  assert.equal(continued.context.preferenciasMudaram,true);assert.equal(continued.context.referenciaProcesso,processo);
  const fresh=await execute(adapter,'retomar_curso',args);assert.equal(fresh.context.processoCorrente.foco,'full_cycle');
  await assert.rejects(execute(adapter,'retomar_curso',{...args,processo},{...principal,actorId:courseId}),
    error=>error.code==='invalid_authoring_process_reference');
  await assert.rejects(execute(adapter,'retomar_curso',{...args,processo:'arbitrario'}),
    error=>error.code==='invalid_authoring_process_reference');
});
test('pedido de parâmetro em lição resolve o ramo e preserva unidades já produzidas',async()=>{
  const {adapter}=harness();const writes=[];const reads=[];
  adapter.getCourseDesign=async request=>{reads.push(request);return courseDesignFixture({courseId,moduleId:'module',lessonId:'lesson',microsequenceId:'micro',studyUnitId:'unit'},
    {scope:request.scopeKind,revision:1});};
  adapter.applyCourseDesignCommand=async request=>{writes.push(request);return{changed:true};};
  const args={curso:'Curso',modulo:'Módulo',licao:'Lição'};
  await execute(adapter,'consultar_configuracao',args);
  const output=await execute(adapter,'ajustar_configuracao',{...args,condicao:'fixada_pelo_autor',
    parametros:{maximo_ideias_novas_por_unidade:1}});
  assert.equal(writes.length,1);
  assert.deepEqual(writes[0].command.scope,{kind:'lesson',ref:'lesson'});
  assert.equal(writes[0].command.parameterId,'new_analysis_unit_ceiling_per_expository_study_unit');
  assert.ok(reads.every(request=>request.scopeKind==='lesson'&&request.scopeRef==='lesson'));
  assert.match(output.nextDecision,/futuras produções/u);
  assert.equal(Object.hasOwn(writes[0],'upserts'),false);
});
test('revisão de base sem parte ou unidades lê conteúdo/fontes/fila e conserva referência exata pendente',async()=>{
  const {adapter,events,queueRequests}=harness();
  const output=await execute(adapter,'preparar_revisao',{curso:'Curso',microssequencia:'Relações'});
  assert.equal(output.context.observations.items.length,1);
  assert.deepEqual(output.context.observations.items[0].referenciaObservacao,reference);
  assert.equal(output.context.explicacoes[0].conteudo.content[0].data.text,'Base desenvolvida antes das unidades.');
  assert.equal(output.context.explicacoes[0].revisao,'Rascunho');
  assert.equal(output.context.plan.mapaCurricular.modulos[0].licoes[0].microssequencias.length,1);
  assert.equal(openContentReviewReference(output.context.explicacoes[0].referenciaRevisao,principal).targetId,'micro');
  assert.ok(events.includes('sources'));
  assert.ok(events.some(value=>Array.isArray(value)&&value[0]==='queue'&&value[2].includes('considered')));
  assert.deepEqual(queueRequests.map(request=>request.query.hierarchy),[
    {target:{kind:'didactic_microsequence',id:'micro'},includeDescendants:true},
    {target:{kind:'microsequence_explanation',id:'micro'},includeDescendants:false}
  ]);
  assert.deepEqual(queueRequests.map(request=>request.annotationSetVersion),[null,4]);
  assert.equal(events.some(value=>Array.isArray(value)&&value[0]==='write'),false);
});
test('consulta por microssequência encontra a base sem unidades e respeita estado e recorte',async()=>{
  const {adapter,observations}=harness();
  observations.push({...structuredClone(observations[0]),annotationId:'30000000-0000-4000-8000-000000000002',
    state:'resolved',rawText:'Observação já resolvida desta base.'});
  const elsewhere=structuredClone(observations[0]);
  elsewhere.annotationId='30000000-0000-4000-8000-000000000003';
  elsewhere.target.id='outra-base';elsewhere.target.observedPath.at(-1).id='outra-base';
  elsewhere.rawText='Observação de outra base.';
  observations.push(elsewhere);
  const args={curso:'Curso',microssequencia:'Relações'};
  const pending=await execute(adapter,'consultar_observacoes',args);
  assert.equal(pending.context.observations.items.length,1);
  assert.deepEqual(pending.context.observations.items[0].referenciaObservacao,reference);
  const all=await execute(adapter,'consultar_observacoes',{...args,somenteAbertas:false});
  assert.deepEqual(all.context.observations.items.map(item=>[item.state,item.rawText]),
    [['considered','Esclarecer a relação causal.'],['resolved','Observação já resolvida desta base.']]);
  assert.deepEqual(all.context.observations.items[0].referenciaObservacao,reference);
  assert.equal(Object.hasOwn(all.context.observations.items[1],'referenciaObservacao'),false);
});
test('leitura adicional da base preserva paginação, versão da fila e deduplicação',async()=>{
  for(const changedVersion of [false,true]){
    const {adapter,queueRequests}=harness();const get=adapter.getCourseAnchoredAnnotations;
    adapter.getCourseAnchoredAnnotations=async request=>{
      const page=await get(request);
      if(request.query.hierarchy.target.kind!=='microsequence_explanation')return page;
      return request.cursor===null?{...page,hasMore:true,nextCursor:'base-2'}:
        {...page,annotationSetVersion:changedVersion?5:4};
    };
    const task=()=>execute(adapter,'consultar_observacoes',{curso:'Curso',microssequencia:'Relações'});
    if(changedVersion)await assert.rejects(task,error=>error.code==='course_service_unavailable');
    else{
      const output=await task();
      assert.equal(output.context.observations.items.length,1);
      assert.deepEqual(output.context.observations.items[0].referenciaObservacao,reference);
    }
    assert.deepEqual(queueRequests.map(request=>[request.annotationSetVersion,request.cursor]),
      [[null,null],[4,null],[4,'base-2']]);
    assert.ok(queueRequests.every(request=>request.courseId===courseId&&request.expectedCourseRevision===1));
  }
});
test('declaração expressa usa referência pequena e após resposta perdida relê sem segunda escrita',async()=>{
  const {adapter,events}=harness();
  const prepared=await execute(adapter,'preparar_revisao',{curso:'Curso',microssequencia:1});
  const ref=prepared.context.explicacoes[0].referenciaRevisao;
  const output=await execute(adapter,'declarar_revisao',{referencia:ref,declaracao:'revisado'});
  assert.equal(output.context.revisao,'current');
  const writes=events.filter(value=>Array.isArray(value)&&value[0]==='write');
  assert.equal(writes.length,1);
  assert.equal(writes[0][1].expectedBasisHash,'a'.repeat(64));
  assert.equal(events.at(-1),'review');
  assert.equal(Object.hasOwn(writes[0][1],'content'),false);
  await assert.rejects(execute(adapter,'declarar_revisao',{referencia:ref,declaracao:'revisado'},
    {...principal,actorId:courseId}),error=>error.code==='invalid_content_review_reference');
  await assert.rejects(execute(adapter,'declarar_revisao',{referencia:ref,declaracao:'revisado'},
    {...principal,scopes:['authoring:read']}),error=>error.code==='insufficient_scope');
});
test('mudança de base recusa declaração e revisão não é deduzida de leitura',async()=>{
  const {adapter,events}=harness();
  const prepared=await execute(adapter,'preparar_revisao',{curso:'Curso',microssequencia:1});
  const read=adapter.getCourseContentReview;
  adapter.getCourseContentReview=async()=>({...await read(),basisHash:'b'.repeat(64)});
  await assert.rejects(execute(adapter,'declarar_revisao',{referencia:prepared.context.explicacoes[0].referenciaRevisao,
    declaracao:'revisado'}),error=>error.code==='course_content_review_conflict');
  assert.equal(events.some(value=>Array.isArray(value)&&value[0]==='write'),false);
});
test('falha da releitura após declaração perdida conserva identidade da tentativa',async()=>{
  const {adapter,events}=harness();const prepared=await execute(adapter,'preparar_revisao',{curso:'Curso',microssequencia:1});
  const referencia=prepared.context.explicacoes[0].referenciaRevisao;const read=adapter.getCourseContentReview;let reads=0;
  adapter.getCourseContentReview=async()=>{if(++reads>1)throw Object.assign(new Error('Rede indisponível'),{status:503});return read();};
  let failure;try{await execute(adapter,'declarar_revisao',{referencia,declaracao:'revisado'});}catch(error){failure=error;}
  assert.equal(failure.code,'course_write_uncertain');
  assert.equal(failure.details.requestId,openContentReviewReference(referencia,principal).requestId);
  assert.equal(events.filter(value=>Array.isArray(value)&&value[0]==='write').length,1);
});
test('paginação da fila exige a mesma versão e não apresenta mistura como contexto corrente',async()=>{
  const {adapter}=harness(); let page=0;
  const get=adapter.getCourseAnchoredAnnotations;
  adapter.getCourseAnchoredAnnotations=async request=>{
    const value=await get(request);page++;
    return{...value,annotationSetVersion:page===1?4:5,hasMore:page===1,nextCursor:page===1?'second':null};
  };
  await assert.rejects(execute(adapter,'consultar_observacoes',{curso:'Curso',microssequencia:1}),
    error=>error.code==='course_service_unavailable');
});
test('editar a versão exata da observação relê o efeito perdido e não consome nem repete',async()=>{
  const {adapter}=harness();let writes=0;
  const get=adapter.getCourseAnchoredAnnotations;let updated=null;
  adapter.getCourseAnchoredAnnotations=async request=>{
    const page=await get(request);return{...page,items:updated?[updated]:page.items};
  };
  adapter.executeCourseAnchoredAnnotationCommand=async request=>{
    writes++;assert.equal(request.expectedCourseRevision,null);
    assert.equal(request.command.expectedAnnotationVersion,2);
    const page=await get({query:{hierarchy:null,states:[]}});
    updated={...page.items[0],annotationVersion:3,rawText:request.command.rawText,category:request.command.category};
    throw Object.assign(new Error('Resposta perdida'),{status:503});
  };
  const output=await execute(adapter,'editar_observacao',{curso:'Curso',observacao:reference,texto:'Nova observação preservada.'});
  assert.equal(writes,1);
  assert.equal(output.context.observations.items[0].referenciaObservacao.annotationVersion,3);
  assert.equal(output.context.observations.items[0].state,'considered');
  await assert.rejects(execute(adapter,'editar_observacao',{curso:'Curso',observacao:reference,texto:'Texto obsoleto.'}),
    error=>error.code==='course_observation_version_conflict');
  assert.equal(writes,1);
});
test('registro na base sem unidades acrescenta observação e não envia correção ou revisão',async()=>{
  const {adapter}=harness();const writes=[];
  adapter.createCourseAnchoredAnnotations=async request=>{writes.push(request);return{changed:true};};
  await execute(adapter,'registrar_observacao',{curso:'Curso',microssequencia:'Relações',texto:'Desenvolva a causa.'});
  assert.equal(writes.length,1);assert.equal(writes[0].commands.length,1);
  assert.deepEqual(writes[0].commands[0].target,{kind:'microsequence_explanation',id:'micro'});
  assert.equal(writes[0].commands[0].type,'create_anchored_annotation');
});
test('retomar_correcao conserva tentativa ausente como incerteza e não inicia outra escrita',async()=>{
  const {adapter}=harness();const requests=[];
  adapter.getCourseObservationCorrection=async request=>{requests.push(request);return{
    contract:'aralearn.course-observation-correction.v1',status:'absent',courseId,requestId:request.requestId};};
  adapter.commitCourseObservationCorrections=()=>assert.fail('Retomar não reescreve conteúdo.');
  await assert.rejects(execute(adapter,'retomar_correcao',{curso:'Curso',tentativa:'correction-original-1'}),
    error=>error.code==='course_write_uncertain'&&error.details.requestId==='correction-original-1'&&error.details.targetCourseId===courseId);
  assert.equal(requests.length,1);
  assert.equal(requests[0].requestId,'correction-original-1');
});
test('recuperação preserva alvo renomeado ou homônimo e exige o objeto exato do erro',async()=>{
  const {adapter}=harness();let reads=0;
  adapter.listCourses=()=>assert.fail('A recuperação não resolve novamente um título que pode ter mudado.');
  adapter.getCourseObservationCorrection=async request=>{reads++;assert.equal(request.courseId,courseId);return{
    contract:'aralearn.course-observation-correction.v1',status:'absent',courseId,requestId:request.requestId};};
  const recuperacao={courseId,requestId:'correction-original-1',operation:'course_observation_correction'};
  await assert.rejects(execute(adapter,'retomar_correcao',{recuperacao}),error=>error.code==='course_write_uncertain');
  for(const change of [{operation:'delete_course'},{courseId:'outro'},{body:'arbitrário'}]){
    await assert.rejects(execute(adapter,'retomar_correcao',{recuperacao:{...recuperacao,...change}}),
      error=>error.code==='invalid_observation_recovery');
  }
  assert.equal(reads,1);
});
test('fragmentos grandes conservam conteúdo e referências estáveis até a leitura completa',async()=>{
  const {adapter}=harness({large:true});
  const args={curso:'Curso',microssequencia:1};let continuation;let literal='';let pages=0;
  do {
    const output=await execute(adapter,'preparar_revisao',{...args,...(continuation?{continuacao:continuation}:{})});
    assert.ok(output.context.fragmento);literal+=output.context.fragmento.texto;pages++;
    continuation=output.context.continuacao;
  } while(continuation&&pages<10);
  assert.ok(pages>1&&pages<10);assert.equal(continuation,null);
  const read=JSON.parse(literal);
  assert.equal(read.explicacoes[0].conteudo.content.length,20);
  assert.ok(read.explicacoes[0].conteudo.content.every(item=>item.data.text==='Conhecimento e relações. '.repeat(400).trim()));
  assert.deepEqual(read.observations.items[0].referenciaObservacao,reference);
});
