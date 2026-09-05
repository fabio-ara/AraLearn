-- Preparação anterior à 094109 no rollout ordenado. O writer antigo validava
-- os campos, mas uma precedência de || e -> descartava somente o discriminador.
-- Não interpreta novamente a configuração nem muda appliedAt ou seus valores.
begin;
set local lock_timeout='5s';
set local statement_timeout='5min';
select pg_advisory_xact_lock(hashtextextended('aralearn:preserve-applied-design',0));
lock table private.course_entities in share row exclusive mode;
do $normalize$
declare revision text:=public.get_aralearn_runtime_manifest()->>'schemaRevision';
begin
  -- A 094109 já havia sido ensaiada no banco local, sem snapshots persistidos.
  -- Essa única entrada fora de ordem não pode mascarar dados a recuperar.
  if revision='20260905094109' then
    if exists(select 1 from private.course_entities
      where design_snapshot is not null or design_application is not null) then
      raise exception 'O ensaio fora de ordem exige reconciliação dos dados antes de prosseguir.' using errcode='55000';
    end if;
    return;
  end if;
  if revision is distinct from '20260905092640' then
    raise exception 'A revisão anterior à preparação divergiu.' using errcode='55000';
  end if;
  if exists(select 1 from private.course_entities where design_application is not null
    and (jsonb_typeof(design_application)<>'object' or design_application ? 'contract'
      and design_application->>'contract' is distinct from 'aralearn.study-unit-design-application.v1')) then
    raise exception 'Há aplicação com contrato desconhecido; preserve-a para investigação.' using errcode='55000';
  end if;
  if exists(select 1 from private.course_entities where design_application is not null
    and not (design_application ? 'contract') and (
      jsonb_typeof(design_application)='object'
      and design_application ?& array['mode','introducedInstructionalAnalysisUnitIds',
        'explanationApplications','practiceApplications','componentRefs']
      and design_application-array['mode','introducedInstructionalAnalysisUnitIds',
        'usedInstructionalAnalysisUnitIds','curriculumScopeItemIds',
        'explanationApplications','practiceApplications','componentRefs']='{}'::jsonb
      and design_application->>'mode' in('expository','practice','mixed')
      and not exists(select 1 from jsonb_each(design_application) field
        where field.key<>'mode' and jsonb_typeof(field.value)<>'array')
      and jsonb_typeof(design_snapshot)='object'
      and design_snapshot->>'contract'='aralearn.study-unit-design-snapshot.v2'
      and octet_length((jsonb_build_object('contract','aralearn.study-unit-design-application.v1')||design_application)::text)<=65536
    ) is not true
  ) then
    raise exception 'Há aplicação sem discriminador cuja forma não corresponde ao writer anterior.' using errcode='55000';
  end if;
  update private.course_entities
    set design_application=jsonb_build_object('contract','aralearn.study-unit-design-application.v1')||design_application
    where design_application is not null and not (design_application ? 'contract');
end $normalize$;
commit;
