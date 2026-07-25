begin;

create or replace function public.decide_catalog_submission(
  p_submission_id uuid,
  p_decision text,
  p_collection_id uuid default null,
  p_official_contract_key text default null,
  p_note text default null
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private, auth
set statement_timeout = '90s'
as $$
declare
  v_editor_id uuid;
  v_source_id uuid;
  v_submission private.catalog_course_submissions%rowtype;
  v_source public.courses%rowtype;
  v_contract_key text := nullif(btrim(p_official_contract_key), '');
  v_note text := nullif(btrim(p_note), '');
  v_source_validation jsonb;
begin
  v_editor_id := private.require_catalog_submission_editor();
  if p_submission_id is null
     or p_decision is null
     or p_decision not in ('accept', 'reject') then
    raise exception 'Decisão editorial inválida.' using errcode = '22023';
  end if;

  select submission.source_course_id into v_source_id
  from private.catalog_course_submissions submission
  where submission.id = p_submission_id;
  if not found then
    raise exception 'Submissão editorial inexistente.' using errcode = 'P0002';
  end if;
  if v_source_id is not null then
    perform pg_advisory_xact_lock(hashtextextended(
      'catalog-submission-source:' || v_source_id::text, 0
    ));
  end if;

  select * into v_submission
  from private.catalog_course_submissions submission
  where submission.id = p_submission_id
  for update;

  if v_submission.status = 'accepted' and p_decision = 'accept' then
    if v_submission.accepted_collection_id is distinct from p_collection_id
       or (v_contract_key is not null and v_submission.official_contract_key is distinct from v_contract_key) then
      raise exception 'A submissão já foi aceita com outro destino.' using errcode = '23514';
    end if;
    return jsonb_build_object(
      'status', 'accepted', 'submissionId', v_submission.id,
      'courseId', v_submission.official_course_id,
      'contractKey', v_submission.official_contract_key, 'idempotent', true
    );
  end if;
  if v_submission.status = 'rejected' and p_decision = 'reject' then
    return jsonb_build_object(
      'status', 'rejected', 'submissionId', v_submission.id, 'idempotent', true
    );
  end if;
  if v_submission.status not in ('submitted', 'in_review') then
    raise exception 'A submissão não admite nova decisão.' using errcode = '23514';
  end if;

  if p_decision = 'reject' then
    if v_note is null or char_length(v_note) > 4000 then
      raise exception 'A rejeição exige justificativa.' using errcode = '22023';
    end if;
    update private.catalog_course_submissions submission
    set status = 'rejected', reviewer_user_id = v_editor_id,
        decision_note = v_note, decided_at = now(), updated_at = now()
    where submission.id = v_submission.id;
    return jsonb_build_object(
      'status', 'rejected', 'submissionId', v_submission.id, 'idempotent', false
    );
  end if;

  if p_collection_id is null
     or v_contract_key is null
     or char_length(v_contract_key) > 160
     or v_contract_key !~ '^[a-z0-9]+(-[a-z0-9]+)*$'
     or (v_note is not null and char_length(v_note) > 4000) then
    raise exception 'Destino editorial inválido.' using errcode = '22023';
  end if;
  perform pg_advisory_xact_lock(hashtextextended(
    'catalog-promotion-contract:' || v_contract_key, 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'catalog-promotion-official-position', 0
  ));
  perform pg_advisory_xact_lock(hashtextextended(
    'catalog-promotion-collection:' || p_collection_id::text, 0
  ));
  perform 1
  from public.catalog_collections collection
  where collection.id = p_collection_id
    and collection.is_published
    and collection.deleted_at is null
  for share;
  if not found then
    raise exception 'Coleção pública indisponível.' using errcode = '23514';
  end if;

  select * into v_source
  from public.courses course
  where course.id = v_submission.source_course_id
    and course.owner_id = v_submission.author_user_id
    and course.status = 'published'
    and course.deleted_at is null
  for update;
  if not found then
    update private.catalog_course_submissions submission
    set status = 'stale', stale_reason = 'source_removed', updated_at = now()
    where submission.id = v_submission.id;
    return jsonb_build_object(
      'status', 'stale', 'reason', 'source_removed',
      'submissionId', v_submission.id
    );
  end if;
  if v_source.content_hash is distinct from v_submission.source_content_hash then
    update private.catalog_course_submissions submission
    set status = 'stale', stale_reason = 'source_changed', updated_at = now()
    where submission.id = v_submission.id;
    return jsonb_build_object(
      'status', 'stale', 'reason', 'source_changed',
      'submissionId', v_submission.id
    );
  end if;
  v_source_validation := private.validate_catalog_submission_course(v_source.id);
  if not coalesce((v_source_validation->>'publishable')::boolean, false) then
    update private.catalog_course_submissions submission
    set status = 'stale', stale_reason = 'source_invalid', updated_at = now()
    where submission.id = v_submission.id;
    return jsonb_build_object(
      'status', 'stale', 'reason', 'source_invalid',
      'submissionId', v_submission.id
    );
  end if;
  if (v_source_validation->>'contentHash') is distinct from v_submission.source_content_hash then
    update private.catalog_course_submissions submission
    set status = 'stale', stale_reason = 'source_changed', updated_at = now()
    where submission.id = v_submission.id;
    return jsonb_build_object(
      'status', 'stale', 'reason', 'source_changed',
      'submissionId', v_submission.id
    );
  end if;
  if v_contract_key <> v_source.contract_key then
    raise exception 'A promoção preserva o identificador do curso privado.' using errcode = '22023';
  end if;
  if exists (
    select 1 from public.courses course
    where course.owner_id is null
      and course.contract_key = v_source.contract_key
      and course.id <> v_source.id
      and course.deleted_at is null
  ) then
    raise exception 'O identificador oficial já existe.' using errcode = '23505';
  end if;

  update public.courses course
  set owner_id = null,
      source_course_id = null,
      publication_seq = greatest(course.publication_seq, 1),
      content_hash = v_source_validation->>'contentHash',
      position = coalesce((
        select max(other.position) + 1
        from public.courses other
        where other.owner_id is null and other.deleted_at is null
      ), 0),
      updated_at = now()
  where course.id = v_source.id;

  -- A publicação da raiz aciona a classificação automática. A decisão editorial
  -- substitui essa classificação pelo destino escolhido, sem criar outro vínculo.
  delete from public.catalog_collection_courses item
  where item.course_id = v_source.id
    and item.deleted_at is null;

  insert into public.catalog_collection_courses(collection_id, course_id, position)
  values (
    p_collection_id, v_source.id,
    coalesce((
      select max(item.position) + 1
      from public.catalog_collection_courses item
      where item.collection_id = p_collection_id and item.deleted_at is null
    ), 0)
  );

  update private.catalog_course_submissions submission
  set status = 'accepted', reviewer_user_id = v_editor_id,
      decision_note = v_note, accepted_collection_id = p_collection_id,
      official_course_id = v_source.id,
      official_contract_key = v_source.contract_key,
      decided_at = now(), updated_at = now()
  where submission.id = v_submission.id;

  return jsonb_build_object(
    'status', 'accepted', 'submissionId', v_submission.id,
    'courseId', v_source.id, 'contractKey', v_source.contract_key,
    'collectionId', p_collection_id, 'idempotent', false
  );
end;
$$;

comment on function public.decide_catalog_submission(uuid, text, uuid, text, text) is
  'Aceita ou rejeita uma oferta; o aceite promove a árvore pessoal para a coleção escolhida na mesma transação.';

commit;
