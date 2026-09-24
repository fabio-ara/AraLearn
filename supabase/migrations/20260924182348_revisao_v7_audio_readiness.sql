begin;

create function private.require_course_audio_ready_v7(p_course_id uuid,p_content jsonb)
returns void language plpgsql stable security definer set search_path=pg_catalog as $function$
declare component jsonb; track jsonb; position integer;
begin
  for component in select value from jsonb_path_query(p_content,
    'strict $.** ? (@.type() == "object" && @.package == "aralearn.resource.audio")') components(value) loop
    position:=0;
    for track in select value from jsonb_array_elements(component#>'{data,tracks}') loop
      position:=position+1;
      if track->>'kind' is distinct from 'file' then
        raise exception 'A faixa % precisa de gravação antes de publicar ou compartilhar. Gere ou forneça o arquivo e guarde-o no curso.',position
          using errcode='PT422';
      end if;
      if not exists(select 1 from private.course_media m join storage.objects o
        on o.bucket_id='course-media' and o.name=m.storage_path
        where m.course_id=p_course_id and m.status='active' and m.content_hash=track#>>'{media,contentHash}'
          and to_jsonb(m.byte_size)=track#>'{media,byteSize}' and m.media_type=track#>>'{media,mediaType}') then
        raise exception 'O arquivo da faixa % não está disponível neste curso. Guarde a gravação antes de publicar ou compartilhar.',position
          using errcode='PT422';
      end if;
    end loop;
  end loop;
end $function$;

create function private.guard_course_audio_publication_v7() returns trigger
language plpgsql security definer set search_path=pg_catalog as $function$
declare entity record;
begin
  if new.visibility='public' then
    for entity in select content from private.course_entities where course_id=new.id and entity_type in('study_unit','microsequence') loop
      perform private.require_course_audio_ready_v7(new.id,entity.content);
      if new.public_file_access<>'available' and jsonb_path_exists(entity.content,
        'strict $.** ? (@.type() == "object" && @.package == "aralearn.resource.audio")') then
        raise exception 'O áudio necessário ao estudo não está liberado para o público. Defina a política de acesso aos arquivos antes de publicar.' using errcode='PT422';
      end if;
    end loop;
  end if;
  return new;
end $function$;
create trigger course_audio_publication_v7 before insert or update of visibility,public_file_access on public.courses
  for each row execute function private.guard_course_audio_publication_v7();

create function private.guard_course_audio_delivery_v7() returns trigger
language plpgsql security definer set search_path=pg_catalog as $function$
begin
  if tg_table_name='course_access' then
    perform private.require_course_audio_ready_v7(new.course_id,e.content) from private.course_entities e
      where e.course_id=new.course_id and e.entity_type in('study_unit','microsequence');
  elsif new.entity_type in('study_unit','microsequence') and
    (exists(select 1 from public.courses c where c.id=new.course_id and c.visibility='public')
      or exists(select 1 from public.course_access a where a.course_id=new.course_id)) then
    perform private.require_course_audio_ready_v7(new.course_id,new.content);
    if jsonb_path_exists(new.content,'strict $.** ? (@.type() == "object" && @.package == "aralearn.resource.audio")')
      and exists(select 1 from public.courses c where c.id=new.course_id and c.visibility='public' and c.public_file_access<>'available') then
      raise exception 'A política pública de arquivos ainda não permite escutar este áudio.' using errcode='PT422';
    end if;
  end if;
  return new;
end $function$;
create trigger course_audio_content_delivery_v7 before insert or update of content on private.course_entities
  for each row execute function private.guard_course_audio_delivery_v7();
create trigger course_audio_access_delivery_v7 before insert on public.course_access
  for each row execute function private.guard_course_audio_delivery_v7();

-- A retirada isolada de uma gravação conserva o estudo. A exclusão autorizada
-- do curso inteiro usa outro comando, que também aposenta seus arquivos antes
-- da limpeza de Storage; um trigger genérico impediria esse ciclo de vida.
do $protect_recording_removal$
declare definition text;
  anchor text := 'update private.course_media set status=''removed'',updated_at=statement_timestamp() where course_id=p_course_id and content_hash=v_media.content_hash returning * into v_media;';
  protection text := $guard$
  if exists(
    select 1 from private.course_entities e where e.course_id=p_course_id
      and e.entity_type in('study_unit','microsequence') and jsonb_path_exists(e.content,
        'strict $.** ? (@.type() == "object" && @.package == "aralearn.resource.audio").data.tracks[*] ? (@.kind == "file" && @.media.contentHash == $hash)',
        jsonb_build_object('hash',v_media.content_hash))) then
    raise exception 'Esta gravação ainda compõe o estudo. Substitua ou retire suas faixas antes de remover o arquivo.' using errcode='PT409';
  end if;
$guard$;
begin
  select pg_get_functiondef('public.execute_course_media_for_actor_v1(uuid,uuid,bigint,jsonb,text)'::regprocedure) into definition;
  if length(definition)-length(replace(definition,anchor,'')) <> length(anchor) then
    raise exception 'Comando de retirada de áudio não reconhecido para aplicar a proteção v7.';
  end if;
  execute replace(definition,anchor,protection||anchor);
end $protect_recording_removal$;

revoke all on function private.require_course_audio_ready_v7(uuid,jsonb),private.guard_course_audio_publication_v7(),
  private.guard_course_audio_delivery_v7() from public,anon,authenticated,service_role;

commit;
