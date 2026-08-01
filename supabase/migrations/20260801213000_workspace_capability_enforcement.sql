-- Aplica as capacidades locais às rotas de autoria vigentes e mantém o acesso
-- às publicações privadas do workspace sem copiar o curso.

begin;

do $rewrite_workspace_access$
declare
  v_signatures text[] := array[
    'public.commit_authoring_workspace_changes_v5(uuid,uuid,text,text,bigint,text,jsonb,jsonb)',
    'public.update_authoring_workspace_brief_v5(uuid,uuid,text,text,bigint,text)',
    'public.get_authoring_workspace_v5(uuid,uuid,text[],boolean)',
    'public.list_authoring_workspaces_v5(uuid,integer,timestamptz,uuid)',
    'public.list_authoring_workspace_events_v5(uuid,uuid,integer,bigint)',
    'public.list_authoring_workspace_microsequence_cards_v5(uuid,uuid,text[],integer,integer,text)',
    'public.delete_authoring_workspace_v5(uuid,uuid,text,text)',
    'public.publish_authoring_workspace_course_v5(uuid,uuid,text,text,bigint,text,text,uuid,text,uuid,uuid,jsonb,jsonb)',
    'public.reuse_unchanged_authoring_publication_v5(uuid,uuid,text,text,bigint,text,text,text,text,uuid,text,uuid)'
  ];
  v_capabilities text[] := array[
    'author', 'author', 'read', 'read', 'read', 'read', 'manage', 'publish', 'publish'
  ];
  v_signature text;
  v_capability text;
  v_definition text;
  v_rewritten text;
  v_index integer;
begin
  for v_index in 1..cardinality(v_signatures) loop
    v_signature := v_signatures[v_index];
    v_capability := v_capabilities[v_index];
    select pg_get_functiondef(to_regprocedure(v_signature)) into v_definition;
    if v_definition is null then
      raise exception 'Função de workspace ausente: %.', v_signature
        using errcode = '55000';
    end if;
    if v_signature like 'public.list_authoring_workspaces_v5%' then
      v_rewritten := replace(
        v_definition,
        'where workspace.owner_id = p_owner_id',
        'where private.educational_workspace_can_v1(workspace.id, p_owner_id, ''read'')'
      );
    else
      v_rewritten := replace(
        v_definition,
        'and workspace.owner_id = p_owner_id',
        'and private.educational_workspace_can_v1(workspace.id, p_owner_id, '''
          || v_capability || ''')'
      );
    end if;
    if v_rewritten = v_definition then
      raise exception 'Predicado de proprietário não encontrado em %.', v_signature
        using errcode = '55000';
    end if;
    if v_signature like 'public.publish_authoring_workspace_course_v5%'
       or v_signature like 'public.reuse_unchanged_authoring_publication_v5%' then
      v_rewritten := replace(
        v_rewritten,
        '(p_target = ''private'' and course.owner_id = p_owner_id)',
        '(p_target = ''private'' and course.owner_id = v_workspace.owner_id)'
      );
    end if;
    if v_signature like 'public.publish_authoring_workspace_course_v5%' then
      v_rewritten := replace(
        v_rewritten,
        'case when p_target = ''private'' then p_owner_id end',
        'case when p_target = ''private'' then v_workspace.owner_id end'
      );
    end if;
    execute v_rewritten;
  end loop;
end;
$rewrite_workspace_access$;

create function private.grant_workspace_publications_to_member_v1(
  p_workspace_id uuid,
  p_user_id uuid
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  insert into public.user_course_selections(user_id, course_id, position)
  select
    p_user_id,
    publication.course_id,
    coalesce((
      select max(selection.position) + 1
      from public.user_course_selections selection
      where selection.user_id = p_user_id
    ), 0) + row_number() over(order by publication.course_id) - 1
  from private.authoring_workspace_publications publication
  join public.courses course on course.id = publication.course_id
  where publication.workspace_id = p_workspace_id
    and publication.target = 'private'
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled
  on conflict(user_id, course_id) do nothing;

  insert into private.course_revision_sync_changes(
    user_id, scope, entity_id, operation, revision_hash
  )
  select distinct
    p_user_id, 'private', publication.course_id, 'upsert', publication.content_hash
  from private.authoring_workspace_publications publication
  join public.courses course on course.id = publication.course_id
  where publication.workspace_id = p_workspace_id
    and publication.target = 'private'
    and course.status = 'published'
    and course.deleted_at is null
    and course.document_storage_enabled;
end;
$function$;

create function private.revoke_workspace_publications_from_member_v1(
  p_workspace_id uuid,
  p_user_id uuid,
  p_course_id uuid default null
)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $function$
begin
  insert into private.course_revision_sync_changes(
    user_id, scope, entity_id, operation, revision_hash
  )
  select distinct p_user_id, 'private', target.course_id, 'delete', null
  from (
    select publication.course_id
    from private.authoring_workspace_publications publication
    where publication.workspace_id = p_workspace_id
      and publication.target = 'private'
    union
    select p_course_id where p_course_id is not null
  ) target
  join public.courses course on course.id = target.course_id
  where course.owner_id is distinct from p_user_id
    and not exists (
      select 1
      from private.authoring_workspace_publications other_publication
      join private.educational_workspace_members other_member
        on other_member.workspace_id = other_publication.workspace_id
       and other_member.user_id = p_user_id
      where other_publication.course_id = target.course_id
        and other_publication.target = 'private'
        and other_publication.workspace_id <> p_workspace_id
    );

  delete from public.user_course_selections selection
  using public.courses course
  where course.id = selection.course_id
    and course.owner_id is distinct from p_user_id
    and selection.user_id = p_user_id
    and selection.course_id in (
      select publication.course_id
      from private.authoring_workspace_publications publication
      where publication.workspace_id = p_workspace_id
        and publication.target = 'private'
      union
      select p_course_id where p_course_id is not null
    )
    and not exists (
      select 1
      from private.authoring_workspace_publications other_publication
      join private.educational_workspace_members other_member
        on other_member.workspace_id = other_publication.workspace_id
       and other_member.user_id = p_user_id
      where other_publication.course_id = selection.course_id
        and other_publication.target = 'private'
        and other_publication.workspace_id <> p_workspace_id
    );
end;
$function$;

create function private.sync_workspace_member_publication_access_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
begin
  if tg_op = 'DELETE' then
    perform private.revoke_workspace_publications_from_member_v1(
      old.workspace_id, old.user_id, null
    );
    return old;
  end if;
  perform private.grant_workspace_publications_to_member_v1(
    new.workspace_id, new.user_id
  );
  return new;
end;
$function$;

create trigger sync_workspace_member_publication_access_v1
after insert or delete on private.educational_workspace_members
for each row execute function
  private.sync_workspace_member_publication_access_v1();

create function private.sync_workspace_publication_members_v1()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, private
as $function$
declare
  v_member record;
begin
  if tg_op = 'DELETE' or (tg_op = 'UPDATE' and old.target = 'private'
      and (new.target <> 'private' or new.course_id <> old.course_id)) then
    for v_member in
      select member.user_id
      from private.educational_workspace_members member
      where member.workspace_id = old.workspace_id
    loop
      perform private.revoke_workspace_publications_from_member_v1(
        old.workspace_id, v_member.user_id, old.course_id
      );
    end loop;
  end if;
  if tg_op <> 'DELETE' and new.target = 'private' then
    for v_member in
      select member.user_id
      from private.educational_workspace_members member
      where member.workspace_id = new.workspace_id
    loop
      perform private.grant_workspace_publications_to_member_v1(
        new.workspace_id, v_member.user_id
      );
    end loop;
  end if;
  if tg_op = 'DELETE' then
    return old;
  end if;
  return new;
end;
$function$;

create trigger sync_workspace_publication_members_v1
after insert or update or delete on private.authoring_workspace_publications
for each row execute function
  private.sync_workspace_publication_members_v1();

do $seed_workspace_publication_access$
declare
  v_member record;
begin
  for v_member in
    select distinct member.workspace_id, member.user_id
    from private.educational_workspace_members member
    join private.authoring_workspace_publications publication
      on publication.workspace_id = member.workspace_id
     and publication.target = 'private'
  loop
    perform private.grant_workspace_publications_to_member_v1(
      v_member.workspace_id, v_member.user_id
    );
  end loop;
end;
$seed_workspace_publication_access$;

create or replace function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security invoker
set search_path = pg_catalog, public
as $function$
  select jsonb_build_object(
    'schemaRevision', '20260801213000',
    'contractVersion', 4,
    'features', jsonb_build_array(
      'lean-shared-catalog', 'artifact-offline-replica', 'granular-sync',
      'private-authoring', 'text-language-metadata',
      'storage-artifact-control-plane', 'pre-registered-publication-artifacts',
      'single-current-course-revision', 'storage-only-course-content',
      'canonical-resource-registry', 'atomic-resource-authoring',
      'atomic-card-assistance', 'composed-authoring-workspaces',
      'workspace-publication-bindings', 'unchanged-publication-short-circuit',
      'bounded-authoring-events', 'partial-private-publication',
      'microtheory-review-projection', 'workspace-cursor-pagination',
      'workspace-event-cursor-pagination',
      'workspace-microsequence-card-pagination',
      'global-catalog-course-search', 'catalog-review-submissions',
      'catalog-management', 'personal-library-course-removal',
      'course-revision-sync-compaction', 'automatic-sync-history-maintenance',
      'compact-authoring-brief', 'account-derived-authoring-capabilities',
      'oauth-only-authoring-mcp', 'default-catalog-collection',
      'confidential-gpt-action-oauth', 'gpt-action-oauth-linking',
      'gpt-action-oauth-relinking', 'gpt-action-oauth-stable-callback',
      'workspace-card-metadata', 'structured-authoring-errors',
      'current-state-central-v1', 'situated-personal-comments-v1',
      'educational-workspace-membership-v1',
      'educational-workspace-invitations-v1',
      'workspace-capability-enforcement-v1',
      'workspace-member-course-access-v1'
    )
  );
$function$;

revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest() to anon, authenticated;

commit;
