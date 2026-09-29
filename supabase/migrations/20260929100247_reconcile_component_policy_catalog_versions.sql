-- Reconcilia a identidade do catálogo sem reescrever escolhas ou autoria.
-- As duas revisões anteriores mantêm as mesmas opções do catálogo corrente.
begin;
set local lock_timeout='5s';
set local statement_timeout='5min';
select pg_advisory_xact_lock(hashtextextended('aralearn:package-contract-catalog',0));
lock table private.course_component_policy_assignments in access exclusive mode;

do $preflight$
begin
  if (public.get_aralearn_runtime_manifest()->>'schemaRevision'
      in ('20260929082030','20260929100247')) is not true
    or private.course_component_catalog_v1()->>'version' is distinct from '1-fca7730b'
    or private.course_component_catalog_v1()->>'schemaFingerprint' is distinct from
      'sha256:e97467a8e1a1fb436f743a1d9fae39e686b1537211e68d66ab61f6c339223475' then
    raise exception 'A revisão anterior do runtime ou catálogo divergiu.' using errcode='55000';
  end if;
  if exists(select 1 from private.course_component_policy_assignments
    where (policy->>'catalogVersion' in ('1-ab1319c0','1-96666628','1-fca7730b')) is not true
      or private.valid_course_component_policy_v1(jsonb_set(
        policy,'{catalogVersion}',private.course_component_catalog_v1()->'version',false)) is not true) then
    raise exception 'A política não admite reconciliação exclusiva da versão do catálogo.' using errcode='55000';
  end if;
end $preflight$;

create temporary table component_policy_catalog_before on commit drop as
  select to_jsonb(assignment)#-'{policy,catalogVersion}' value
  from private.course_component_policy_assignments assignment;

-- O CHECK permanece ativo: cada nova linha precisa satisfazer o validador real.
update private.course_component_policy_assignments
set policy=jsonb_set(policy,'{catalogVersion}',private.course_component_catalog_v1()->'version',false)
where policy->>'catalogVersion' is distinct from private.course_component_catalog_v1()->>'version';

do $preservation$
begin
  if (select count(*) from component_policy_catalog_before)
      <> (select count(*) from private.course_component_policy_assignments)
    or exists(
      (select value from component_policy_catalog_before except all
        select to_jsonb(assignment)#-'{policy,catalogVersion}' from private.course_component_policy_assignments assignment)
      union all
      (select to_jsonb(assignment)#-'{policy,catalogVersion}' from private.course_component_policy_assignments assignment
        except all select value from component_policy_catalog_before)
    ) then
    raise exception 'A reconciliação não pode alterar escolhas, autoria, escopos ou datas das políticas.' using errcode='55000';
  end if;
  if exists(select 1 from private.course_component_policy_assignments
    where private.valid_course_component_policy_v1(policy) is not true) then
    raise exception 'A reconciliação deixou política inválida.' using errcode='55000';
  end if;
end $preservation$;

do $manifest$
declare manifest jsonb:=public.get_aralearn_runtime_manifest();
begin
  if manifest->>'schemaRevision' is distinct from '20260929100247' then
    manifest:=manifest||jsonb_build_object('schemaRevision','20260929100247');
    execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L',
      'select '||quote_literal(manifest::text)||'::jsonb');
  end if;
end $manifest$;
commit;
