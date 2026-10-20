import test from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { preparedReadDatabase, PREPARED_READ_TABLES } from '../support/preparedHumanReadPglite.js';
import { openPreparedHumanRead, presentPersistedHumanRead } from '../../supabase/functions/_shared/aralearn-authoring/coursePreparedHumanRead.js';
import { openHumanReadContinuation, prepareHumanReadContextLiteral } from '../../supabase/functions/_shared/aralearn-authoring/courseHumanReadContext.js';

const courseId='52400000-0000-4000-8000-000000000001';
const actorId='52400000-0000-4000-8000-000000000002';
const otherId='52400000-0000-4000-8000-000000000003';
const principal={ actorId, scopes:['authoring:read'] };
const args={ curso:'Curso de teste',auditoria:true };
const name='preparar_revisao';
const payload={ content:('a'.repeat(11998)+'😀日本語 e\u0301 Wi\u2011Fi " \\ \n').repeat(9) };
const envelope={ result:'Leitura literal',deepLink:null,links:[],nextDecision:'Continuar.' };
const decode=value=>JSON.parse(Buffer.from(value,'base64url'));

async function prepare(fixture, { value=payload, nextPage=null }={}) {
  const adapter=fixture.adapter();
  adapter.listCourses=async()=>({ items:[{courseId,title:args.curso}],hasMore:false });
  adapter.getCourse=async()=>({ courseId,title:args.curso,revision:7,annotationSetVersion:1 });
  const preparedRead=await openPreparedHumanRead({ adapter,principal,name,args });
  const state=await openHumanReadContinuation({args,task:name,course:{id:courseId,revision:7}});
  const prepared=await prepareHumanReadContextLiteral(value);
  const first=await presentPersistedHumanRead({adapter,principal,preparedRead,prepared,state,nextPage,
    envelope,finalNextDecision:'Concluído.'});
  return { first,state,preparedRead,prepared };
}
const resume=(fixture,token,extra={})=>openPreparedHumanRead({adapter:fixture.adapter(),principal,name,
  args:{...args,continuacao:token},...extra});

test('SQL persistido recompõe bytes Unicode com um adapter novo por fragmento e janela limitada',async()=>{
  const fixture=await preparedReadDatabase({courseId,actorId});
  try {
    const {first,prepared}=await prepare(fixture);
    let page=first, literal='', count=0;
    while(true){
      const fragment=page.context.fragmento;
      assert.equal(fragment.inicio,literal.length);
      assert.equal(fragment.fim-fragment.inicio,fragment.texto.length);
      assert.ok(Buffer.byteLength(JSON.stringify(page.context))<=16384);
      assert.ok(JSON.stringify(page.context).length<=12000);
      assert.ok(!/[\uD800-\uDBFF]$/u.test(fragment.texto));
      literal+=fragment.texto; count++;
      if(!page.context.temMais)break;
      const before=fixture.calls.length;
      page=(await resume(fixture,page.context.continuacao)).response;
      assert.equal(fixture.calls.length,before+1);
      assert.equal(fixture.calls.at(-1).name,'read_prepared_course_read_for_actor_v1');
      assert.ok(fixture.calls.at(-1).bytes<100_000);
    }
    assert.ok(count>9); assert.equal(literal,prepared.literal); assert.deepEqual(JSON.parse(literal),payload);
    assert.equal(page.nextDecision,'Concluído.');
    const read=decode(first.context.continuacao);
    const totals=(await fixture.db.query('select total,byte_size from private.course_prepared_reads where id=$1',[read.s])).rows[0];
    assert.equal(totals.total,literal.length); assert.equal(totals.byte_size,Buffer.byteLength(literal));
  } finally {await fixture.db.close();}
});

test('contagem e offsets SQL equivalem ao UTF-16 JS em Unicode e nas fronteiras dos chunks',async()=>{
  const fixture=await preparedReadDatabase({courseId,actorId});
  try {
    const prefix=JSON.stringify({content:''}).indexOf('""')+1;
    const cases=[
      {name:'BMP e extremos suplementares',content:'ASCII á ñ 日本語 e\u0301 \uFFFF \u{10000} \u{10FFFF} 😀 '.repeat(700)},
      {name:'primeiro chunk 11999 por par substituto',content:'a'.repeat(11999-prefix)+'😀'+'z'.repeat(4000)},
      {name:'primeiro chunk 12000 com par completo',content:'a'.repeat(11998-prefix)+'😀'+'z'.repeat(4000)}
    ];
    for(const [index,item] of cases.entries()){
      const {first,prepared,preparedRead}=await prepare(fixture,{value:{content:item.content}});
      const id=decode(first.context.continuacao).s;
      const rows=(await fixture.db.query('select start_offset,text_value from private.course_prepared_read_chunks where read_id=$1 order by ordinal',[id])).rows;
      assert.equal(prepared.literal.length,rows.reduce((sum,row)=>sum+row.text_value.length,0),item.name);
      assert.deepEqual(rows.map(row=>row.start_offset),rows.map((_,i)=>rows.slice(0,i).reduce((sum,row)=>sum+row.text_value.length,0)),item.name);
      assert.equal((await fixture.db.query('select total from private.course_prepared_reads where id=$1',[id])).rows[0].total,
        prepared.literal.length,item.name);
      if(index===1)assert.equal(rows[0].text_value.length,11999,item.name);
      if(index===2)assert.equal(rows[0].text_value.length,12000,item.name);

      const token=decode(first.context.continuacao);
      const offset=Math.min(rows[0].text_value.length+1,prepared.literal.length-1);
      const window=await fixture.adapter().readPreparedHumanRead({principal,readId:id,
        requestHash:preparedRead.requestHash,state:{...token,o:offset}});
      assert.equal(window.start,rows[0].start_offset+rows[0].text_value.length,item.name);
      assert.equal(window.text,rows.slice(1,3).map(row=>row.text_value).join(''),item.name);
      assert.equal(window.text,prepared.literal.slice(window.start,window.start+window.text.length),item.name);
    }
  } finally {await fixture.db.close();}
});

test('página seguinte descarta a identidade persistida e mantém o cursor lógico original',async()=>{
  const fixture=await preparedReadDatabase({courseId,actorId});
  try {
    let {first}=await prepare(fixture,{nextPage:'unit-13'}),page=first;
    while(page.context.fragmento.fim<page.context.fragmento.total) page=(await resume(fixture,page.context.continuacao)).response;
    const next=decode(page.context.continuacao);
    assert.equal(next.p,'unit-13');assert.equal(next.o,0);assert.equal(next.h,null);assert.equal(next.s,undefined);
    assert.equal(page.context.temMais,true);assert.equal(page.nextDecision,'Continuar.');
  } finally {await fixture.db.close();}
});

test('acesso, ator, argumentos e curso são conferidos novamente; cursor não autoriza a leitura',async()=>{
  const fixture=await preparedReadDatabase({courseId,actorId});
  try {
    const {first}=await prepare(fixture); const token=first.context.continuacao;
    await assert.rejects(resume(fixture,token,{principal:{...principal,actorId:otherId}}),e=>e.code==='PT409');
    await assert.rejects(resume(fixture,token,{args:{...args,curso:'Outro',continuacao:token}}),e=>e.code==='PT409');
    for(const patch of [{c:otherId},{r:8},{h:'0'.repeat(64)},{q:'0'.repeat(64)},{o:0},{p:'different'}]){
      const invalid=Buffer.from(JSON.stringify({...decode(token),...patch})).toString('base64url');
      await assert.rejects(resume(fixture,invalid),e=>e.code==='PT409'||e.code==='human_read_context_changed');
    }
    await fixture.db.query('update public.courses set owner_id=$1 where id=$2',[otherId,courseId]);
    await assert.rejects(resume(fixture,token),e=>e.code==='42501');
    await fixture.db.exec("set role authenticated");
    await assert.rejects(fixture.db.query('select * from private.course_prepared_reads'),e=>e.code==='42501');
    await assert.rejects(fixture.db.query('select public.get_prepared_course_read_stamp_for_actor_v1($1,$2,7)',[actorId,courseId]),e=>e.code==='42501');
  } finally {await fixture.db.close();}
});

test('fontes, corpos, plano, observações e parâmetros invalidam mesmo sem incremento de revision',async()=>{
  const fixture=await preparedReadDatabase({courseId,actorId});
  try {
    for(const table of PREPARED_READ_TABLES){
      for(const operation of ['insert','update','delete']){
        const {first}=await prepare(fixture,{value:{text:'x'.repeat(13_000)}});
        if(operation==='insert')await fixture.db.query(`insert into private.${table} values($1,'before')`,[courseId]);
        if(operation==='update')await fixture.db.query(`update private.${table} set payload='after' where course_id=$1`,[courseId]);
        if(operation==='delete')await fixture.db.query(`delete from private.${table} where course_id=$1`,[courseId]);
        await assert.rejects(resume(fixture,first.context.continuacao),e=>e.code==='PT409',`${table}/${operation}`);
      }
    }
    for(const sql of ["update public.courses set annotation_set_version=annotation_set_version+1",
      "insert into private.course_design_parameter_definitions values('new')",'truncate private.course_sources']){
      const {first}=await prepare(fixture,{value:{text:'x'.repeat(13_000)}});
      await fixture.db.exec(sql);await assert.rejects(resume(fixture,first.context.continuacao),e=>e.code==='PT409');
    }
    assert.equal((await fixture.db.query('select revision from public.courses')).rows[0].revision,7);
  } finally {await fixture.db.close();}
});

test('mudança durante preparo impede publicação; expiração/limite/remoção limpam dados efêmeros',async()=>{
  const fixture=await preparedReadDatabase({courseId,actorId});
  try {
    const prepared=await prepare(fixture,{value:{text:'x'.repeat(13_000)}});
    await fixture.db.exec("update public.courses set payload='changed'");
    await assert.rejects(presentPersistedHumanRead({adapter:fixture.adapter(),principal,...prepared,
      envelope,finalNextDecision:null}),e=>e.code==='PT409');
    const ids=[];
    for(let index=0;index<5;index++)ids.push(decode((await prepare(fixture,{value:{text:'x'.repeat(13_000)}})).first.context.continuacao).s);
    assert.equal((await fixture.db.query('select count(*)::int count from private.course_prepared_reads')).rows[0].count,4);
    assert.equal((await fixture.db.query('select 1 from private.course_prepared_read_chunks where read_id=$1',[ids[0]])).rows.length,0);
    const {first}=await prepare(fixture,{value:{text:'x'.repeat(13_000)}});
    await fixture.db.exec("update private.course_prepared_reads set expires_at=now()-interval '1 second'");
    await assert.rejects(resume(fixture,first.context.continuacao),e=>e.code==='PT409');
    await fixture.db.exec('select private.cleanup_prepared_course_reads_v1()');
    assert.equal((await fixture.db.query('select count(*)::int count from private.course_prepared_read_chunks')).rows[0].count,0);
    const latest=await prepare(fixture);
    assert.ok(latest.first.context.continuacao);
    await fixture.db.query('delete from public.courses where id=$1',[courseId]);
    for(const table of ['course_prepared_reads','course_prepared_read_chunks','course_prepared_read_generations']){
      assert.equal((await fixture.db.query(`select count(*)::int count from private.${table}`)).rows[0].count,0);
    }
    assert.equal((await fixture.db.query('select command from cron.job')).rows[0].command,'select private.cleanup_prepared_course_reads_v1();');
  } finally {await fixture.db.close();}
});

test('novo curso com o mesmo título invalida a resolução textual anterior sem alterar o curso lido',async()=>{
  const fixture=await preparedReadDatabase({courseId,actorId});
  try {
    const {first}=await prepare(fixture);
    const before=(await fixture.db.query('select generation from private.course_prepared_read_generations where course_id=$1',[courseId])).rows[0].generation;
    await fixture.db.query('insert into public.courses(id,owner_id,revision) values($1,$2,1)',[otherId,actorId]);
    assert.equal((await fixture.db.query('select generation from private.course_prepared_read_generations where course_id=$1',[courseId])).rows[0].generation,before);
    await assert.rejects(resume(fixture,first.context.continuacao),e=>e.code==='PT409');
  } finally {await fixture.db.close();}
});

test('reserva global despeja leituras antigas pelo total de bytes e rejeita digest/chunk inválidos',async()=>{
  const fixture=await preparedReadDatabase({courseId,actorId});
  try {
    const first=await prepare(fixture,{value:{text:'x'.repeat(13_000)}});
    await prepare(fixture,{value:{text:'x'.repeat(13_000)}});
    await prepare(fixture,{value:{text:'x'.repeat(13_000)}});
    // Exercise reservation accounting without allocating 120 MiB in each parallel
    // test process. The SQL admission path above independently measures text.
    await fixture.db.exec('update private.course_prepared_reads set byte_size=40*1024*1024');
    await prepare(fixture,{value:{text:'x'.repeat(13_000)}});
    const size=(await fixture.db.query('select sum(byte_size)::int bytes,count(*)::int count from private.course_prepared_reads')).rows[0];
    assert.ok(size.bytes<=96*1024*1024);assert.equal(size.count,3);
    assert.equal((await fixture.db.query('select 1 from private.course_prepared_reads where id=$1',
      [decode(first.first.context.continuacao).s])).rows.length,0);
    const request={principal,readId:'52400000-0000-4000-8000-000000000099',...first.preparedRead,
      state:first.state,envelope,finalNextDecision:null,nextPage:null};
    await assert.rejects(fixture.adapter().savePreparedHumanRead({...request,digest:'0'.repeat(64),chunks:['invalid']}),e=>e.code==='22023');
    await assert.rejects(fixture.adapter().savePreparedHumanRead({...request,digest:first.prepared.digest,
      chunks:[first.prepared.literal]}),e=>e.code==='22023');
    const literal=first.prepared.literal;
    const validChunks=[literal.slice(0,12000),literal.slice(12000)];
    // The digest still matches the string chunks, so rejecting these inputs
    // depends on checking every item's type, including JSON null.
    for(const invalid of [null,true,17,{},[]]){
      await assert.rejects(fixture.adapter().savePreparedHumanRead({...request,
        digest:first.prepared.digest,chunks:[invalid,...validChunks]}),e=>e.code==='22023');
    }
    // Both pieces fit individually and rejoin to the correct hash, but a
    // non-final piece shorter than 11999 UTF-16 units is not admissible.
    await assert.rejects(fixture.adapter().savePreparedHumanRead({...request,
      digest:first.prepared.digest,chunks:[literal.slice(0,1100),literal.slice(1100)]}),e=>e.code==='22023');
    const ordered=['a'.repeat(12000),'b'.repeat(12000)];
    const digest=createHash('sha256').update(ordered.join('')).digest('hex');
    await assert.rejects(fixture.adapter().savePreparedHumanRead({...request,
      digest,chunks:[ordered[1],ordered[0]]}),e=>e.code==='22023');
    assert.equal((await fixture.db.query('select 1 from private.course_prepared_reads where id=$1',
      [request.readId])).rows.length,0,'invalid input never publishes a read');
  } finally {await fixture.db.close();}
});
