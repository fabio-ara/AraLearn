begin;

create extension if not exists pgtap with schema extensions;
set search_path=public,extensions,pg_catalog;
select no_plan();

select has_table('public','user_course_selections','seleções leves existem');
select has_table('public','study_paths','trilhas existem');
select has_table('public','study_path_courses','itens de trilha existem');
select has_table('public','lesson_progress','progresso de lição existe');
select has_table('public','card_progress','progresso de card existe');
select has_table('public','card_comments','comentários existem');
select hasnt_table('public','course_memberships','memberships clonadas foram removidas');
select hasnt_table('public','sync_devices','dispositivos técnicos não são públicos');
select hasnt_table('public','sync_mutations','envelopes técnicos não são públicos');
select hasnt_table('public','sync_changes','feed técnico não é público');
select has_table('private','sync_devices','dispositivos ficam no schema privado');
select has_table('private','sync_idempotency','idempotência compacta fica privada');
select has_table('private','sync_changes','feed compacto fica privado');

select has_function('public','select_catalog_course',array['uuid','uuid'],'RPC de seleção existe');
select has_function('public','unselect_catalog_course',array['uuid','uuid'],'RPC de remoção existe');
select has_function('public','fork_catalog_course_for_editing',array['uuid','uuid'],
  'RPC copy-on-write de autoria existe');
select has_function('public','create_personal_course',array['text','text','text','text','uuid'],
  'RPC de curso pessoal vazio existe');
select has_function('public','get_selected_course_graph',array['uuid'],'RPC de graph existe');
select has_function('public','bootstrap_replica',array['uuid'],'bootstrap existe');
select has_function('public','apply_sync_batch',array['uuid','jsonb'],'push LWW existe');
select has_function('public','pull_sync_changes',array['bigint','integer','uuid'],'pull incremental existe');
select has_function('public','delete_own_account',array['text'],'exclusão da conta existe');
select has_function('public','cleanup_abandoned_official_imports',
  array['boolean','interval','timestamp with time zone'],'limpeza administrativa de staging existe');
select has_function('private','release_empty_official_import_staging',array[]::text[],
  'liberação física segura do staging existe');
select hasnt_function('public','clone_catalog_course',array['uuid'],'clone legado foi removido');
select hasnt_function('public','clone_catalog_course',array['uuid','uuid'],'clone idempotente legado foi removido');
select hasnt_function('public','refresh_personal_course_from_source',array['uuid'],'refresh clonado foi removido');
select hasnt_function('public','get_personal_course_graph',array['uuid'],'graph pessoal clonado foi removido');
select hasnt_function('public','delete_personal_course',array['uuid','bigint','uuid'],'deleção clonada foi removida');
select hasnt_function('public','replace_microsequence_cards',array['uuid','uuid','jsonb','bigint','uuid'],
  'mutação autoral do app não permanece exposta');
select hasnt_function('public','publish_official_course',array['uuid'],
  'publicação otimista antiga foi removida em favor do importer atômico');
select hasnt_function('private','clone_course_tree',array['uuid','uuid'],
  'nem o schema privado conserva clonagem de árvore por usuário');
select hasnt_function('private','validate_microsequence_fragment_scope',
  array['uuid','uuid','jsonb'],'validador do fragmento autoral foi removido');
select hasnt_function('private','fragment_entity_microsequence_id',array['text','uuid'],
  'resolvedor do fragmento autoral foi removido');
select hasnt_function('private','position_findings',array['uuid'],
  'validação dinâmica de posições do modelo antigo foi removida');
select is((
  select count(*) from pg_proc p
  join pg_namespace n on n.oid=p.pronamespace
  where n.nspname='private'
    and p.proname in ('soft_delete_course_tree','soft_delete_microsequence_cards')
),0::bigint,'nenhum overload obsoleto de soft-delete permanece');

select is(private.camel_key('publication_seq'),'publicationSeq',
  'adaptador camelCase preserva o resultado sem variável sombreada');
select is((select p.provolatile::text from pg_proc p
  where p.oid='private.shape_store_payload(text,jsonb,text)'::regprocedure),'s',
  'shape_store_payload declara volatilidade STABLE coerente');
select is((select p.provolatile::text from pg_proc p
  where p.oid='private.local_row(text,jsonb)'::regprocedure),'s',
  'local_row declara volatilidade STABLE coerente');
select is((select p.provolatile::text from pg_proc p
  where p.oid='public.sync_storage_diagnostics()'::regprocedure),'v',
  'diagnóstico declara volatilidade VOLATILE coerente');
select ok(
  position('config(ordinal,table_name)' in lower(pg_get_functiondef(
    'private.prepare_official_course_replacement(uuid,uuid)'::regprocedure)))>0
  and position('foreach v_table_name' in lower(pg_get_functiondef(
    'private.prepare_official_course_replacement(uuid,uuid)'::regprocedure)))=0,
  'preparação expõe relações ordenadas ao checker sem FOREACH constante');
select ok(
  position('config(ordinal,table_name,stores)' in lower(pg_get_functiondef(
    'public.finalize_official_course_import(uuid)'::regprocedure)))>0
  and position('v_delete_tables' in lower(pg_get_functiondef(
    'public.finalize_official_course_import(uuid)'::regprocedure)))=0,
  'finalizador expõe relação e aliases ao checker sem array dinâmico');

select ok(has_function_privilege('authenticated','public.select_catalog_course(uuid,uuid)','EXECUTE'),
  'authenticated seleciona catálogo');
select ok(has_function_privilege('authenticated',
  'public.fork_catalog_course_for_editing(uuid,uuid)','EXECUTE'),
  'authenticated inicia copy-on-write explícito');
select ok(has_function_privilege('authenticated',
  'public.create_personal_course(text,text,text,text,uuid)','EXECUTE'),
  'authenticated cria curso pessoal vazio');
select ok(has_function_privilege('authenticated','public.apply_sync_batch(uuid,jsonb)','EXECUTE'),
  'authenticated sincroniza estado pessoal');
select ok(not has_function_privilege('anon','public.select_catalog_course(uuid,uuid)','EXECUTE'),
  'anon não seleciona catálogo');
select ok(not has_function_privilege('anon',
  'public.fork_catalog_course_for_editing(uuid,uuid)','EXECUTE'),
  'anon não cria cópia autoral');
select ok(not has_function_privilege('anon','public.apply_sync_batch(uuid,jsonb)','EXECUTE'),
  'anon não envia estado');
select ok(not has_function_privilege('authenticated',
  'public.begin_official_course_import(uuid,jsonb,text,jsonb,boolean)','EXECUTE'),
  'cliente comum não importa catálogo');
select ok(has_function_privilege('service_role',
  'public.begin_official_course_import(uuid,jsonb,text,jsonb,boolean)','EXECUTE'),
  'somente serviço importa catálogo');
select ok(has_function_privilege('service_role',
  'public.cleanup_abandoned_official_imports(boolean,interval,timestamp with time zone)','EXECUTE')
  and not has_function_privilege('authenticated',
  'public.cleanup_abandoned_official_imports(boolean,interval,timestamp with time zone)','EXECUTE'),
  'somente serviço limpa staging abandonado');
select ok(not has_table_privilege('authenticated','public.user_course_selections','SELECT'),
  'tabelas pessoais ficam encapsuladas por RPC');
select ok(not has_table_privilege('authenticated','private.sync_changes','SELECT'),
  'feed privado não tem leitura direta');

select has_column('public','courses','source_course_id',
  'somente a raiz pessoal registra sua origem canônica');
select hasnt_column('public','courses','source_entity_id','curso não guarda sourceEntityId');
select hasnt_column('public','courses','baseline_content_hash','curso não guarda baseline');
select hasnt_column('public','courses','personalized_at','curso não guarda personalização implícita');
select has_column('public','courses','owner_id',
  'somente uma raiz copy-on-write possui proprietário');
select hasnt_column('public','courses','kind','tipo redundante não voltou ao modelo lean');
select hasnt_type('public','course_kind','enum official/personal foi removido no corte lean');
select hasnt_function('public','user_can_edit_course',array['uuid'],
  'árvore oficial não expõe autorização de edição pessoal');
select hasnt_column('public','courses','revision','curso não possui revisão otimista');
select hasnt_column('public','courses','identity_key','curso usa UUID canônico');
select hasnt_column('public','modules','source_entity_id','módulo não guarda linhagem');
select hasnt_column('public','modules','revision','módulo não possui revisão');
select hasnt_column('public','modules','identity_key','módulo usa UUID canônico');
select hasnt_column('public','modules','deleted_at','snapshot oficial usa hard delete atômico');
select hasnt_column('public','modules','updated_at','filha oficial não guarda timestamp redundante');
select hasnt_column('public','cards','revision','card não possui revisão');
select hasnt_column('public','cards','identity_key','card usa UUID canônico');
select hasnt_column('public','cards','deleted_at','card não guarda tombstone por linha');
select hasnt_column('public','microsequences','cards_revision','microssequência não possui revisão agregada');
select hasnt_column('public','lesson_progress','progress_generation','progresso não possui geração/versionamento');
select hasnt_column('private','sync_changes','row_data','feed não duplica snapshots JSONB');
select hasnt_column('private','sync_idempotency','request','ledger não duplica payload');
select hasnt_column('private','sync_idempotency','result','ledger não duplica resultado');
select hasnt_column('private','sync_idempotency','base_revision','LWW não usa baseRevision');
select has_column('private','sync_devices','last_processed_mutation_sequence',
  'dispositivo persiste watermark causal da outbox');
select has_column('private','sync_idempotency','device_id',
  'ledger associa mutação ao dispositivo');
select has_column('private','sync_idempotency','client_sequence',
  'ledger preserva sequência causal compacta');
select has_column('private','sync_retention_policy','compacted_through_sequence',
  'compactação persiste o piso do histórico removido');

select ok(not exists(
  select 1 from information_schema.columns c
  where c.table_schema='public' and c.table_name in (
    'modules','lessons','course_guides','guide_items','lesson_topics','topic_statements',
    'microsequences','microsequence_dependencies','microsequence_statements','cards',
    'card_blocks','block_options','block_nodes','flow_nodes','flow_cases','flow_practices',
    'node_practices','node_practice_items','block_edges','block_matrix_items','block_cells',
    'block_points','block_lines','block_highlights','card_refs'
  ) and c.column_name in ('source_entity_id','revision','identity_key','deleted_at','updated_at')
),'nenhuma filha oficial conserva metadados de clone/versionamento');

select ok(exists(select 1 from pg_constraint where conrelid='public.flow_nodes'::regclass
  and conname='flow_nodes_parent_case_fk' and condeferrable),'FK circular node/case continua deferrable');
select ok(exists(select 1 from pg_constraint where conrelid='public.flow_nodes'::regclass
  and conname='flow_nodes_parent_fk' and condeferrable),'FK de pai do flow continua deferrable');
select ok(exists(select 1 from pg_constraint where conrelid='public.lesson_progress'::regclass
  and conname='lesson_progress_selection_fk'),'progresso pertence a uma seleção real');
select ok(exists(select 1 from pg_constraint where conrelid='public.card_progress'::regclass
  and conname='card_progress_card_fk'),'progresso referencia card canônico');
select ok(exists(select 1 from pg_constraint where conrelid='public.study_path_courses'::regclass
  and contype='u' and pg_get_constraintdef(oid)='UNIQUE (owner_id, selection_id)'),
  'um curso selecionado ocupa no máximo uma trilha por conta');
select ok(exists(select 1 from pg_indexes where schemaname='public'
  and indexname='modules_position_lean_uidx'),'posição de módulo é única por curso');
select ok(exists(select 1 from pg_indexes where schemaname='public'
  and indexname='cards_position_lean_uidx'),'posição de card é única por microssequência');
select ok(exists(select 1 from pg_indexes where schemaname='public'
  and indexname='catalog_collection_courses_course_lean_uidx'),
  'curso oficial pertence a uma única coleção');
select ok(not exists(select 1 from pg_indexes where schemaname='public'
  and indexname like '%\_course\_lean\_idx' escape '\'),
  'índices compostos de FK atendem curso sem cópia course_id-only');
select ok(not exists(select 1 from pg_indexes where schemaname='private'
  and indexname='official_catalog_import_stage_store_idx'),
  'PK do staging não é duplicada por índice idêntico');
select ok(exists(
  select 1 from pg_proc p
  where p.oid='public.get_selected_course_graph(uuid)'::regprocedure
    and 'statement_timeout=55s'=any(p.proconfig)
), 'graph grande possui timeout explícito abaixo do limite do gateway');
select ok(exists(
  select 1 from pg_proc p
  where p.oid='public.fork_catalog_course_for_editing(uuid,uuid)'::regprocedure
    and 'statement_timeout=60s'=any(p.proconfig)
), 'fork autoral possui timeout explícito e limitado');
select ok(not exists(
  select 1 from pg_constraint c
  where c.conrelid='private.sync_changes'::regclass
    and c.conname='sync_changes_course_id_fkey'
), 'feed retém o UUID de curso pessoal removido para transportar tombstone');
select ok(
  position('aralearn-official-import-staging' in pg_get_functiondef(
    'public.begin_official_course_import(uuid,jsonb,text,jsonb,boolean)'::regprocedure))>0
  and position('aralearn-official-import-staging' in pg_get_functiondef(
    'public.apply_official_course_import_chunk(uuid,text,integer,jsonb)'::regprocedure))>0
  and position('aralearn-official-import-staging' in pg_get_functiondef(
    'public.begin_official_course_import_flow(uuid)'::regprocedure))>0
  and position('aralearn-official-import-staging' in pg_get_functiondef(
    'public.finalize_official_course_import(uuid)'::regprocedure))>0
  and position('aralearn-official-import-staging' in pg_get_functiondef(
    'public.cleanup_abandoned_official_imports(boolean,interval,timestamp with time zone)'::regprocedure))>0,
  'todos os leitores e escritores do staging cooperam no lock global');
select ok(
  position('truncate table private.official_catalog_import_stage_rows' in lower(pg_get_functiondef(
    'private.release_empty_official_import_staging()'::regprocedure)))>0
  and position('release_empty_official_import_staging' in pg_get_functiondef(
    'public.finalize_official_course_import(uuid)'::regprocedure))>0
  and position('release_empty_official_import_staging' in pg_get_functiondef(
    'public.cleanup_abandoned_official_imports(boolean,interval,timestamp with time zone)'::regprocedure))>0,
  'finalização e limpeza liberam fisicamente apenas o staging global vazio');

select is((select count(*) from pg_class c join pg_namespace n on n.oid=c.relnamespace
  where n.nspname='public' and c.relkind='r' and not c.relrowsecurity),0::bigint,
  'todas as tabelas públicas usam RLS');
select ok(not exists(select 1 from information_schema.table_privileges
  where table_schema='public' and grantee in ('anon','PUBLIC')),'anon não possui tabela pública');

insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('00000000-0000-0000-0000-000000000000','20000000-0000-4000-8000-000000000001',
 'authenticated','authenticated','lean-a@aralearn.local','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-4000-8000-000000000002',
 'authenticated','authenticated','lean-b@aralearn.local','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','20000000-0000-4000-8000-000000000003',
 'authenticated','authenticated','lean-delete@aralearn.local','x',now(),'{}','{}',now(),now())
on conflict(id) do nothing;

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);

insert into public.courses(
  id,status,contract_key,title,goal,publication_seq,content_hash,position
) values(
  '10000000-0000-4000-8000-000000000001','draft','curso-lean-test',
  'Curso compartilhado','Testar seleção sem clone.',0,null,0
);
insert into public.modules(id,course_id,contract_key,position,title) values(
  '11000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  'modulo',0,'Módulo'
);
insert into public.lessons(id,course_id,module_id,contract_key,position,title) values(
  '12000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '11000000-0000-4000-8000-000000000001','licao',0,'Lição'
);
insert into public.microsequences(
  id,course_id,lesson_id,contract_key,position,title,goal,role,status
) values(
  '13000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001','micro',0,'Micro','Praticar','explain','ready'
);
insert into public.cards(
  id,course_id,microsequence_id,contract_key,position,resource,kind,exercise,title,
  after_text,lesson_id,card_kind,after,has_after
) values(
  '14000000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001','card',1,'paragraph','theory','none','Card','',
  '12000000-0000-4000-8000-000000000001','theory','',true
);
update public.courses set status='published',publication_seq=1,
  content_hash=repeat('a',64) where id='10000000-0000-4000-8000-000000000001';

select is((select collection_id from public.catalog_collection_courses
  where course_id='10000000-0000-4000-8000-000000000001'),
  '71000000-0000-4000-8000-000000000004'::uuid,
  'curso desconhecido entra em Outros sem mock no cliente');

savepoint catalog_routing;
insert into public.courses(
  id,status,contract_key,title,goal,publication_seq,content_hash,position
) values(
  '10000000-0000-4000-8000-000000000099','draft',
  'course-dataprev-2026-analista-processamento-seguranca-informacao',
  'Dataprev','Roteamento determinístico.',0,null,0
);
update public.courses set status='published',publication_seq=1,content_hash=repeat('d',64)
  where id='10000000-0000-4000-8000-000000000099';
select is((select collection_id from public.catalog_collection_courses
  where course_id='10000000-0000-4000-8000-000000000099'),
  '71000000-0000-4000-8000-000000000001'::uuid,
  'contract key conhecido é roteado à coleção correta');
update public.catalog_collection_courses set
  collection_id='71000000-0000-4000-8000-000000000004'
  where course_id='10000000-0000-4000-8000-000000000099';
update public.courses set status='published',publication_seq=2,content_hash=repeat('e',64)
  where id='10000000-0000-4000-8000-000000000099';
select is((select collection_id from public.catalog_collection_courses
  where course_id='10000000-0000-4000-8000-000000000099'),
  '71000000-0000-4000-8000-000000000004'::uuid,
  'republicação preserva a coleção atribuída explicitamente pelo administrador');
rollback to savepoint catalog_routing;

savepoint atomic_official_replacement;
insert into public.modules(id,course_id,contract_key,position,title) values(
  '11000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  'modulo-b',1,'Módulo B'
);
insert into public.card_blocks(
  id,course_id,card_id,contract_key,position,role,block_type,value_text
) values(
  '14100000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001','escolha',0,'primary','choice','Escolha.'
);
insert into public.block_options(
  id,course_id,block_id,contract_key,position,option_kind,text_value,is_correct,enabled
) values
  ('14200000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
   '14100000-0000-4000-8000-000000000001','a',0,'text','A',true,true),
  ('14200000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
   '14100000-0000-4000-8000-000000000001','b',1,'text','B',false,true);
insert into private.official_catalog_imports(
  import_id,course_id,contract_key,course_payload,source_hash,
  expected_counts,publish_requested,status
) values(
  '60000000-0000-4000-8000-000000000099',
  '10000000-0000-4000-8000-000000000001','curso-lean-test',
  jsonb_build_object('id','10000000-0000-4000-8000-000000000001',
    'contractKey','curso-lean-test','title','Curso compartilhado',
    'goal','Testar seleção sem clone.'),
  repeat('f',64),'{}'::jsonb,true,'staging'
);
select lives_ok($call$
  select private.prepare_official_course_replacement(
    '60000000-0000-4000-8000-000000000099',
    '10000000-0000-4000-8000-000000000001'
  )
$call$,'preparação libera invariantes imediatas antes de materializar a nova fotografia');
select is((select count(*) from public.card_blocks
  where course_id='10000000-0000-4000-8000-000000000001'),0::bigint,
  'filhas sem progresso são reconstruídas para liberar todos os índices parciais');
insert into public.modules(id,course_id,contract_key,position,title) values(
  '11000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
  'modulo-novo',0,'Módulo novo'
);
update public.modules set contract_key='modulo-b',position=1
  where id='11000000-0000-4000-8000-000000000002';
update public.modules set contract_key='modulo',position=2
  where id='11000000-0000-4000-8000-000000000001';
update public.lessons set contract_key='licao',position=0
  where id='12000000-0000-4000-8000-000000000001';
update public.microsequences set contract_key='micro',position=0
  where id='13000000-0000-4000-8000-000000000001';
update public.cards set contract_key='card',position=1
  where id='14000000-0000-4000-8000-000000000001';
insert into public.card_blocks(
  id,course_id,card_id,contract_key,position,role,block_type,question
) values(
  '14100000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001','escolha',0,'primary','choice','Escolha.'
);
-- Insert the new correct option first: without rebuilding the old options this
-- is exactly the immediate partial-index collision seen in hosted publication.
insert into public.block_options(
  id,course_id,block_id,contract_key,position,option_kind,text_value,is_correct,enabled
) values
  ('14200000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
   '14100000-0000-4000-8000-000000000001','b',0,'text','B',true,true),
  ('14200000-0000-4000-8000-000000000001','10000000-0000-4000-8000-000000000001',
   '14100000-0000-4000-8000-000000000001','a',1,'text','A',false,true);
select results_eq(
  $sql$select contract_key from public.modules
    where course_id='10000000-0000-4000-8000-000000000001'
    order by position$sql$,
  array['modulo-novo','modulo-b','modulo'],
  'inserção no início e troca de ordem materializam sem colisão temporária'
);
select is((select contract_key from public.block_options
  where block_id='14100000-0000-4000-8000-000000000001' and is_correct),'b',
  'troca da alternativa correta materializa sem colisão no índice parcial');
select ok(position('prepare_official_course_replacement' in pg_get_functiondef(
  'public.finalize_official_course_import(uuid)'::regprocedure))>0,
  'finalizador oficial sempre executa a preparação atômica');
rollback to savepoint atomic_official_replacement;

select is((select count(*) from private.sync_changes where entity_type='coursePublication'),1::bigint,
  'publicação inteira gera um único sinal');

savepoint draft_cannot_replace_live;
create temp table zero_import_manifest as
  select jsonb_object_agg(store_name,0) manifest
  from unnest(private.official_import_store_names()) store_name;

savepoint official_import_hashes_escaped_json;
select lives_ok($call$
  select public.begin_official_course_import(
    '60000000-0000-4000-8000-000000000098',
    jsonb_build_object(
      'id','10000000-0000-4000-8000-000000000098',
      'contractKey','curso-hash-utf8','title','Curso hash UTF-8','goal','Validar hash.'
    ),repeat('9',64),
    jsonb_set((select manifest from zero_import_manifest),'{modules}','1'::jsonb),
    false
  )
$call$,'begin aceita manifesto para o teste de hash UTF-8');
select lives_ok($call$
  select public.apply_official_course_import_chunk(
    '60000000-0000-4000-8000-000000000098','modules',0,
    jsonb_build_array(jsonb_build_object(
      'id','11000000-0000-4000-8000-000000000098',
      'courseId','10000000-0000-4000-8000-000000000098',
      'contractKey','modulo-hash','position',0,
      'title',E'Linha 1\nLinha 2: C:\\material'
    ))
  )
$call$,'chunk calcula hash de JSON com newline e barra sem cast textual para bytea');
select is((select count(*) from private.official_catalog_import_stage_rows
  where import_id='60000000-0000-4000-8000-000000000098'),1::bigint,
  'linha com escapes foi preservada integralmente no staging');
rollback to savepoint official_import_hashes_escaped_json;

select throws_ok($call$
  select public.begin_official_course_import(
    '60000000-0000-4000-8000-000000000001',
    jsonb_build_object(
      'id','10000000-0000-4000-8000-000000000001',
      'contractKey','curso-lean-test','title','Draft invisível','goal','Não tocar live.'
    ),repeat('e',64),(select manifest from zero_import_manifest),false
  )
$call$,'23514','Draft não pode substituir uma publicação ativa.',
  'begin rejeita draft sobre curso já publicado');

insert into private.official_catalog_imports(
  import_id,course_id,contract_key,course_payload,source_hash,
  expected_counts,publish_requested,status
) values(
  '60000000-0000-4000-8000-000000000002',
  '10000000-0000-4000-8000-000000000001','curso-lean-test',
  jsonb_build_object(
    'id','10000000-0000-4000-8000-000000000001',
    'contractKey','curso-lean-test','title','Draft invisível','goal','Não tocar live.'
  ),repeat('e',64),(select manifest from zero_import_manifest),false,'staging'
);
select throws_ok($call$
  select public.finalize_official_course_import(
    '60000000-0000-4000-8000-000000000002'
  )
$call$,'23514','Draft não pode substituir uma publicação ativa.',
  'finalize também barra staging draft antes de materializar a árvore live');
select is((select title from public.courses
  where id='10000000-0000-4000-8000-000000000001'),'Curso compartilhado',
  'draft rejeitado preserva metadados publicados');
select is((select content_hash from public.courses
  where id='10000000-0000-4000-8000-000000000001'),repeat('a',64),
  'draft rejeitado preserva hash publicado');
select is((select publication_seq from public.courses
  where id='10000000-0000-4000-8000-000000000001'),1::bigint,
  'draft rejeitado preserva sequência publicada');
select is((select count(*) from public.cards
  where course_id='10000000-0000-4000-8000-000000000001'),1::bigint,
  'draft rejeitado preserva árvore publicada');
rollback to savepoint draft_cannot_replace_live;

select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);

create temp table select_a as select public.select_catalog_course(
  '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'
) result;
select is((select result->>'status' from select_a),'applied','seleção é aplicada');
select is((select count(*) from public.user_course_selections
  where user_id='20000000-0000-4000-8000-000000000001'),1::bigint,
  'seleção não cria outra árvore');
select is((select count(*) from public.courses),1::bigint,'curso oficial permanece armazenado uma vez');
select ok((public.select_catalog_course(
  '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'
)->>'idempotent')::boolean,'retry da seleção é idempotente');
select throws_ok($$select public.unselect_catalog_course(
  '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001')$$,
  '23514','mutationId reutilizado com operação incompatível.','mutationId incompatível é rejeitado');

select is(public.get_selected_course_graph('10000000-0000-4000-8000-000000000001')->>'courseId',
  '10000000-0000-4000-8000-000000000001','graph usa curso oficial canônico');
select is(jsonb_array_length(public.get_selected_course_graph(
  '10000000-0000-4000-8000-000000000001')->'graph'->'cards'),1,
  'graph contém a árvore compartilhada');
select ok(not(public.get_selected_course_graph(
  '10000000-0000-4000-8000-000000000001')->'graph'->'cards'->0?'revision'),
  'graph não transporta revisão obsoleta');

create temp table boot_a as select public.bootstrap_replica(
  '40000000-0000-4000-8000-000000000001') result;
select is(jsonb_array_length((select result->'snapshot'->'courseSelections' from boot_a)),1,
  'bootstrap contém seleção leve');
select ok(not((select result->'snapshot' from boot_a)?'modules'),
  'bootstrap não duplica árvores oficiais');
select ok((select result from boot_a)?'highWaterSequence','bootstrap inclui high-water consistente');

create temp table push_progress as select public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000001','courseId','10000000-0000-4000-8000-000000000001',
    'sequence',1,
    'entityType','lessonProgress','entityId','51000000-0000-4000-8000-000000000001',
    'operation','insert','changedFields','[]'::jsonb,'payload',jsonb_build_object(
      'selectionId',(select id from public.user_course_selections where user_id=auth.uid()),
      'lessonId','12000000-0000-4000-8000-000000000001','cursor',0,
      'lastActivityAt','2026-07-20T10:00:00.000Z'
    )
  ))) result;
select is((select result->'results'->0->>'status' from push_progress),'applied',
  'progresso pessoal é aplicado');
select is((select cursor from public.lesson_progress where id='51000000-0000-4000-8000-000000000001'),0,
  'cursor foi persistido');

select is(public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000002','courseId','10000000-0000-4000-8000-000000000001',
    'sequence',1,
    'entityType','lessonProgress','entityId','51000000-0000-4000-8000-000000000001',
    'operation','update','changedFields',jsonb_build_array('cursor'),
    'payload',jsonb_build_object('cursor',3)
  )))->'results'->0->>'status','applied','patch LWW de outro dispositivo é aceito');
select is((select cursor from public.lesson_progress where id='51000000-0000-4000-8000-000000000001'),3,
  'última gravação vence sem conflito ou baseRevision');
select is((select last_activity_at from public.lesson_progress
  where id='51000000-0000-4000-8000-000000000001'),
  '2026-07-20 10:00:00+00'::timestamptz,'patch preserva campo não enviado');

select is(public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000099',
    'sequence',2,
    'courseId','10000000-0000-4000-8000-000000000001',
    'entityType','lessonProgress','entityId','51000000-0000-4000-8000-000000000001',
    'operation','update','changedFields',jsonb_build_array('cursor'),
    'payload',jsonb_build_object('cursor',4,'lastActivityAt','2026-07-20T11:00:00.000Z')
  )))->'results'->0->>'status','rejected',
  'payload com campo omitido de changedFields é rejeitado');
select is((select cursor from public.lesson_progress
  where id='51000000-0000-4000-8000-000000000001'),3,
  'patch rejeitado não altera a linha');
select is(public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000099',
    'sequence',2,
    'courseId','10000000-0000-4000-8000-000000000001',
    'entityType','lessonProgress','entityId','51000000-0000-4000-8000-000000000001',
    'operation','update','changedFields',jsonb_build_array('cursor'),
    'payload',jsonb_build_object('cursor',4,'lastActivityAt','2026-07-20T11:00:00.000Z')
  )))->'results'->0->>'status','rejected',
  'retry da mutação terminal continua rejeitado em vez de virar applied pelo watermark');
select ok((public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000099',
    'sequence',2,
    'courseId','10000000-0000-4000-8000-000000000001',
    'entityType','lessonProgress','entityId','51000000-0000-4000-8000-000000000001',
    'operation','update','changedFields',jsonb_build_array('cursor'),
    'payload',jsonb_build_object('cursor',4,'lastActivityAt','2026-07-20T11:00:00.000Z')
  )))->'results'->0->>'idempotent')::boolean,
  'retry devolve a rejeição persistida de forma explicitamente idempotente');
select is((select outcome from private.sync_idempotency
  where user_id=auth.uid() and mutation_id='50000000-0000-4000-8000-000000000099'),
  'rejected','ledger registra resultados terminais para sobreviver à perda da resposta');

select is(public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000097',
    'sequence',2,
    'courseId','10000000-0000-4000-8000-000000000001',
    'entityType','comments','entityId','51500000-0000-4000-8000-000000000001',
    'operation','insert','changedFields','[]'::jsonb,'payload',jsonb_build_object(
      'id','51500000-0000-4000-8000-000000000001',
      'userId','20000000-0000-4000-8000-000000000001',
      'courseId','10000000-0000-4000-8000-000000000001',
      'moduleId','11000000-0000-4000-8000-000000000001',
      'lessonId','12000000-0000-4000-8000-000000000001',
      'microsequenceId','13000000-0000-4000-8000-000000000001',
      'cardId','14000000-0000-4000-8000-000000000001',
      'courseKey','curso-lean-test','moduleKey','modulo','lessonKey','licao',
      'microsequenceKey','micro','cardKey','card','body','Comentário local.',
      'updatedAt','2026-07-20T11:00:00.000Z','deletedAt',null
    )
  )))->'results'->0->>'status','applied',
  'primeiro comentário aceita o envelope completo produzido pelo runtime');

select is(public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000003',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000094','sequence',1,
    'courseId','10000000-0000-4000-8000-000000000001',
    'entityType','comments','entityId','51500000-0000-4000-8000-000000000001',
    'operation','insert','changedFields','[]'::jsonb,'payload',jsonb_build_object(
      'selectionId',(select id from public.user_course_selections where user_id=auth.uid()),
      'cardId','14000000-0000-4000-8000-000000000001','body','Segundo dispositivo.'
    )
  )))->'results'->0->>'status','applied',
  'insert concorrente do mesmo ID é aceito como gravação LWW');
select is((select body from public.card_comments
  where id='51500000-0000-4000-8000-000000000001'),'Segundo dispositivo.',
  'segundo insert offline vence sem conflito ou cópia paralela');

select is(public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000009',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000009','sequence',1,
    'courseId','10000000-0000-4000-8000-000000000001',
    'entityType','comments','entityId','51500000-0000-4000-8000-000000000001',
    'operation','update','changedFields',jsonb_build_array('body'),
    'payload',jsonb_build_object('body',E'Linha 1\nC:\\material')
  )))->'results'->0->>'status','applied',
  'push calcula hash de JSON com newline e barra sem cast textual para bytea');
select is((select body from public.card_comments
  where id='51500000-0000-4000-8000-000000000001'),E'Linha 1\nC:\\material',
  'comentário com escapes é persistido sem perda');

select is(public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000003',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000093','sequence',2,
    'courseId','10000000-0000-4000-8000-000000000001',
    'entityType','comments','entityId','51500000-0000-4000-8000-000000000001',
    'operation','update','changedFields',jsonb_build_array('body'),
    'payload',jsonb_build_object('body','Estado mais recente.')
  )))->'results'->0->>'status','applied','update posterior do comentário é aplicado');

delete from private.sync_idempotency
  where user_id='20000000-0000-4000-8000-000000000001'
    and mutation_id='50000000-0000-4000-8000-000000000097';
select ok((public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000097','sequence',2,
    'courseId','10000000-0000-4000-8000-000000000001',
    'entityType','comments','entityId','51500000-0000-4000-8000-000000000001',
    'operation','insert','changedFields','[]'::jsonb,'payload',jsonb_build_object(
      'selectionId',(select id from public.user_course_selections where user_id=auth.uid()),
      'cardId','14000000-0000-4000-8000-000000000001','body','Comentário local.'
    )
  )))->'results'->0->>'deduplicatedByDeviceSequence')::boolean,
  'watermark do dispositivo impede replay mesmo após expirar o ledger detalhado');
select is((select body from public.card_comments
  where id='51500000-0000-4000-8000-000000000001'),'Estado mais recente.',
  'replay antigo não sobrescreve estado LWW mais novo');

insert into public.cards(
  id,course_id,microsequence_id,contract_key,position,resource,kind,exercise,title,
  after_text,lesson_id,card_kind,after,has_after
) values(
  '14000000-0000-4000-8000-000000000003','10000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001','card-transient-retry',99,
  'paragraph','theory','none','Card de retry','',
  '12000000-0000-4000-8000-000000000001','theory','',true
);

create function pg_temp.raise_sync_53100() returns trigger
language plpgsql as $$
begin
  raise exception 'recurso temporariamente indisponível' using errcode='53100';
end;
$$;
create trigger pgtap_sync_53100 before insert on public.card_comments
for each row execute function pg_temp.raise_sync_53100();
select throws_ok($call$
  select public.apply_sync_batch(
    '40000000-0000-4000-8000-000000000004',jsonb_build_array(jsonb_build_object(
      'mutationId','50000000-0000-4000-8000-000000000092','sequence',1,
      'courseId','10000000-0000-4000-8000-000000000001',
      'entityType','comments','entityId','51500000-0000-4000-8000-000000000004',
      'operation','insert','changedFields','[]'::jsonb,
      'payload',jsonb_build_object(
        'selectionId',(select id from public.user_course_selections where user_id=auth.uid()
          and course_id='10000000-0000-4000-8000-000000000001'),
        'cardId','14000000-0000-4000-8000-000000000003','body','Transitório 53.'
      )
    )))
$call$,'53100','recurso temporariamente indisponível',
  'classe 53 de falta de recurso é relançada para retry da outbox');
drop trigger pgtap_sync_53100 on public.card_comments;

create function pg_temp.raise_sync_58000() returns trigger
language plpgsql as $$
begin
  raise exception 'falha de infraestrutura temporária' using errcode='58000';
end;
$$;
create trigger pgtap_sync_58000 before insert on public.card_comments
for each row execute function pg_temp.raise_sync_58000();
select throws_ok($call$
  select public.apply_sync_batch(
    '40000000-0000-4000-8000-000000000004',jsonb_build_array(jsonb_build_object(
      'mutationId','50000000-0000-4000-8000-000000000091','sequence',1,
      'courseId','10000000-0000-4000-8000-000000000001',
      'entityType','comments','entityId','51500000-0000-4000-8000-000000000004',
      'operation','insert','changedFields','[]'::jsonb,
      'payload',jsonb_build_object(
        'selectionId',(select id from public.user_course_selections where user_id=auth.uid()
          and course_id='10000000-0000-4000-8000-000000000001'),
        'cardId','14000000-0000-4000-8000-000000000003','body','Transitório 58.'
      )
    )))
$call$,'58000','falha de infraestrutura temporária',
  'classe 58 de sistema é relançada para retry da outbox');
drop trigger pgtap_sync_58000 on public.card_comments;

create temp table retry_after_transient as select public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000004',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000090','sequence',1,
    'courseId','10000000-0000-4000-8000-000000000001',
    'entityType','comments','entityId','51500000-0000-4000-8000-000000000004',
    'operation','insert','changedFields','[]'::jsonb,
    'payload',jsonb_build_object(
      'selectionId',(select id from public.user_course_selections where user_id=auth.uid()
        and course_id='10000000-0000-4000-8000-000000000001'),
      'cardId','14000000-0000-4000-8000-000000000003','body','Retry confirmado.'
    )
  ))) result;
select is((select result->'results'->0->>'status' from retry_after_transient),'applied',
  'falhas de infraestrutura não consomem a sequência causal do dispositivo');

savepoint cross_course_identity;
select set_config('request.jwt.claim.role','service_role',true);
insert into public.courses(
  id,status,contract_key,title,goal,publication_seq,content_hash,position
) values(
  '10000000-0000-4000-8000-000000000002','published','curso-lean-test-b',
  'Curso compartilhado B','Testar identidade intra-conta.',1,repeat('c',64),1
);
select set_config('request.jwt.claim.role','authenticated',true);
select public.select_catalog_course(
  '10000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000020');
select is(public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000005',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000089','sequence',1,
    'courseId','10000000-0000-4000-8000-000000000002',
    'entityType','lessonProgress','entityId','51000000-0000-4000-8000-000000000001',
    'operation','update','changedFields',jsonb_build_array('cursor'),
    'payload',jsonb_build_object(
      'selectionId',(select id from public.user_course_selections
        where user_id=auth.uid() and course_id='10000000-0000-4000-8000-000000000002'),
      'cursor',77
    )
  )))->'results'->0->>'status','rejected',
  'seleção válida de outro curso não autoriza patch pelo entityId de curso A');
select is((select cursor from public.lesson_progress
  where id='51000000-0000-4000-8000-000000000001'),3,
  'mismatch intra-conta preserva a entidade original');
rollback to savepoint cross_course_identity;

savepoint publication_progress_reconcile;
insert into public.cards(
  id,course_id,microsequence_id,contract_key,position,resource,kind,exercise,title,
  after_text,lesson_id,card_kind,after,has_after
) values(
  '14000000-0000-4000-8000-000000000002','10000000-0000-4000-8000-000000000001',
  '13000000-0000-4000-8000-000000000001','card-2',2,'paragraph','theory','none',
  'Card 2','','12000000-0000-4000-8000-000000000001','theory','',true
);
insert into public.card_progress(
  id,selection_id,user_id,course_id,card_id,first_viewed_at,completed_at,last_activity_at
) values(
  '51600000-0000-4000-8000-000000000001',
  (select id from public.user_course_selections where user_id=auth.uid()
    and course_id='10000000-0000-4000-8000-000000000001'),
  auth.uid(),'10000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001',
  '2026-07-20T09:00:00Z','2026-07-20T10:00:00Z','2026-07-20T10:00:00Z'
);
select is(private.reconcile_official_course_progress(
  '10000000-0000-4000-8000-000000000001'),1,
  'publicação normaliza resumo quando novo card deixa lição incompleta');
select is((select cursor from public.lesson_progress
  where id='51000000-0000-4000-8000-000000000001'),0,
  'cursor passa a representar somente o prefixo concluído atual');
select is((select completed_at from public.lesson_progress
  where id='51000000-0000-4000-8000-000000000001'),null::timestamptz,
  'lição ampliada deixa de estar concluída');

insert into public.card_progress(
  id,selection_id,user_id,course_id,card_id,first_viewed_at,completed_at,last_activity_at
) values(
  '51600000-0000-4000-8000-000000000002',
  (select id from public.user_course_selections where user_id=auth.uid()
    and course_id='10000000-0000-4000-8000-000000000001'),
  auth.uid(),'10000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000002',
  '2026-07-20T10:30:00Z','2026-07-20T11:00:00Z','2026-07-20T11:00:00Z'
);
select is(private.reconcile_official_course_progress(
  '10000000-0000-4000-8000-000000000001'),1,
  'publicação promove resumo quando todos os cards atuais estão concluídos');
select is((select cursor from public.lesson_progress
  where id='51000000-0000-4000-8000-000000000001'),1,
  'cursor concluído acompanha dois cards atuais');
select is((select completed_at from public.lesson_progress
  where id='51000000-0000-4000-8000-000000000001'),
  '2026-07-20 11:00:00+00'::timestamptz,
  'conclusão da lição deriva da conclusão granular mais recente');

-- A posição de cards é positiva. Libera a posição inicial e então move o
-- card ainda não concluído para o início sem violar o índice único transitório.
update public.cards set position=3 where id='14000000-0000-4000-8000-000000000001';
update public.cards set position=1 where id='14000000-0000-4000-8000-000000000002';
update public.card_progress set completed_at=null
  where id='51600000-0000-4000-8000-000000000002';
select is(private.reconcile_official_course_progress(
  '10000000-0000-4000-8000-000000000001'),1,
  'reordenação incompatível recalcula o prefixo sem decisão do usuário');
select is((select cursor from public.lesson_progress
  where id='51000000-0000-4000-8000-000000000001'),-1,
  'card novo não concluído no início interrompe o prefixo');
select ok(position('reconcile_official_course_progress' in pg_get_functiondef(
  'public.finalize_official_course_import(uuid)'::regprocedure))>0,
  'finalização oficial sempre reconcilia o resumo de progresso');
rollback to savepoint publication_progress_reconcile;

create temp table first_progress_change as
  select min(sequence) first_sequence from private.sync_changes
  where audience_user_id='20000000-0000-4000-8000-000000000001'
    and entity_type='lessonProgress' and entity_id='51000000-0000-4000-8000-000000000001';
select is(public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000095',
    'sequence',3,
    'courseId','10000000-0000-4000-8000-000000000001',
    'entityType','lessonProgress','entityId','51000000-0000-4000-8000-000000000001',
    'operation','delete','changedFields','[]'::jsonb,
    'payload',jsonb_build_object('id','51000000-0000-4000-8000-000000000001',
      'courseId','10000000-0000-4000-8000-000000000001',
      'userId','20000000-0000-4000-8000-000000000001',
      'deletedAt','2026-07-20T12:00:00.000Z')
  )))->'results'->0->>'status','applied','primeiro dispositivo remove progresso');
select is(public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000096',
    'sequence',3,
    'courseId','10000000-0000-4000-8000-000000000001',
    'entityType','lessonProgress','entityId','51000000-0000-4000-8000-000000000001',
    'operation','delete','changedFields','[]'::jsonb,
    'payload',jsonb_build_object('id','51000000-0000-4000-8000-000000000001',
      'courseId','10000000-0000-4000-8000-000000000001',
      'userId','20000000-0000-4000-8000-000000000001',
      'deletedAt','2026-07-20T12:01:00.000Z')
  )))->'results'->0->>'status','applied','segundo delete ausente converge sem rejeição');
select is(public.pull_sync_changes(
  (select first_sequence-1 from first_progress_change),1,
  '40000000-0000-4000-8000-000000000098')->'changes'->0->>'operation','delete',
  'upsert histórico cuja linha já sumiu é projetado como delete');
select ok((public.pull_sync_changes(
  (select first_sequence-1 from first_progress_change),1,
  '40000000-0000-4000-8000-000000000098')->'changes'->0->'row')='null'::jsonb,
  'página interrompida nunca materializa upsert com row nula');

select is(public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000003','entityType','studyPaths',
    'sequence',4,
    'entityId','52000000-0000-4000-8000-000000000001','operation','insert','changedFields','[]'::jsonb,
    'payload',jsonb_build_object('title','Minha trilha','position',0)
  )))->'results'->0->>'status','applied','trilha é criada');
select is(public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000004','entityType','studyPathCourses',
    'sequence',5,
    'entityId','53000000-0000-4000-8000-000000000001','operation','insert','changedFields','[]'::jsonb,
    'payload',jsonb_build_object('pathId','52000000-0000-4000-8000-000000000001',
      'courseId','10000000-0000-4000-8000-000000000001','position',0)
  )))->'results'->0->>'status','applied','curso entra na trilha por courseId derivado');
select is(public.apply_sync_batch(
  '40000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object(
    'mutationId','50000000-0000-4000-8000-000000000005','entityType','studyPathCourses',
    'sequence',6,
    'entityId','53000000-0000-4000-8000-000000000001','operation','update',
    'changedFields',jsonb_build_array('position'),'payload',jsonb_build_object('position',2)
  )))->'results'->0->>'status','applied','patch parcial de item da trilha é aceito');
select is((select position from public.study_path_courses
  where id='53000000-0000-4000-8000-000000000001'),2,'patch parcial preserva path/selection');

create temp table feed_a_before_b as
  select coalesce(max(sequence),0) sequence from private.sync_changes;
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select public.bootstrap_replica('40000000-0000-4000-8000-000000000010');
select public.select_catalog_course(
  '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000010');
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
create temp table pull_a_invisible as select public.pull_sync_changes(
  (select sequence from feed_a_before_b),100,
  '40000000-0000-4000-8000-000000000001') result;
select is(jsonb_array_length((select result->'changes' from pull_a_invisible)),0,
  'feed de B não vaza para A');
select ok(not (select (result->>'hasMore')::boolean from pull_a_invisible),
  'mudança invisível não causa paginação infinita');
select is((select (result->>'nextSequence')::bigint from pull_a_invisible),
  (select (result->>'highWaterSequence')::bigint from pull_a_invisible),
  'cursor avança pelo intervalo sem mudanças visíveis');

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
update public.courses set publication_seq=2,content_hash=repeat('b',64)
  where id='10000000-0000-4000-8000-000000000001';
select is((select count(*) from private.sync_changes where entity_type='coursePublication'),2::bigint,
  'segunda publicação acrescenta exatamente um sinal');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
create temp table pull_b_publication as select public.pull_sync_changes(0,1000,
  '40000000-0000-4000-8000-000000000010') result;
select ok(exists(select 1 from jsonb_array_elements((select result->'changes' from pull_b_publication)) ch
  where ch->>'entityType'='courseSelections' and ch->'row'->>'contentHash'=repeat('b',64)),
  'um sinal de publicação projeta seleção atualizada para o usuário');

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
select is(public.unselect_catalog_course(
  '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002'
)->>'status','applied','remoção da seleção é aplicada');
select is(public.unselect_catalog_course(
  '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000003'
)->>'status','applied','segunda remoção concorrente é no-op idempotente');
select is((select count(*) from public.lesson_progress
  where user_id='20000000-0000-4000-8000-000000000001'),0::bigint,
  'remoção apaga progresso associado');
select is((select count(*) from public.study_path_courses
  where owner_id='20000000-0000-4000-8000-000000000001'),0::bigint,
  'remoção tira a seleção das trilhas');
select is((select count(*) from public.courses),1::bigint,
  'remoção do usuário nunca apaga catálogo compartilhado');

create temp table stale_select_replay as select public.select_catalog_course(
  '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000001'
) result;
select ok((select (result->>'superseded')::boolean from stale_select_replay),
  'replay de select anterior não desfaz unselect posterior');
select ok((select (result->>'desiredSelected')::boolean from stale_select_replay)
    and not (select (result->>'currentSelected')::boolean from stale_select_replay),
  'replay de select informa intenção antiga e estado atual ausente');
select is((select count(*) from public.user_course_selections
  where user_id='20000000-0000-4000-8000-000000000001'),0::bigint,
  'select antigo idempotente não ressuscita seleção');

select public.select_catalog_course(
  '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000004');
create temp table stale_unselect_replay as select public.unselect_catalog_course(
  '10000000-0000-4000-8000-000000000001','30000000-0000-4000-8000-000000000002'
) result;
select ok((select (result->>'superseded')::boolean from stale_unselect_replay),
  'replay de unselect anterior não desfaz select posterior');
select ok(not (select (result->>'desiredSelected')::boolean from stale_unselect_replay)
    and (select (result->>'currentSelected')::boolean from stale_unselect_replay),
  'replay de unselect informa intenção antiga e estado atual presente');
select is((select count(*) from public.user_course_selections
  where user_id='20000000-0000-4000-8000-000000000001'),1::bigint,
  'unselect antigo idempotente não remove seleção recriada');

savepoint catalog_retirement;
select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
insert into public.lesson_progress(
  id,selection_id,user_id,course_id,lesson_id,cursor,last_activity_at
) values(
  '51000000-0000-4000-8000-000000000091',
  (select id from public.user_course_selections
    where user_id='20000000-0000-4000-8000-000000000001'
      and course_id='10000000-0000-4000-8000-000000000001'),
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '12000000-0000-4000-8000-000000000001',1,'2026-07-20T13:00:00Z'
);
insert into public.card_comments(
  id,selection_id,user_id,course_id,card_id,body
) values(
  '59000000-0000-4000-8000-000000000091',
  (select id from public.user_course_selections
    where user_id='20000000-0000-4000-8000-000000000001'
      and course_id='10000000-0000-4000-8000-000000000001'),
  '20000000-0000-4000-8000-000000000001',
  '10000000-0000-4000-8000-000000000001',
  '14000000-0000-4000-8000-000000000001','Comentário antes da retirada.'
);
insert into public.study_path_courses(id,path_id,owner_id,selection_id,position)
values(
  '53000000-0000-4000-8000-000000000091',
  '52000000-0000-4000-8000-000000000001',
  '20000000-0000-4000-8000-000000000001',
  (select id from public.user_course_selections
    where user_id='20000000-0000-4000-8000-000000000001'
      and course_id='10000000-0000-4000-8000-000000000001'),0
);
create temp table retirement_feed_floor as
  select coalesce(max(sequence),0) sequence from private.sync_changes;
select throws_ok($$delete from public.courses
  where id='10000000-0000-4000-8000-000000000001'$$,
  '23514','Curso canônico não pode ser excluído fisicamente; arquive-o ou use deleted_at.',
  'curso canônico não pode perder fisicamente os tombstones do feed');
update public.courses set status='archived'
  where id='10000000-0000-4000-8000-000000000001';
select is((select count(*) from public.user_course_selections
  where course_id='10000000-0000-4000-8000-000000000001'),0::bigint,
  'retirada do catálogo remove todas as seleções no mesmo commit');
select is((select count(*) from public.lesson_progress
  where course_id='10000000-0000-4000-8000-000000000001'),0::bigint,
  'retirada remove progresso ligado à seleção');
select is((select count(*) from public.card_comments
  where course_id='10000000-0000-4000-8000-000000000001'),0::bigint,
  'retirada remove comentários ligados à seleção');
select is((select count(*) from public.study_path_courses
  where id='53000000-0000-4000-8000-000000000091'),0::bigint,
  'retirada remove o curso das trilhas pessoais');
select is((select count(*) from private.sync_changes change
  where change.sequence>(select sequence from retirement_feed_floor)
    and change.entity_type='courseSelections' and change.operation='delete'
    and change.course_id='10000000-0000-4000-8000-000000000001'),2::bigint,
  'retirada gera um tombstone de seleção para cada usuário afetado');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000001',true);
create temp table boot_after_retirement as select public.bootstrap_replica(
  '40000000-0000-4000-8000-000000000091') result;
select is(jsonb_array_length((select result->'snapshot'->'courseSelections'
  from boot_after_retirement)),0,'bootstrap não inclui seleção de curso retirado');
select is(jsonb_array_length((select result->'snapshot'->'lessonProgress'
  from boot_after_retirement)),0,'bootstrap não inclui progresso de curso retirado');
select is(jsonb_array_length((select result->'snapshot'->'comments'
  from boot_after_retirement)),0,'bootstrap não inclui comentário de curso retirado');
select is(jsonb_array_length((select result->'snapshot'->'studyPathCourses'
  from boot_after_retirement)),0,'bootstrap não inclui vínculo de trilha retirado');
select is(jsonb_array_length((select result->'selectedCourses'
  from boot_after_retirement)),0,'manifesto do bootstrap não anuncia curso retirado');
rollback to savepoint catalog_retirement;

select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000003',true);
select is(public.delete_own_account('EXCLUIR')->>'status','deleted','conta exclui seus dados de modo explícito');
select is((select count(*) from auth.users where id='20000000-0000-4000-8000-000000000003'),0::bigint,
  'usuário excluído não permanece no Auth');

select set_config('request.jwt.claim.role','service_role',true);
select ok((public.compact_sync_history(true,now())->>'dryRun')::boolean,
  'compactação possui dry-run seguro');
select is((public.compact_sync_history(true,now())->>'tombstonesDeletedWithoutWatermark')::integer,0,
  'compactação nunca apaga tombstone fora do watermark');

savepoint abandoned_staging_cleanup;
insert into private.official_catalog_imports(
  import_id,course_id,contract_key,course_payload,source_hash,
  expected_counts,publish_requested,status,updated_at
) values
  ('60000000-0000-4000-8000-000000000010','10000000-0000-4000-8000-000000000010',
   'staging-abandonado','{}',repeat('a',64),'{}',true,'staging','2026-07-01T00:00:00Z'),
  ('60000000-0000-4000-8000-000000000012','10000000-0000-4000-8000-000000000012',
   'staging-concorrente','{}',repeat('c',64),'{}',true,'staging','2026-07-29T23:00:00Z'),
  ('60000000-0000-4000-8000-000000000011','10000000-0000-4000-8000-000000000011',
   'import-concluido','{}',repeat('b',64),'{}',true,'published','2026-07-01T00:00:00Z');
insert into private.official_catalog_import_stage_rows(
  import_id,store_name,entity_id,payload,payload_hash
) values
(
  '60000000-0000-4000-8000-000000000010','modules',
  '61000000-0000-4000-8000-000000000010','{}',repeat('c',64)
),(
  '60000000-0000-4000-8000-000000000012','modules',
  '61000000-0000-4000-8000-000000000012','{}',repeat('e',64)
);
insert into private.official_catalog_import_chunks(
  import_id,store_name,chunk_index,row_count,payload_hash
) values
(
  '60000000-0000-4000-8000-000000000010','modules',0,1,repeat('d',64)
),(
  '60000000-0000-4000-8000-000000000012','modules',0,1,repeat('f',64)
);
create temp table abandoned_dry_run as select public.cleanup_abandoned_official_imports(
  true,interval '7 days','2026-07-30T00:00:00Z'
) result;
select is((select (result->>'candidateImports')::bigint from abandoned_dry_run),1::bigint,
  'dry-run encontra apenas staging abandonado');
select is((select (result->>'candidateRows')::bigint from abandoned_dry_run),1::bigint,
  'dry-run contabiliza linhas pesadas abandonadas');
select is((select (result->>'candidateChunks')::bigint from abandoned_dry_run),1::bigint,
  'dry-run contabiliza chunks abandonados');
select is((select count(*) from private.official_catalog_imports),3::bigint,
  'dry-run não remove staging');
select is((public.sync_storage_diagnostics()->>'stagingRows')::bigint,2::bigint,
  'diagnóstico expõe linhas de staging');
create temp table abandoned_cleanup_result as select public.cleanup_abandoned_official_imports(
  false,interval '7 days','2026-07-30T00:00:00Z'
) result;
select is((select (result->>'deletedImports')::bigint from abandoned_cleanup_result),1::bigint,
  'cleanup remove o import incompleto por cascade');
select ok(not(select (result->>'stagingTruncated')::boolean from abandoned_cleanup_result),
  'staging físico não é truncado enquanto outra importação está ativa');
select is((select count(*) from private.official_catalog_import_stage_rows
  where import_id='60000000-0000-4000-8000-000000000012'),1::bigint,
  'cleanup não apaga linhas da importação concorrente');
select is((select count(*) from private.official_catalog_import_chunks
  where import_id='60000000-0000-4000-8000-000000000012'),1::bigint,
  'cleanup não apaga chunks da importação concorrente');
select is((select count(*) from private.official_catalog_imports where status='published'),1::bigint,
  'cleanup nunca toca registro de publicação concluída');
update private.official_catalog_imports set updated_at='2026-07-01T00:00:00Z'
  where import_id='60000000-0000-4000-8000-000000000012';
create temp table final_staging_cleanup as select public.cleanup_abandoned_official_imports(
  false,interval '7 days','2026-07-30T00:00:00Z'
) result;
select is((select (result->>'deletedImports')::bigint from final_staging_cleanup),1::bigint,
  'cleanup posterior remove a última importação abandonada');
select ok((select (result->>'stagingTruncated')::boolean from final_staging_cleanup),
  'staging global vazio é truncado para liberar espaço físico');
select is((select count(*) from private.official_catalog_import_stage_rows),0::bigint,
  'staging de payload fica logicamente vazio após truncamento');
select is((select count(*) from private.official_catalog_import_chunks),0::bigint,
  'staging de chunks fica logicamente vazio após truncamento');
select is((select count(*) from private.official_catalog_imports where status='published'),1::bigint,
  'liberação física preserva metadados concluídos');
rollback to savepoint abandoned_staging_cleanup;

savepoint null_device_idempotency_compaction;
select set_config('request.jwt.claim.role','service_role',true);
delete from private.sync_devices;
update private.sync_retention_policy set
  minimum_retention=interval '0 seconds',
  idempotency_retention=interval '90 days'
where singleton;
insert into private.sync_idempotency(
  user_id,mutation_id,request_hash,entity_type,entity_id,operation,
  device_id,client_sequence,applied_sequence,applied_at
) values
  ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000020',
   repeat('1',64),'courseSelections',null,'select',null,null,null,'2020-01-01T00:00:00Z'),
  ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000021',
   repeat('2',64),'courseSelections',null,'unselect',null,null,null,'2020-01-01T00:00:00Z'),
  ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000022',
   repeat('3',64),'courseSelections',null,'select',null,null,9223372036854770000,'2020-01-01T00:00:00Z'),
  ('20000000-0000-4000-8000-000000000002','30000000-0000-4000-8000-000000000023',
   repeat('4',64),'courseSelections',null,'unselect',null,null,null,'2029-12-31T00:00:00Z');
create temp table null_device_compaction as select public.compact_sync_history(
  false,'2030-01-01T00:00:00Z'
) result;
select ok((select (result->>'deletedIdempotency')::bigint from null_device_compaction)>=2,
  'compactação alcança ledger antigo de select/unselect sem deviceId');
select is((select count(*) from private.sync_idempotency where mutation_id in (
  '30000000-0000-4000-8000-000000000020','30000000-0000-4000-8000-000000000021'
)),0::bigint,'ledger null-device expirado é removido após a retenção');
select is((select count(*) from private.sync_idempotency
  where mutation_id='30000000-0000-4000-8000-000000000022'),1::bigint,
  'idempotência ligada a sequência ainda ativa permanece protegida');
select is((select count(*) from private.sync_idempotency
  where mutation_id='30000000-0000-4000-8000-000000000023'),1::bigint,
  'retenção configurada preserva idempotência null-device recente');
rollback to savepoint null_device_idempotency_compaction;

savepoint compacted_gap;
select set_config('request.jwt.claim.role','service_role',true);
delete from private.sync_devices;
update private.sync_retention_policy set minimum_retention=interval '0 seconds' where singleton;
select public.compact_sync_history(false,now()+interval '1 second');
select is((select count(*) from private.sync_changes),0::bigint,
  'compactação pode remover todo o feed após o watermark seguro');
select ok((select compacted_through_sequence>0 from private.sync_retention_policy where singleton),
  'piso permanece mesmo quando o feed fica vazio');
select set_config('request.jwt.claim.role','authenticated',true);
select set_config('request.jwt.claim.sub','20000000-0000-4000-8000-000000000002',true);
select throws_ok($$select public.pull_sync_changes(
  0,100,'40000000-0000-4000-8000-000000000010')$$,'55000',
  'Cursor anterior ao histórico retido; novo bootstrap é obrigatório.',
  'cursor anterior à retenção exige bootstrap em vez de pular dados');
create temp table boot_after_empty_compaction as select public.bootstrap_replica(
  '40000000-0000-4000-8000-000000000099') result;
select is((select (result->>'highWaterSequence')::bigint from boot_after_empty_compaction),
  (select compacted_through_sequence from private.sync_retention_policy where singleton),
  'bootstrap vazio começa exatamente no piso compactado');
select is(jsonb_array_length(public.pull_sync_changes(
  (select (result->>'highWaterSequence')::bigint from boot_after_empty_compaction),100,
  '40000000-0000-4000-8000-000000000099')->'changes'),0,
  'pull imediatamente após bootstrap vazio não entra em loop');
rollback to savepoint compacted_gap;

savepoint personal_course_copy_on_write;
insert into auth.users(
  instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,
  raw_app_meta_data,raw_user_meta_data,created_at,updated_at
) values
('00000000-0000-0000-0000-000000000000','92000000-0000-4000-8000-000000000001',
 'authenticated','authenticated','cow-a@aralearn.local','x',now(),'{}','{}',now(),now()),
('00000000-0000-0000-0000-000000000000','92000000-0000-4000-8000-000000000002',
 'authenticated','authenticated','cow-b@aralearn.local','x',now(),'{}','{}',now(),now())
on conflict(id) do nothing;

select set_config('request.jwt.claim.role','service_role',true);
select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
insert into public.courses(
  id,status,contract_key,title,goal,publication_seq,content_hash,position
) values(
  '91000000-0000-4000-8000-000000000001','draft','cow-course',
  'Curso COW','Exercitar autoria explícita.',0,null,0
);
insert into public.modules(id,course_id,contract_key,position,title) values(
  '91100000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
  'modulo-cow',0,'Módulo COW'
);
insert into public.lessons(id,course_id,module_id,contract_key,position,title) values(
  '91200000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
  '91100000-0000-4000-8000-000000000001','licao-cow',0,'Lição COW'
),(
  '91200000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001',
  '91100000-0000-4000-8000-000000000001','licao-cow-offline',1,'Lição offline'
),(
  '91200000-0000-4000-8000-000000000003','91000000-0000-4000-8000-000000000001',
  '91100000-0000-4000-8000-000000000001','licao-cow-stale',2,'Lição atrasada'
);
insert into public.microsequences(
  id,course_id,lesson_id,contract_key,position,title,goal,role,status
) values(
  '91300000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
  '91200000-0000-4000-8000-000000000001','micro-cow',0,'Micro COW','Praticar',
  'explain','ready'
);
insert into public.cards(
  id,course_id,microsequence_id,contract_key,position,resource,kind,exercise,title,
  after_text,lesson_id,card_kind,after,has_after
) values(
  '91400000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
  '91300000-0000-4000-8000-000000000001','card-cow',1,'paragraph','theory','none',
  'Card COW','','91200000-0000-4000-8000-000000000001','theory','',true
),(
  '91400000-0000-4000-8000-000000000002','91000000-0000-4000-8000-000000000001',
  '91300000-0000-4000-8000-000000000001','card-cow-offline',2,'paragraph','theory','none',
  'Card offline','','91200000-0000-4000-8000-000000000001','theory','',true
);
insert into public.card_blocks(
  id,course_id,card_id,contract_key,position,role,block_type,value_text
) values(
  '91500000-0000-4000-8000-000000000001','91000000-0000-4000-8000-000000000001',
  '91400000-0000-4000-8000-000000000001','bloco-cow',0,'primary','paragraph',
  'Texto original'
);
update public.courses set status='published',publication_seq=1,content_hash=repeat('a',64)
where id='91000000-0000-4000-8000-000000000001';

select set_config('request.jwt.claim.role','authenticated',true);
create temp table cow_select as select public.select_catalog_course(
  '91000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000001'
) result;
create temp table cow_stale_progress as select jsonb_build_object(
  'mutationId','95000000-0000-4000-8000-000000000009','sequence',1,
  'courseId','91000000-0000-4000-8000-000000000001',
  'entityType','lessonProgress','entityId','93000000-0000-4000-8000-000000000004',
  'operation','insert','changedFields','[]'::jsonb,
  'payload',jsonb_build_object(
    'selectionId',(select id from public.user_course_selections where user_id=auth.uid()
      and course_id='91000000-0000-4000-8000-000000000001'),
    'lessonId','91200000-0000-4000-8000-000000000003','cursor',0,
    'lastActivityAt','2026-07-20T12:00:00.000Z'
  )
) mutation;
create temp table cow_stale_comment as select jsonb_build_object(
  'mutationId','95000000-0000-4000-8000-000000000010','sequence',2,
  'courseId','91000000-0000-4000-8000-000000000001',
  'entityType','comments','entityId','93000000-0000-4000-8000-000000000005',
  'operation','insert','changedFields','[]'::jsonb,
  'payload',jsonb_build_object(
    'selectionId',(select id from public.user_course_selections where user_id=auth.uid()
      and course_id='91000000-0000-4000-8000-000000000001'),
    'cardId','91400000-0000-4000-8000-000000000002','body','Comentário offline'
  )
) mutation;
create temp table cow_lost_response_progress as select jsonb_build_object(
  'mutationId','95000000-0000-4000-8000-000000000011','sequence',1,
  'courseId','91000000-0000-4000-8000-000000000001',
  'entityType','lessonProgress','entityId','93000000-0000-4000-8000-000000000006',
  'operation','insert','changedFields','[]'::jsonb,
  'payload',jsonb_build_object(
    'selectionId',(select id from public.user_course_selections where user_id=auth.uid()
      and course_id='91000000-0000-4000-8000-000000000001'),
    'lessonId','91200000-0000-4000-8000-000000000002','cursor',0,
    'lastActivityAt','2026-07-20T12:30:00.000Z'
  )
) mutation;
select is((select count(*) from public.courses
  where id='91000000-0000-4000-8000-000000000001' or
    source_course_id='91000000-0000-4000-8000-000000000001'),1::bigint,
  'selecionar catálogo não duplica a árvore');
select is((select count(*) from public.modules
  where course_id='91000000-0000-4000-8000-000000000001'),1::bigint,
  'seleção leve preserva uma única fotografia didática');
select is(public.apply_sync_batch(
  '96000000-0000-4000-8000-000000000004',
  jsonb_build_array((select mutation from cow_lost_response_progress))
)->'results'->0->>'status','applied',
  'progresso oficial é aceito antes do fork mesmo se a resposta puder se perder');

insert into public.lesson_progress(
  id,selection_id,user_id,course_id,lesson_id,cursor,last_activity_at
) values(
  '93000000-0000-4000-8000-000000000001',
  (select id from public.user_course_selections where user_id=auth.uid()
    and course_id='91000000-0000-4000-8000-000000000001'),
  auth.uid(),'91000000-0000-4000-8000-000000000001',
  '91200000-0000-4000-8000-000000000001',0,now()
);
insert into public.card_progress(
  id,selection_id,user_id,course_id,card_id,first_viewed_at,attempts,last_activity_at
) values(
  '93000000-0000-4000-8000-000000000002',
  (select id from public.user_course_selections where user_id=auth.uid()
    and course_id='91000000-0000-4000-8000-000000000001'),
  auth.uid(),'91000000-0000-4000-8000-000000000001',
  '91400000-0000-4000-8000-000000000001',now(),1,now()
);
insert into public.card_comments(
  id,selection_id,user_id,course_id,card_id,body
) values(
  '93000000-0000-4000-8000-000000000003',
  (select id from public.user_course_selections where user_id=auth.uid()
    and course_id='91000000-0000-4000-8000-000000000001'),
  auth.uid(),'91000000-0000-4000-8000-000000000001',
  '91400000-0000-4000-8000-000000000001','Comentário preservado'
);
insert into public.study_paths(id,owner_id,title,position) values(
  '94000000-0000-4000-8000-000000000001',auth.uid(),'Trilha COW',0
);
insert into public.study_path_courses(id,path_id,owner_id,selection_id,position) values(
  '94000000-0000-4000-8000-000000000002',
  '94000000-0000-4000-8000-000000000001',auth.uid(),
  (select id from public.user_course_selections where user_id=auth.uid()
    and course_id='91000000-0000-4000-8000-000000000001'),0
);

create temp table cow_fork as select public.fork_catalog_course_for_editing(
  '91000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002'
) result;
select is((select result->>'selectionId' from cow_fork),
  (select result->>'selectionId' from cow_select),
  'fork mantém a selectionId como âncora causal entre dispositivos');
select is((select contract_key from public.courses
  where id=((select result->>'courseId' from cow_fork)::uuid)),'cow-course',
  'fork mantém o contractKey público estável');
select is((select owner_id from public.courses
  where id=((select result->>'courseId' from cow_fork)::uuid)),auth.uid(),
  'fork cria raiz de propriedade do autor');
select is((select source_course_id from public.courses
  where id=((select result->>'courseId' from cow_fork)::uuid)),
  '91000000-0000-4000-8000-000000000001'::uuid,
  'fork registra somente a origem canônica da raiz');
select ok((select id<>'91100000-0000-4000-8000-000000000001'::uuid
  and contract_key='modulo-cow' from public.modules
  where course_id=((select result->>'courseId' from cow_fork)::uuid)),
  'módulo copiado recebe UUID novo e mantém contractKey');
select ok((select id<>'91400000-0000-4000-8000-000000000001'::uuid
  and contract_key='card-cow' from public.cards
  where id=(
    select id from public.cards
    where course_id=((select result->>'courseId' from cow_fork)::uuid)
      and contract_key='card-cow'
  )),
  'card copiado recebe UUID novo e mantém contractKey');
select is((select count(*) from public.modules
  where course_id='91000000-0000-4000-8000-000000000001'),1::bigint,
  'fork não altera a árvore oficial de origem');
select is((select count(*) from private.personal_course_clone_map),0::bigint,
  'mapa transitório de UUIDs é descartado depois do fork');
select is((public.fork_catalog_course_for_editing(
  '91000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000002'
)->>'courseId'),(select result->>'courseId' from cow_fork),
  'retry do fork retorna a mesma raiz pessoal');
select is((select count(*) from public.courses
  where source_course_id='91000000-0000-4000-8000-000000000001'),1::bigint,
  'retry do fork não duplica a cópia pessoal');
select ok((public.apply_sync_batch(
  '96000000-0000-4000-8000-000000000004',
  jsonb_build_array((select mutation from cow_lost_response_progress))
)->'results'->0->>'idempotent')::boolean,
  'retry com resposta perdida preserva o envelope original depois do fork');
select is((select course_id from public.lesson_progress
  where id='93000000-0000-4000-8000-000000000006'),
  ((select result->>'courseId' from cow_fork)::uuid),
  'retry idempotente mantém o progresso já remapeado para a cópia pessoal');

select is((select course_id from public.lesson_progress
  where id='93000000-0000-4000-8000-000000000001'),
  ((select result->>'courseId' from cow_fork)::uuid),
  'progresso de lição passa a apontar para a cópia');
select ok((select lesson_id<>'91200000-0000-4000-8000-000000000001'::uuid
  from public.lesson_progress where id='93000000-0000-4000-8000-000000000001'),
  'progresso de lição referencia o novo UUID');
select is((select course_id from public.card_progress
  where id='93000000-0000-4000-8000-000000000002'),
  ((select result->>'courseId' from cow_fork)::uuid),
  'progresso de card passa a apontar para a cópia');
select is((select course_id from public.card_comments
  where id='93000000-0000-4000-8000-000000000003'),
  ((select result->>'courseId' from cow_fork)::uuid),
  'comentário passa a apontar para a cópia');
select is((select selection_id from public.study_path_courses
  where id='94000000-0000-4000-8000-000000000002'),
  ((select result->>'selectionId' from cow_fork)::uuid),
  'trilha passa a apontar para a seleção pessoal');
create temp table cow_stale_progress_result as select public.apply_sync_batch(
  '96000000-0000-4000-8000-000000000003',
  jsonb_build_array((select mutation from cow_stale_progress))
) result;
select is((select result->'results'->0->>'status' from cow_stale_progress_result),'applied',
  'outbox de progresso criada antes do fork continua aplicável depois dele');
select is((select course_id from public.lesson_progress
  where id='93000000-0000-4000-8000-000000000004'),
  ((select result->>'courseId' from cow_fork)::uuid),
  'progresso atrasado é remapeado para a raiz pessoal');
select ok((select progress.lesson_id<>'91200000-0000-4000-8000-000000000002'::uuid
  and lesson.contract_key='licao-cow-stale'
  from public.lesson_progress progress
  join public.lessons lesson on lesson.id=progress.lesson_id
  where progress.id='93000000-0000-4000-8000-000000000004'),
  'lessonId atrasado é remapeado por identidade contratual sem linhagem persistida');
select is(public.apply_sync_batch(
  '96000000-0000-4000-8000-000000000003',
  jsonb_build_array((select mutation from cow_stale_comment))
)->'results'->0->>'status','applied',
  'comentário criado antes do fork continua aplicável depois dele');
select ok((select comment_row.course_id=((select result->>'courseId' from cow_fork)::uuid)
  and comment_row.card_id<>'91400000-0000-4000-8000-000000000002'::uuid
  and card.contract_key='card-cow-offline'
  from public.card_comments comment_row
  join public.cards card on card.id=comment_row.card_id
  where comment_row.id='93000000-0000-4000-8000-000000000005'),
  'cardId atrasado é remapeado por hierarquia contratual para a cópia');

select ok((select is_selected from public.list_catalog_collections('')
  where course_id='91000000-0000-4000-8000-000000000001'),
  'catálogo considera a cópia derivada como selecionada');
select is((select catalog_course_id from public.list_user_course_summaries()
  where course_id=((select result->>'courseId' from cow_fork)::uuid)),
  '91000000-0000-4000-8000-000000000001'::uuid,
  'resumo pessoal preserva a identidade do catálogo');
select is((select kind from public.list_user_course_summaries()
  where course_id=((select result->>'courseId' from cow_fork)::uuid)),'personal',
  'resumo distingue a raiz pessoal');
select is(public.get_selected_course_graph(
  ((select result->>'courseId' from cow_fork)::uuid)
)->'graph'->'courses'->0->>'sourceCourseId',
  '91000000-0000-4000-8000-000000000001',
  'graph pessoal expõe a origem canônica');
select is(public.get_selected_course_graph(
  ((select result->>'courseId' from cow_fork)::uuid)
)->'graph'->'courses'->0->>'kind','personal',
  'graph distingue a cópia pessoal da árvore oficial');
create temp table cow_bootstrap as select public.bootstrap_replica(
  '96000000-0000-4000-8000-000000000001'
) result;
select is((select item->>'catalogCourseId'
  from jsonb_array_elements((select result->'selectedCourses' from cow_bootstrap)) item
  where item->>'courseId'=(select result->>'courseId' from cow_fork)),
  '91000000-0000-4000-8000-000000000001',
  'manifesto de bootstrap preserva a identidade canônica');

select set_config('request.jwt.claim.role','service_role',true);
select lives_ok($call$
  select public.begin_official_course_import(
    '97000000-0000-4000-8000-000000000001',
    jsonb_build_object('id','91000000-0000-4000-8000-000000000001',
      'contractKey','cow-course','title','Curso COW','goal','Exercitar autoria explícita.'),
    repeat('b',64),
    (select jsonb_object_agg(store_name,0)
      from unnest(private.official_import_store_names()) store_name),true
  )
$call$,'importador oficial não confunde raiz pessoal com contractKey igual');
select set_config('request.jwt.claim.role','authenticated',true);

select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000002',true);
select throws_ok(format(
  'select public.get_selected_course_graph(%L::uuid)',
  (select result->>'courseId' from cow_fork)
),'42501','Curso não está selecionado nesta conta.',
  'usuário B não lê o graph pessoal de A');
select is(public.apply_sync_batch(
  '96000000-0000-4000-8000-000000000002',jsonb_build_array(jsonb_build_object(
    'mutationId','95000000-0000-4000-8000-000000000005','sequence',1,
    'courseId',(select result->>'courseId' from cow_fork),
    'entityType','blocks','entityId',(select id from public.card_blocks
      where course_id=((select result->>'courseId' from cow_fork)::uuid)),
    'operation','update','changedFields',jsonb_build_array('value'),
    'payload',jsonb_build_object('value','Ataque')
  )))->'results'->0->>'status','rejected',
  'usuário B não altera uma linha pessoal de A');

select set_config('request.jwt.claim.sub','92000000-0000-4000-8000-000000000001',true);
select is(public.apply_sync_batch(
  '96000000-0000-4000-8000-000000000005',jsonb_build_array(jsonb_build_object(
    'mutationId','95000000-0000-4000-8000-000000000012','sequence',1,
    'courseId',(select result->>'courseId' from cow_fork),
    'entityType','blocks','entityId',(select id from public.card_blocks
      where course_id=((select result->>'courseId' from cow_fork)::uuid)),
    'operation','update','changedFields',jsonb_build_array('value'),
    'payload',jsonb_build_object('value','Texto aceito','role','secondary')
  )))->'results'->0->>'code','22023',
  'patch rejeita campo mutável presente no payload mas ausente de changedFields');
select is((select value_text from public.card_blocks
  where course_id=((select result->>'courseId' from cow_fork)::uuid)),'Texto original',
  'patch incoerente não altera a linha pessoal');
create temp table cow_patch as select public.apply_sync_batch(
  '96000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object(
    'mutationId','95000000-0000-4000-8000-000000000003','sequence',1,
    'courseId',(select result->>'courseId' from cow_fork),
    'entityType','blocks','entityId',(select id from public.card_blocks
      where course_id=((select result->>'courseId' from cow_fork)::uuid)),
    'operation','update','changedFields',jsonb_build_array('value'),
    'payload',jsonb_build_object('value','Texto pessoal')
  ))) result;
select is((select result->'results'->0->>'status' from cow_patch),'applied',
  'patch LWW de um bloco pessoal é aplicado');
select is((select value_text from public.card_blocks
  where course_id=((select result->>'courseId' from cow_fork)::uuid)),'Texto pessoal',
  'patch altera somente a linha pessoal indicada');
select is((select value_text from public.card_blocks
  where id='91500000-0000-4000-8000-000000000001'),'Texto original',
  'patch pessoal não toca a linha oficial correspondente');
select ok((select content_hash~'^[0-9a-f]{64}$' and content_hash<>repeat('a',64)
  from public.courses where id=((select result->>'courseId' from cow_fork)::uuid)),
  'mutação pessoal renova o marcador opaco de cache');
create temp table cow_marker as select content_hash from public.courses
  where id=((select result->>'courseId' from cow_fork)::uuid);
select ok((public.apply_sync_batch(
  '96000000-0000-4000-8000-000000000001',jsonb_build_array(jsonb_build_object(
    'mutationId','95000000-0000-4000-8000-000000000003','sequence',1,
    'courseId',(select result->>'courseId' from cow_fork),
    'entityType','blocks','entityId',(select id from public.card_blocks
      where course_id=((select result->>'courseId' from cow_fork)::uuid)),
    'operation','update','changedFields',jsonb_build_array('value'),
    'payload',jsonb_build_object('value','Texto pessoal')
  )))->'results'->0->>'idempotent')::boolean,
  'retry do patch pessoal é idempotente');
select is((select content_hash from public.courses
  where id=((select result->>'courseId' from cow_fork)::uuid)),
  (select content_hash from cow_marker),
  'retry idempotente não inventa outro marcador de cache');

create temp table cow_unselect as select public.unselect_catalog_course(
  '91000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000004'
) result;
select is((select count(*) from public.courses
  where source_course_id='91000000-0000-4000-8000-000000000001'),0::bigint,
  'unselect pelo ID canônico remove a raiz pessoal');
select is((select count(*) from public.modules where course_id=
  ((select result->>'removedCourseId' from cow_unselect)::uuid)),0::bigint,
  'unselect pessoal remove toda a árvore por cascade');
select is((select count(*) from public.courses
  where id='91000000-0000-4000-8000-000000000001'),1::bigint,
  'unselect pessoal nunca remove o catálogo compartilhado');
select ok(exists(select 1 from private.sync_changes
  where audience_user_id=auth.uid()
    and course_id=((select result->>'removedCourseId' from cow_unselect)::uuid)
    and entity_type='courseSelections' and operation='delete'),
  'unselect pessoal preserva tombstone com o UUID removido');
select ok((public.unselect_catalog_course(
  '91000000-0000-4000-8000-000000000001','95000000-0000-4000-8000-000000000004'
)->>'idempotent')::boolean,
  'retry do unselect pessoal é idempotente');
select ok(not(select is_selected from public.list_catalog_collections('')
  where course_id='91000000-0000-4000-8000-000000000001'),
  'catálogo volta a mostrar o curso como não selecionado');

select throws_ok($call$
  select public.create_personal_course(
    'cow-course','Colisão','Não permitida',null,
    '95000000-0000-4000-8000-000000000006'
  )
$call$,'23514','contractKey já pertence a um curso oficial.',
  'curso pessoal vazio não usurpa contractKey oficial');
create temp table cow_empty as select public.create_personal_course(
  'cow-empty','Curso vazio','Autoria do zero',null,
  '95000000-0000-4000-8000-000000000007'
) result;
select is((select contract_key from public.courses
  where id=((select result->>'courseId' from cow_empty)::uuid)),'cow-empty',
  'curso pessoal vazio mantém o contractKey solicitado');
select ok((select content_hash~'^[0-9a-f]{64}$' from public.courses
  where id=((select result->>'courseId' from cow_empty)::uuid)),
  'curso pessoal vazio nasce com marcador opaco de cache');
select public.unselect_catalog_course(
  ((select result->>'courseId' from cow_empty)::uuid),
  '95000000-0000-4000-8000-000000000008'
);
select is((select count(*) from public.courses
  where id=((select result->>'courseId' from cow_empty)::uuid)),0::bigint,
  'unselect direto também remove curso pessoal vazio');
release savepoint personal_course_copy_on_write;

select * from finish();
rollback;
