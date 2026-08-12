begin;

create table private.package_library_cutover_audit (
  course_id uuid primary key references public.courses(id) on delete restrict,
  contract_key text not null unique,
  previous_revision_hash text not null,
  package_revision_hash text not null,
  applied_at timestamptz not null default now(),
  constraint package_library_cutover_audit_hashes check (
    previous_revision_hash ~ '^[0-9a-f]{64}$'
    and package_revision_hash ~ '^[0-9a-f]{64}$'
    and previous_revision_hash <> package_revision_hash
  )
);

do $cutover_catalog_package_artifacts$
declare
  v_item record;
  v_course public.courses%rowtype;
begin
  for v_item in
    select * from (values
      (
        'course-microsoft-azure-ai-fundamentals-ai900',
        'b8c8f262-7625-58bd-9b0a-a729e9f19bab'::uuid,
        '0c0ad7756935ecc2c508b2b41a600af0e0873ed3d92c0d7f6c8bea0f0b4aea6e',
        '44c747f62da0d02691bab70aae53a763f18987e139f1d165f7df2ff9275480e3'
      ),
      (
        'course-dataprev-2026-analista-processamento-seguranca-informacao',
        'f9bdbc51-d579-5ca3-b2b3-3b1812207d57'::uuid,
        '445f0f89bcc1f19de4b5b5cc63931ceab3d61074c6c5d3f9e29c179a35384c06',
        '855d7a3f70b52dbae111f82faca331ead8bfe9b6851067fcbabd947a16dec7c7'
      ),
      (
        'course-fundamentos-ia-analise-dados',
        '39c5f199-8713-51cd-8071-8a241f2e00c8'::uuid,
        '429f63b2fd7555f388e119e94d9d80c77fb8faaf6a1d4752a617455c1b849f18',
        '2b58208ade545378b9a81c417f735178fd6efd228af62a45ccb241b3697ee10d'
      )
    ) as expected(contract_key, course_id, previous_hash, package_hash)
  loop
    select * into v_course
    from public.courses course
    where course.id = v_item.course_id
      and course.contract_key = v_item.contract_key
    for update;

    if not found
       or v_course.current_revision_hash is distinct from v_item.previous_hash
       or v_course.revision_artifact_hash is distinct from v_item.previous_hash
       or v_course.content_hash is distinct from v_item.previous_hash then
      raise exception 'CAS do corte por packages falhou para %.', v_item.contract_key
        using errcode = '40001';
    end if;

    if not exists (
      select 1 from private.artifact_refs artifact
      where artifact.hash = v_item.package_hash
    ) then
      raise exception 'Artefato por packages ausente para %.', v_item.contract_key
        using errcode = '23503';
    end if;

    insert into private.package_library_cutover_audit(
      course_id, contract_key, previous_revision_hash, package_revision_hash
    ) values (
      v_item.course_id, v_item.contract_key, v_item.previous_hash, v_item.package_hash
    );

    update private.course_revisions revision
    set revision_hash = v_item.package_hash,
        artifact_hash = v_item.package_hash,
        base_revision_hash = null,
        validation_status = 'validated',
        validated_at = now(),
        published_at = now()
    where revision.course_id = v_item.course_id
      and revision.revision_hash = v_item.previous_hash
      and revision.artifact_hash = v_item.previous_hash;

    if not found then
      raise exception 'Revisão corrente ausente para %.', v_item.contract_key
        using errcode = '23503';
    end if;

    update public.courses course
    set current_revision_hash = v_item.package_hash,
        revision_artifact_hash = v_item.package_hash,
        content_hash = v_item.package_hash,
        publication_seq = course.publication_seq + 1,
        updated_at = now()
    where course.id = v_item.course_id;
  end loop;

  if (select count(*) from private.package_library_cutover_audit) <> 3 then
    raise exception 'Relatório do corte por packages está incompleto.'
      using errcode = '55000';
  end if;
end;
$cutover_catalog_package_artifacts$;

revoke all on table private.package_library_cutover_audit
  from public, anon, authenticated, service_role;

alter function public.get_aralearn_runtime_manifest()
  rename to get_aralearn_runtime_manifest_before_catalog_package_cutover_v1;

create function public.get_aralearn_runtime_manifest()
returns jsonb
language sql
stable
security definer
set search_path = pg_catalog
as $function$
  select jsonb_set(
    public.get_aralearn_runtime_manifest_before_catalog_package_cutover_v1(),
    '{schemaRevision}',
    '"20260812130000"'::jsonb
  ) || jsonb_build_object(
    'features',
    public.get_aralearn_runtime_manifest_before_catalog_package_cutover_v1()->'features'
      || '["catalog-package-artifact-cutover-v1"]'::jsonb
  )
$function$;

revoke all on function
  public.get_aralearn_runtime_manifest_before_catalog_package_cutover_v1()
  from public, anon, authenticated;
revoke all on function public.get_aralearn_runtime_manifest() from public;
grant execute on function public.get_aralearn_runtime_manifest()
  to anon, authenticated;

commit;
