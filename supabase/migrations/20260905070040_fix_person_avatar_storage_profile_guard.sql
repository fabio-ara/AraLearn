-- A policy deve consultar o perfil pela guarda protegida já existente.
begin;

alter policy person_avatars_self_insert_v1 on storage.objects with check (
 bucket_id='person-avatars'
 and owner_id=(select auth.uid())::text
 and private.lock_current_account_storage_write_v1()
 and name ~ ('^'||(select auth.uid())::text||
   '/[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\.(jpg|png|webp)$')
);

-- lock_current_account_storage_write_v1 valida sessão ativa e perfil depois
-- do lock de exclusão da conta. Nenhum SELECT direto em perfis é necessário.
do $migration$
declare v_manifest jsonb;
begin
  v_manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260905070040');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
    'select '||quote_literal(v_manifest::text)||'::jsonb');
end $migration$;

commit;
