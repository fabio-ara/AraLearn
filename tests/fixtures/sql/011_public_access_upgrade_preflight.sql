-- Falha fechada do bloco real da migration; executar somente na fixture pré-upgrade.
begin;
create extension if not exists pgtap with schema extensions;
set local search_path=public,extensions;
select plan(2);
update public.courses set owner_id='92000000-0000-4000-8000-000000000001' where id='92000000-0000-4000-8000-000000000102';
select throws_ok($check$do $migration$
begin
  if exists(select 1 from private.course_personal_copies origin
    left join public.courses target on target.id=origin.target_course_id
    where target.id is null or target.owner_id<>origin.actor_id
      or origin.target_course_id=origin.source_course_ref) then
    raise exception 'Origem de cópia incompatível; reconciliação necessária antes do corte.' using errcode='23514';
  end if;
  update public.courses target set copy_origin=jsonb_build_object(
    'contract','aralearn.course-copy-origin.v1',
    'sourceCourseId',origin.source_course_ref,'sourceCourseRevision',origin.source_course_revision,
    'studyUnitId',origin.study_unit_id,'creationHash',origin.creation_hash,
    'initialCourseRevision',origin.initial_course_revision,
    'initialStudyUnitVersion',origin.initial_study_unit_version,
    'applicationOrigin',origin.application_origin,'confirmedAt',origin.initial_updated_at,
    'createdAt',origin.created_at)
  from private.course_personal_copies origin where target.id=origin.target_course_id;
  if exists(select 1 from private.course_personal_copies origin
    join public.courses target on target.id=origin.target_course_id
    where target.copy_origin->>'creationHash' is distinct from origin.creation_hash
       or (target.copy_origin->>'sourceCourseId')::uuid is distinct from origin.source_course_ref) then
    raise exception 'Origem de cópia não preservada.' using errcode='23514';
  end if;
end
$migration$;$check$,'23514','Origem de cópia incompatível; reconciliação necessária antes do corte.','dono incompatível bloqueia antes do drop');
update public.courses set owner_id='92000000-0000-4000-8000-000000000002' where id='92000000-0000-4000-8000-000000000102';
update private.course_personal_copies set source_course_ref=target_course_id where target_course_id='92000000-0000-4000-8000-000000000102';
select throws_ok($check$do $migration$
begin
  if exists(select 1 from private.course_personal_copies origin
    left join public.courses target on target.id=origin.target_course_id
    where target.id is null or target.owner_id<>origin.actor_id
      or origin.target_course_id=origin.source_course_ref) then
    raise exception 'Origem de cópia incompatível; reconciliação necessária antes do corte.' using errcode='23514';
  end if;
  update public.courses target set copy_origin=jsonb_build_object(
    'contract','aralearn.course-copy-origin.v1',
    'sourceCourseId',origin.source_course_ref,'sourceCourseRevision',origin.source_course_revision,
    'studyUnitId',origin.study_unit_id,'creationHash',origin.creation_hash,
    'initialCourseRevision',origin.initial_course_revision,
    'initialStudyUnitVersion',origin.initial_study_unit_version,
    'applicationOrigin',origin.application_origin,'confirmedAt',origin.initial_updated_at,
    'createdAt',origin.created_at)
  from private.course_personal_copies origin where target.id=origin.target_course_id;
  if exists(select 1 from private.course_personal_copies origin
    join public.courses target on target.id=origin.target_course_id
    where target.copy_origin->>'creationHash' is distinct from origin.creation_hash
       or (target.copy_origin->>'sourceCourseId')::uuid is distinct from origin.source_course_ref) then
    raise exception 'Origem de cópia não preservada.' using errcode='23514';
  end if;
end
$migration$;$check$,'23514','Origem de cópia incompatível; reconciliação necessária antes do corte.','origem igual ao alvo bloqueia antes do drop');
select * from finish();
rollback;
