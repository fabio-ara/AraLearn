begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select no_plan();
set constraints all deferred;
select set_config('request.jwt.claim.role','service_role',true);

-- Apenas identidades sintéticas, com rollback; nenhuma decisão humana simulada.
insert into auth.users(instance_id,id,aud,role,email,encrypted_password,email_confirmed_at,raw_app_meta_data,raw_user_meta_data,created_at,updated_at)
select '00000000-0000-0000-0000-000000000000',id,'authenticated','authenticated',email,'',now(),'{}','{}',now(),now()
from (values
 ('99300000-0000-4000-8000-000000000001'::uuid,'copy-reader-owner@example.test'),
 ('99300000-0000-4000-8000-000000000002'::uuid,'copy-reader-other@example.test')) x(id,email);
insert into public.courses(id,owner_id,title,goal,visibility,updated_at) values
 ('99300000-0000-4000-8000-000000000101','99300000-0000-4000-8000-000000000001','Origem própria','Preservar o original.','private','2026-09-01T00:00:00Z'),
 ('99300000-0000-4000-8000-000000000102','99300000-0000-4000-8000-000000000002','Origem compartilhada copiável','Preservar o original.','private','2026-09-02T00:00:00Z'),
 ('99300000-0000-4000-8000-000000000103','99300000-0000-4000-8000-000000000002','Origem compartilhada só para estudo','Preservar o original.','private','2026-09-03T00:00:00Z'),
 ('99300000-0000-4000-8000-000000000104','99300000-0000-4000-8000-000000000002','Origem pública sem cópia','Preservar o original.','public','2026-09-04T00:00:00Z'),
 ('99300000-0000-4000-8000-000000000105','99300000-0000-4000-8000-000000000002','Origem privada sem acesso','Preservar o original.','private','2026-09-05T00:00:00Z');
insert into private.course_instructional_plans(course_id) select id from public.courses where id::text like '99300000-%';
insert into public.course_access(course_id,user_id,granted_by,can_copy) values
 ('99300000-0000-4000-8000-000000000102','99300000-0000-4000-8000-000000000001','99300000-0000-4000-8000-000000000002',true),
 ('99300000-0000-4000-8000-000000000103','99300000-0000-4000-8000-000000000001','99300000-0000-4000-8000-000000000002',false);
create temporary table original_rows as select jsonb_agg(to_jsonb(c) order by c.id) value from public.courses c where id::text like '99300000-%';
create temporary table first_page as select public.list_copyable_courses_for_actor_v1('99300000-0000-4000-8000-000000000001',null,1) value;
select is((select value->>'contract' from first_page),'aralearn.course-list.v2','Envelope de lista vigente');
select is((select value#>>'{items,0,courseId}' from first_page),'99300000-0000-4000-8000-000000000102','Filtro copiável ocorre antes do limite, mesmo com três cursos mais recentes não autorizados');
select is((select value->>'hasMore' from first_page),'true','Cursor considera a origem própria ainda restante');
select is((select value#>>'{items,0,canCopy}' from first_page),'true','Grant explícito habilita cópia');
select is((select value#>>'{items,0,canEdit}' from first_page),'false','Grant de cópia não concede edição da origem');
select is((select value#>'{items,0}' from first_page),private.course_list_projection_v2('99300000-0000-4000-8000-000000000102','99300000-0000-4000-8000-000000000001'),'Projeção permitida atual é reutilizada integralmente');
create temporary table second_page as select public.list_copyable_courses_for_actor_v1('99300000-0000-4000-8000-000000000001',null,1,
 (value#>>'{nextCursor,beforeUpdatedAt}')::timestamptz,(value#>>'{nextCursor,beforeId}')::uuid) value from first_page;
select is((select value#>>'{items,0,courseId}' from second_page),'99300000-0000-4000-8000-000000000101','Próxima página devolve origem própria sem pular ou repetir');
select is((select value->>'hasMore' from second_page),'false','Última página não anuncia curso não autorizado');
select is((select value->'nextCursor' from second_page),'null'::jsonb,'Fim da lista não expõe cursor de curso não autorizado');
select is(public.list_copyable_courses_for_actor_v1('99300000-0000-4000-8000-000000000001',p_course_id=>'99300000-0000-4000-8000-000000000101')#>>'{items,0,canEdit}','true','Lookup UUID próprio autorizado');
select is(public.list_copyable_courses_for_actor_v1('99300000-0000-4000-8000-000000000001',p_course_id=>'99300000-0000-4000-8000-000000000102')#>>'{items,0,courseId}','99300000-0000-4000-8000-000000000102','Lookup UUID compartilhado com cópia autorizado');
select is(public.list_copyable_courses_for_actor_v1('99300000-0000-4000-8000-000000000001',p_course_id=>id)->'items','[]'::jsonb,'Lookup UUID nega sem copiar: '||id)
from (values ('99300000-0000-4000-8000-000000000103'::uuid),('99300000-0000-4000-8000-000000000104'::uuid),('99300000-0000-4000-8000-000000000105'::uuid),('99300000-0000-4000-8000-000000000199'::uuid)) x(id);
select is(jsonb_array_length(public.list_copyable_courses_for_actor_v1('99300000-0000-4000-8000-000000000001','própria')->'items'),1,'Busca textual conserva filtro de autorização');
select is(public.list_copyable_courses_for_actor_v1('99300000-0000-4000-8000-000000000001','sem acesso')->'items','[]'::jsonb,'Busca textual não revela curso privado alheio');
select throws_ok($$select public.list_copyable_courses_for_actor_v1(null)$$,'42501','Perfil de pessoa obrigatório.','Ator ausente rejeitado');
select throws_ok($$select public.list_copyable_courses_for_actor_v1('99300000-0000-4000-8000-000000000099')$$,'42501','Perfil de pessoa obrigatório.','Ator sem perfil rejeitado');
select throws_ok($$select public.list_copyable_courses_for_actor_v1('99300000-0000-4000-8000-000000000001',p_limit=>0)$$,'22023','Consulta de cursos inválida.','Limite inválido rejeitado');
select throws_ok($$select public.list_copyable_courses_for_actor_v1('99300000-0000-4000-8000-000000000001',p_before_id=>'99300000-0000-4000-8000-000000000101')$$,'22023','Consulta de cursos inválida.','Cursor incompleto rejeitado');
select is((select jsonb_agg(to_jsonb(c) order by c.id) from public.courses c where id::text like '99300000-%'),(select value from original_rows),'Leituras não regravam cursos, revisão ou metadados');
select ok(has_function_privilege('service_role','public.list_copyable_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid,uuid)','EXECUTE'),'Novo reader é concedido ao serviço');
select ok(not has_function_privilege(role_name,'public.list_copyable_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid,uuid)','EXECUTE'),'Reader não exposto a '||role_name) from (values ('anon'),('authenticated')) x(role_name);
select ok(not has_function_privilege('service_role','public.list_courses_for_actor_v1(uuid,text,integer,timestamptz,uuid)','EXECUTE'),'Wrapper retirado de lista permanece revogado');
select ok(not has_function_privilege('service_role','public.get_course_for_actor_v1(uuid,uuid,boolean)','EXECUTE'),'Wrapper retirado de detalhe permanece revogado');
select set_config('request.jwt.claim.role','authenticated',true);
select throws_ok($$select public.list_copyable_courses_for_actor_v1('99300000-0000-4000-8000-000000000001')$$,'42501','Operação restrita ao serviço de autoria.','Guarda real de role recusa identidade fora do serviço');
select * from finish();
rollback;
