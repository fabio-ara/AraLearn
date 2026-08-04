begin;

alter table private.catalog_management_receipts_v5
  drop constraint catalog_management_receipts_operation_v5;
alter table private.catalog_management_receipts_v5
  add constraint catalog_management_receipts_operation_v5 check (
    operation in (
      'create_collection',
      'update_collection',
      'move_collection',
      'retire_collection',
      'move_course',
      'remove_course'
    )
  );

create or replace function private.begin_catalog_management_v5(
  p_actor_id uuid,
  p_request_id text,
  p_operation text,
  p_payload_hash text
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_receipt private.catalog_management_receipts_v5%rowtype;
begin
  perform private.require_workspace_actor_v5(p_actor_id, 'catalog:manage');
  if not private.can_publish_catalog_v5(p_actor_id) then
    raise exception 'Administração do catálogo não autorizada.'
      using errcode = '42501';
  end if;
  if p_request_id is null
     or p_request_id !~ '^[A-Za-z0-9][A-Za-z0-9._:-]{7,127}$'
     or p_operation not in (
       'create_collection',
       'update_collection',
       'move_collection',
       'retire_collection',
       'move_course',
       'remove_course'
     )
     or p_payload_hash is null
     or p_payload_hash !~ '^[0-9a-f]{64}$' then
    raise exception 'Comando administrativo inválido.'
      using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-catalog-management-v5:'
      || p_actor_id::text || ':' || p_request_id,
    0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'aralearn-catalog-management-v5:global',
    0
  ));
  delete from private.catalog_management_receipts_v5 receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id
    and receipt.expires_at <= statement_timestamp();
  with expired_receipts as materialized (
    select receipt.ctid
    from private.catalog_management_receipts_v5 receipt
    where receipt.expires_at <= statement_timestamp()
    order by receipt.expires_at, receipt.actor_id, receipt.request_id
    limit 256
    for update skip locked
  )
  delete from private.catalog_management_receipts_v5 receipt
  using expired_receipts expired
  where receipt.ctid = expired.ctid;
  select * into v_receipt
  from private.catalog_management_receipts_v5 receipt
  where receipt.actor_id = p_actor_id
    and receipt.request_id = p_request_id;
  if not found then return null; end if;
  if v_receipt.operation <> p_operation
     or v_receipt.payload_hash <> p_payload_hash then
    raise exception 'requestId reutilizado com dados diferentes.'
      using errcode = '23505';
  end if;
  return v_receipt.result || jsonb_build_object('idempotent', true);
end;
$function$;

-- A coleção de recepção padrão é uma peça estrutural do catálogo. Reconciliar
-- qualquer edição anterior antes de instalar a invariável evita que um título
-- administrativo acidental se torne parte permanente do modelo.
update public.catalog_collections collection
set title = 'Outros cursos',
    description = 'Cursos oficiais ainda não associados a uma coleção temática.',
    is_published = true,
    deleted_at = null
where collection.contract_key = 'outros'
  and (
    collection.title is distinct from 'Outros cursos'
    or collection.description is distinct from
      'Cursos oficiais ainda não associados a uma coleção temática.'
    or not collection.is_published
    or collection.deleted_at is not null
  );

create function private.protect_structural_catalog_collection_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog
as $function$
begin
  if tg_op = 'DELETE' then
    if old.contract_key = 'outros' then
      raise exception 'A coleção Outros é estrutural e não pode ser excluída.'
        using errcode = '23514',
          detail = jsonb_build_object(
            'rule', 'catalog_structural_collection_semantics',
            'path', 'collection'
          )::text;
    end if;
    return old;
  end if;

  if tg_op = 'UPDATE'
     and old.contract_key = 'outros'
     and new.contract_key is distinct from 'outros' then
    raise exception 'A chave da coleção estrutural Outros é imutável.'
      using errcode = '23514',
        detail = jsonb_build_object(
          'rule', 'catalog_structural_collection_semantics',
          'path', 'collection.contractKey'
        )::text;
  end if;

  if new.contract_key = 'outros'
     and (
       new.title is distinct from 'Outros cursos'
       or new.description is distinct from
         'Cursos oficiais ainda não associados a uma coleção temática.'
       or not new.is_published
       or new.deleted_at is not null
     ) then
    raise exception 'A coleção estrutural deve permanecer como Outros cursos.'
      using errcode = '23514',
        detail = jsonb_build_object(
          'rule', 'catalog_structural_collection_semantics',
          'path', 'collection'
        )::text;
  end if;
  return new;
end;
$function$;

create trigger catalog_collections_protect_structural_other_v1
before insert or update or delete on public.catalog_collections
for each row execute function
  private.protect_structural_catalog_collection_v1();

create function public.move_catalog_collection_v5(
  p_actor_id uuid,
  p_collection_id uuid,
  p_request_id text,
  p_expected_revision bigint,
  p_position integer
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
declare
  v_payload_hash text;
  v_replay jsonb;
  v_collection public.catalog_collections%rowtype;
  v_old_position integer;
  v_position integer;
  v_movable_count integer;
  v_status text;
  v_result jsonb;
begin
  if p_collection_id is null
     or p_expected_revision is null
     or p_expected_revision < 1
     or p_position is null
     or p_position < 0 then
    raise exception 'Movimento de coleção inválido.' using errcode = '22023';
  end if;
  v_payload_hash := private.catalog_management_payload_hash_v5(
    'move_collection',
    jsonb_build_object(
      'collectionId', p_collection_id,
      'expectedRevision', p_expected_revision,
      'position', p_position
    )
  );
  v_replay := private.begin_catalog_management_v5(
    p_actor_id, p_request_id, 'move_collection', v_payload_hash
  );
  if v_replay is not null then return v_replay; end if;

  perform 1
  from public.catalog_collections collection
  where collection.is_published
    and collection.deleted_at is null
  order by collection.id
  for update;
  select * into v_collection
  from public.catalog_collections collection
  where collection.id = p_collection_id
    and collection.is_published
    and collection.deleted_at is null;
  if not found then
    raise exception 'Coleção ativa inexistente.' using errcode = 'P0002';
  end if;
  if v_collection.revision <> p_expected_revision then
    raise exception 'Revisão da coleção desatualizada.'
      using errcode = '40001';
  end if;
  if v_collection.contract_key = 'outros' then
    raise exception 'A coleção Outros permanece no final do catálogo.'
      using errcode = '23514';
  end if;

  select count(*) into v_movable_count
  from public.catalog_collections collection
  where collection.is_published
    and collection.deleted_at is null
    and collection.contract_key <> 'outros';
  v_old_position := v_collection.position;
  v_position := least(p_position, greatest(v_movable_count - 1, 0));

  if v_position < v_old_position then
    update public.catalog_collections collection
    set position = collection.position + 1
    where collection.id <> p_collection_id
      and collection.is_published
      and collection.deleted_at is null
      and collection.contract_key <> 'outros'
      and collection.position >= v_position
      and collection.position < v_old_position;
    update public.catalog_collections collection
    set position = v_position
    where collection.id = p_collection_id;
  elsif v_position > v_old_position then
    update public.catalog_collections collection
    set position = collection.position - 1
    where collection.id <> p_collection_id
      and collection.is_published
      and collection.deleted_at is null
      and collection.contract_key <> 'outros'
      and collection.position > v_old_position
      and collection.position <= v_position;
    update public.catalog_collections collection
    set position = v_position
    where collection.id = p_collection_id;
  end if;

  perform private.normalize_catalog_collection_positions_v5();
  select * into v_collection
  from public.catalog_collections collection
  where collection.id = p_collection_id;
  v_status := case
    when v_collection.position = v_old_position then 'unchanged'
    else 'moved'
  end;
  v_result := jsonb_build_object(
    'status', v_status,
    'collectionId', v_collection.id,
    'fromPosition', v_old_position,
    'position', v_collection.position,
    'revision', v_collection.revision
  );
  return private.complete_catalog_management_v5(
    p_actor_id, p_request_id, 'move_collection',
    v_payload_hash, v_result
  );
end;
$function$;

revoke all on function private.begin_catalog_management_v5(
  uuid, text, text, text
) from public, anon, authenticated, service_role;
revoke all on function private.protect_structural_catalog_collection_v1()
  from public, anon, authenticated, service_role;
revoke all on function public.move_catalog_collection_v5(
  uuid, uuid, text, bigint, integer
) from public, anon, authenticated;
grant execute on function public.move_catalog_collection_v5(
  uuid, uuid, text, bigint, integer
) to service_role;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260804170000',
    'contractVersion', 4,
    'features', jsonb_build_array(
      'lean-shared-catalog','artifact-offline-replica','granular-sync',
      'private-authoring','text-language-metadata','storage-artifact-control-plane',
      'pre-registered-publication-artifacts','single-current-course-revision',
      'storage-only-course-content','canonical-resource-registry','atomic-resource-authoring',
      'atomic-card-assistance','composed-authoring-workspaces','workspace-publication-bindings',
      'unchanged-publication-short-circuit','bounded-authoring-events','partial-private-publication',
      'microtheory-review-projection','workspace-cursor-pagination','workspace-event-cursor-pagination',
      'workspace-microsequence-card-pagination','global-catalog-course-search',
      'catalog-review-submissions','catalog-management','personal-library-course-removal',
      'course-revision-sync-compaction','automatic-sync-history-maintenance','compact-authoring-brief',
      'account-derived-authoring-capabilities','oauth-only-authoring-mcp','default-catalog-collection',
      'confidential-gpt-action-oauth','gpt-action-oauth-linking','gpt-action-oauth-relinking',
      'gpt-action-oauth-stable-callback','workspace-card-metadata','structured-authoring-errors',
      'situated-personal-comments-v1','educational-workspace-membership-v1',
      'educational-workspace-invitations-v1','workspace-capability-enforcement-v1',
      'workspace-member-course-access-v1','workspace-contextual-current-state-v1',
      'workspace-pedagogical-comments-v1','workspace-course-state-projection-v1',
      'non-punitive-study-state-v1','non-punitive-study-projections-v1',
      'workspace-comment-aggregates-v1','integrated-trails-v1',
      'plans-derived-from-current-content-v1','workspace-entity-observations-v1',
      'workspace-delete-cas-v1','atomic-private-course-removal-v1',
      'atomic-catalog-course-removal-v1','single-active-course-composition-v1',
      'catalog-collection-ordering-v1'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
