begin;
-- A função composite escalar produz uma linha nula no FROM quando não há atribuição.
-- Não fabricar alvo/versão: a ausência é representada por items: [].
do $sources$
declare definition text; patched text;
begin
  definition:=pg_get_functiondef('public.get_owned_course_sources_for_actor_v1(uuid,uuid,bigint,text,text,text,text,text,integer)'::regprocedure);
  patched:=replace(definition,E'    ) attribution;\n  end if;',E'    ) attribution\n    where attribution.id is not null;\n  end if;');
  if patched=definition then raise exception 'Trecho esperado da leitura de Fontes ausente.'; end if;
  execute patched;
end $sources$;

-- Corrige somente as mensagens UTF-8 do overload manual já aplicado.
do $messages$
declare definition text;
begin
  definition:=pg_get_functiondef('public.commit_course_composition_for_actor_v1(uuid,uuid,bigint,bigint,jsonb,jsonb,jsonb,text,text,text,bigint,jsonb)'::regprocedure);
  definition:=replace(definition,'    raise exception ''A ediÃ§Ã£o manual exige somente a ExplicaÃ§Ã£o da microssequÃªncia inspecionada.'' using errcode=''22023'';','    raise exception ''A edição manual exige somente a Explicação da microssequência inspecionada.'' using errcode=''22023'';');
  definition:=replace(definition,'      raise exception ''requestId reutilizado com origem ou microssequÃªncia incompatÃ­vel.'' using errcode=''23514'';','      raise exception ''requestId reutilizado com origem ou microssequência incompatível.'' using errcode=''23514'';');
  definition:=replace(definition,'    -- O nÃºcleo confere hash, curso e operaÃ§Ã£o antes de devolver o resultado original.','    -- O núcleo confere hash, curso e operação antes de devolver o resultado original.');
  definition:=replace(definition,'  if not found then raise exception ''MicrossequÃªncia inexistente.'' using errcode=''PT404''; end if;','  if not found then raise exception ''Microssequência inexistente.'' using errcode=''PT404''; end if;');
  definition:=replace(definition,'    raise exception ''A microssequÃªncia mudou; releia antes de salvar.'' using errcode=''PT409''; end if;','    raise exception ''A microssequência mudou; releia antes de salvar.'' using errcode=''PT409''; end if;');
  definition:=replace(definition,'    raise exception ''A ediÃ§Ã£o da ExplicaÃ§Ã£o deve conservar os demais campos da microssequÃªncia.'' using errcode=''22023''; end if;','    raise exception ''A edição da Explicação deve conservar os demais campos da microssequência.'' using errcode=''22023''; end if;');
  definition:=replace(definition,'    raise exception ''A ediÃ§Ã£o da ExplicaÃ§Ã£o deve conservar os vÃ­nculos atuais; revise fontes no painel Fontes.'' using errcode=''22023''; end if;','    raise exception ''A edição da Explicação deve conservar os vínculos atuais; revise fontes no painel Fontes.'' using errcode=''22023''; end if;');
  execute definition;
end $messages$;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260908003749');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
