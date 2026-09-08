begin;
-- A revisão mudou por CAS de leitura; não é serialização nativa do PostgreSQL.
-- Preserva mensagem, autorização, assinatura e a guarda de conteúdo revisado.
do $conflict$
declare definition text; patched text;
begin
  definition:=pg_get_functiondef('public.get_course_explanation_citations_v1(uuid,bigint,text)'::regprocedure);
  patched:=replace(definition,
    'raise exception ''O Curso mudou durante a leitura de citações.'' using errcode=''40001'';',
    'raise exception ''O Curso mudou durante a leitura de citações.'' using errcode=''PT409'';');
  if patched=definition then raise exception 'Guarda de revisão das citações não encontrada.'; end if;
  execute patched;
end $conflict$;

do $manifest$
declare manifest jsonb;
begin
  manifest:=public.get_aralearn_runtime_manifest()||jsonb_build_object('schemaRevision','20260908020737');
  execute format('create or replace function public.get_aralearn_runtime_manifest() returns jsonb language sql stable security definer set search_path=pg_catalog as %L','select '||quote_literal(manifest::text)||'::jsonb');
end $manifest$;
commit;
