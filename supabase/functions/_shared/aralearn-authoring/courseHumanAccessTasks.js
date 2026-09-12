import { AuthoringApiError } from './errors.js';
import { executeTrustedCourseWrite, resolveHumanCourseContext } from './courseHumanTaskExecutor.js';
const course={type:'string',minLength:1,maxLength:300};
const source={type:['string','integer'],minLength:1,maxLength:300,minimum:1};
const input=(properties,required)=>({type:'object',additionalProperties:false,properties,required});
const task=(name,title,description,properties,required,readOnly=false)=>({name,title,description,
  inputSchema:input(properties,required),options:{readOnly}});
export const COURSE_HUMAN_ACCESS_TASK_DEFINITIONS=[
  task('consultar_acesso','Consultar acesso ao curso','Lê visibilidade, política de arquivos e pessoas autorizadas no curso próprio.',
    {curso:course},['curso'],true),
  task('definir_visibilidade','Definir visibilidade do curso','Aplica a escolha expressa de curso público ou privado. Publicar disponibiliza arquivos por padrão, preservando exceções de fonte e arquivo. Restrição do curso pode ser escolhida explicitamente; tornar privado bloqueia visitantes.',
    {curso:course,visibilidade:{type:'string',enum:['private','public']},arquivos:{type:'string',enum:['restricted','available'],description:'Opcional: ao publicar, omitir disponibiliza arquivos; restricted restringe explicitamente. Ao tornar privado, omitir conserva a política latente. inherit pertence somente à tarefa definir_acesso_arquivos.'},confirmado:{type:'boolean',const:true,description:'Obrigatório: envie true quando a pessoa tiver pedido explicitamente esta alteração. O pedido de tornar o curso público já expressa essa escolha; não omita o campo nem confirme por iniciativa própria.'}},
    ['curso','visibilidade','confirmado']),
  task('alterar_acesso','Conceder ou revogar acesso','Usa o identificador exato da pessoa e autorização expressa. Concessão inclui a escolha sobre copiar; revogação preserva cópias independentes já existentes.',
    {curso:course,pessoa:{type:'string',minLength:3,maxLength:30},operacao:{type:'string',enum:['conceder','revogar']},
      permitirCopia:{type:'boolean'},confirmado:{type:'boolean',const:true}},['curso','pessoa','operacao','confirmado']),
  task('definir_acesso_arquivos','Definir acesso aos arquivos de uma fonte','Altera a política da fonte inspecionada dentro dos direitos atuais. Herança, restrição e disponibilidade são explícitas.',
    {curso:course,fonte:source,arquivos:{type:'string',enum:['inherit','restricted','available']},confirmado:{type:'boolean',const:true}},
    ['curso','fonte','arquivos','confirmado']),
  task('definir_politica_revisao','Definir política de acesso por revisão','Escolha expressa entre conteúdo completo salvo e somente conteúdo revisado. Não altera visibilidade, concessões ou direitos de arquivos.',
    {curso:course,politica:{type:'string',enum:['saved','reviewed_only']},confirmado:{type:'boolean',const:true}},
    ['curso','politica','confirmado'])
];
const fail=(message,status=422,code='invalid_human_access_command')=>{throw new AuthoringApiError(status,code,message);};
const envelope=(result,context)=>({result,deepLink:null,nextDecision:null,context});
const confirmed=args=>{if(args.confirmado!==true)fail('A alteração exige a escolha expressa da pessoa autora.');};
function receipt(value,contract,expected) {
  if(value?.rateLimited===true)fail('O serviço limitou esta tentativa; preserve a escolha e retome quando o acesso estiver disponível.',429,'course_access_rate_limited');
  if(value?.contract!==contract || Object.entries(expected).some(([key,item])=>value[key]!==item) ||
      typeof value.changed!=='boolean' || typeof value.idempotent!=='boolean') {
    fail('O resultado não corresponde à alteração solicitada; preserve a tentativa.',503,'course_service_unavailable');
  }
  return value;
}
async function context({adapter,principal,args,deadlineAt},withSource=false) {
  return resolveHumanCourseContext({adapter,principal,course:args.curso,...(withSource?{source:args.fonte}:{}),deadlineAt});
}
async function currentCourse(adapter,principal,courseId,deadlineAt) {
  const value=await adapter.getCourse({principal,courseId,includeOutline:false,deadlineAt});
  if(value?.courseId!==courseId || !Number.isSafeInteger(value.revision) || value.revision<1) {
    fail('Não foi possível reler o curso próprio.',503,'course_service_unavailable');
  }
  return value;
}
export const COURSE_HUMAN_ACCESS_TASK_HANDLERS={
  async consultar_acesso(values) {
    const {adapter,principal,deadlineAt}=values;const resolved=await context(values);
    const current=await currentCourse(adapter,principal,resolved.course.id,deadlineAt);
    const access=await adapter.listCourseAccess({principal,courseId:resolved.course.id,deadlineAt});
    if(access?.contract!=='aralearn.course-people.v3'||access.courseId!==resolved.course.id||!Array.isArray(access.people)) {
      fail('A lista de acessos não pôde ser confirmada.',503,'course_service_unavailable');
    }
    return envelope('Li os acessos e as políticas do curso próprio.',{
      curso:current.title,visibilidade:current.visibility??null,
      arquivos:current.publicFileAccess??null,politicaRevisao:current.reviewPolicy??null,proprietario:access.owner?.handle??null,
      pessoas:access.people.map(person=>({identificador:person.handle??null,permitirCopia:person.canCopy===true}))
    });
  },
  async definir_visibilidade(values) {
    const {adapter,principal,args,deadlineAt}=values;confirmed(args);
    if(!['private','public'].includes(args.visibilidade)||args.arquivos!==undefined&&!['restricted','available'].includes(args.arquivos))fail('Escolha visibilidade e política de arquivos válidas.');
    const resolved=await context(values);const courseId=resolved.course.id;
    const saved=await executeTrustedCourseWrite({operation:'set_course_visibility',maxCasRetries:1,
      load:()=>currentCourse(adapter,principal,courseId,deadlineAt),
      build:current=>({courseId,expectedRevision:current.revision,visibility:args.visibilidade,
        publicFileAccess:args.arquivos??(args.visibilidade==='public'?'available':current.publicFileAccess),confirmed:true}),
      commit:async request=>receipt(await adapter.setCourseVisibility({principal,...request,deadlineAt}),
        'aralearn.course-visibility-change.v1',{courseId,visibility:request.visibility,publicFileAccess:request.publicFileAccess})});
    return envelope('Confirmei a visibilidade e a política de arquivos escolhidas.',{visibilidade:saved.visibility,arquivos:saved.publicFileAccess});
  },
  async alterar_acesso(values) {
    const {adapter,principal,args,deadlineAt}=values;confirmed(args);
    if(!['conceder','revogar'].includes(args.operacao)||typeof args.pessoa!=='string'||
      !/^[a-z0-9][a-z0-9._-]{1,28}[a-z0-9]$/u.test(args.pessoa)||args.operacao==='conceder'&&typeof args.permitirCopia!=='boolean') {
      fail('Indique a operação, o identificador exato e, na concessão, se a pessoa poderá copiar.');
    }
    const resolved=await context(values);const courseId=resolved.course.id;
    const people=await adapter.searchCourseAccessPeople({principal,courseId,query:args.pessoa,limit:10,deadlineAt});
    if(people.rateLimited)fail('A busca está temporariamente limitada; retome a mesma pessoa depois.',429,'course_access_rate_limited');
    const matches=(people.items??[]).filter(person=>person.handle===args.pessoa);
    if(matches.length!==1)fail('O identificador exato não localizou uma única pessoa.',409,'ambiguous_human_reference');
    const person=matches[0];const operation=args.operacao==='conceder'?'grant_access':'revoke_access';
    await executeTrustedCourseWrite({operation,maxCasRetries:0,
      load:()=>currentCourse(adapter,principal,courseId,deadlineAt),
      build:()=>({courseId,operation,handle:person.handle,targetUserId:person.userId,
        canCopy:operation==='grant_access'?args.permitirCopia:null,confirmed:true}),
      commit:async request=>{
        const result=receipt(await adapter.manageCourseAccess({principal,...request,deadlineAt}),'aralearn.course-access-change.v3',{courseId,operation});
        if(result.person?.userId!==person.userId||operation==='grant_access'&&result.person.canCopy!==args.permitirCopia) {
          fail('A confirmação não corresponde à pessoa e permissão escolhidas.',503,'course_service_unavailable');
        }
        return result;
      }});
    return envelope(args.operacao==='conceder'?'Confirmei o acesso concedido.':'Confirmei a revogação do acesso.',{
      pessoa:person.handle,...(operation==='grant_access'?{permitirCopia:args.permitirCopia}:{})});
  },
  async definir_acesso_arquivos(values) {
    const {adapter,principal,args,deadlineAt}=values;confirmed(args);
    if(!['inherit','restricted','available'].includes(args.arquivos))fail('Escolha uma política de arquivos válida.');
    const resolved=await context(values,true);const courseId=resolved.course.id;
    const saved=await executeTrustedCourseWrite({operation:'set_course_source_file_access',maxCasRetries:0,
      load:()=>currentCourse(adapter,principal,courseId,deadlineAt),
      build:current=>({courseId,expectedRevision:current.revision,sourceId:resolved.source.sourceId,
        sourceRevision:resolved.source.revision,publicFileAccess:args.arquivos,contentHash:null}),
      commit:async request=>receipt(await adapter.setCourseSourceFileAccess({principal,...request,deadlineAt}),
        'aralearn.course-source-file-access-change.v1',{courseId,sourceId:resolved.source.sourceId,publicFileAccess:args.arquivos})});
    return envelope('Confirmei a política de arquivos da fonte inspecionada.',{fonte:resolved.source.title,arquivos:saved.publicFileAccess});
  },
  async definir_politica_revisao(values) {
    const {adapter,principal,args,deadlineAt}=values;confirmed(args);
    if(!['saved','reviewed_only'].includes(args.politica))fail('Escolha uma política de revisão válida.');
    const resolved=await context(values);const courseId=resolved.course.id;
    const saved=await executeTrustedCourseWrite({operation:'set_content_review_policy',maxCasRetries:0,
      load:()=>currentCourse(adapter,principal,courseId,deadlineAt),
      build:current=>({courseId,expectedRevision:current.revision,policy:args.politica}),
      commit:async request=>receipt(await adapter.setCourseContentReviewPolicy({principal,...request,deadlineAt}),
        'aralearn.course-content-review-policy.v1',{courseId,reviewPolicy:args.politica})});
    return envelope('Confirmei a política de acesso por revisão escolhida.',{politica:saved.reviewPolicy});
  }
};
