begin;

-- O patch de revisão transporta linhas relacionais para permitir a reconstrução
-- da microssequência inteira. `after_text` é uma projeção física; no contrato
-- público, somente `after` pode modificá-lo. Sem este filtro, um null interno
-- de uma linha não alterada seria confundido com a ordem explícita de limpar o
-- campo obrigatório.
create or replace function private.apply_official_stage_row(
  p_store_name text,
  p_course_id uuid,
  p_entity_id uuid,
  p_payload jsonb
)
returns jsonb
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_table regclass := private.table_for_store(p_store_name);
  v_raw_payload jsonb := private.jsonb_to_snake(coalesce(p_payload, '{}'::jsonb));
  v_payload jsonb;
  v_current_course uuid;
  v_exists boolean;
  v_columns text;
  v_expressions text;
  v_returned jsonb;
begin
  if not public.is_app_admin()
     or v_table is null
     or not (p_store_name = any(private.official_import_store_names()))
     or p_course_id is null
     or p_entity_id is null then
    raise exception 'Materialização oficial não autorizada ou inválida.'
      using errcode = '42501';
  end if;

  if private.try_uuid(p_payload->>'id') is distinct from p_entity_id
     or private.try_uuid(p_payload->>'courseId') is distinct from p_course_id then
    raise exception 'Identidade canônica divergente na linha oficial.'
      using errcode = '23514';
  end if;

  execute format('select true, course_id from %s where id = $1', v_table)
    into v_exists, v_current_course using p_entity_id;
  if coalesce(v_exists, false) and v_current_course is distinct from p_course_id then
    raise exception 'Entidade oficial pertence a outro curso.' using errcode = '23514';
  end if;

  if coalesce(v_exists, false)
     and p_store_name = 'cards'
     and (
       not (coalesce(p_payload, '{}'::jsonb) ? 'after')
       or (
         p_payload->'after' = 'null'::jsonb
         and not coalesce((p_payload->>'hasAfter')::boolean, false)
       )
     ) then
    v_raw_payload := v_raw_payload - 'after';
  end if;

  v_payload := private.shape_store_payload(
    p_store_name,
    v_raw_payload,
    case when coalesce(v_exists, false) then 'update' else 'insert' end
  );
  v_payload := v_payload || jsonb_build_object('id', p_entity_id, 'course_id', p_course_id);
  v_payload := v_payload - array[
    'source_entity_id', 'revision', 'created_at', 'updated_at', 'deleted_at'
  ];
  if coalesce(v_exists, false) then
    v_payload := v_payload - array['id', 'course_id'];
  end if;

  select
    string_agg(format('%I', attribute.attname), ',' order by attribute.attnum),
    string_agg(format('populated.%I', attribute.attname), ',' order by attribute.attnum)
  into v_columns, v_expressions
  from pg_attribute attribute
  where attribute.attrelid = v_table
    and attribute.attnum > 0
    and not attribute.attisdropped
    and v_payload ? attribute.attname;

  if v_columns is null then
    raise exception 'Linha oficial sem campos persistíveis.' using errcode = '22023';
  end if;

  if coalesce(v_exists, false) then
    execute format(
      'update %s target set (%s) = (select %s from jsonb_populate_record(target, $1) populated) '
      'where target.id = $2 returning to_jsonb(target)',
      v_table, v_columns, v_expressions
    ) into v_returned using v_payload, p_entity_id;
  else
    execute format(
      'insert into %s as inserted (%s) select %s from jsonb_populate_record(null::%s, $1) populated '
      'returning to_jsonb(inserted)',
      v_table, v_columns, v_expressions, v_table
    ) into v_returned using v_payload;
  end if;

  return v_returned;
end;
$$;

revoke execute on function private.apply_official_stage_row(text, uuid, uuid, jsonb)
  from public, anon, authenticated;

commit;
