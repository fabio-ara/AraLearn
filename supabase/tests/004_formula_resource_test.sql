begin;

create extension if not exists pgtap with schema extensions;
set search_path=public,extensions,pg_catalog;
select no_plan();

select ok(exists(
  select 1
  from pg_type type
  join pg_namespace namespace on namespace.oid=type.typnamespace
  join pg_enum value on value.enumtypid=type.oid
  where namespace.nspname='public' and type.typname='card_resource'
    and value.enumlabel='formula'
),'card_resource inclui formula');

select has_column('public','card_blocks','notation',
  'bloco de fórmula guarda o domínio de notação em coluna própria');
select has_column('public','card_blocks','accessible_text',
  'bloco de fórmula guarda a leitura acessível em coluna própria');
select has_column('public','block_nodes','formula_value',
  'nó terminal guarda seu valor Unicode em coluna própria');
select has_column('public','block_nodes','fence_open',
  'nó delimitado guarda o símbolo de abertura em coluna própria');
select has_column('public','block_nodes','fence_close',
  'nó delimitado guarda o símbolo de fechamento em coluna própria');
select is((
  select count(*)
  from information_schema.columns
  where table_schema='public'
    and table_name in ('card_blocks','block_nodes')
    and column_name in ('notation','accessible_text','formula_value','fence_open','fence_close')
    and data_type='jsonb'
),0::bigint,'a fórmula não é armazenada em JSONB');

select ok(exists(
  select 1 from pg_constraint constraint_row
  join pg_class relation on relation.oid=constraint_row.conrelid
  join pg_namespace namespace on namespace.oid=relation.relnamespace
  where namespace.nspname='public' and relation.relname='cards'
    and constraint_row.conname='cards_formula_exercise'
    and constraint_row.contype='c' and constraint_row.convalidated
),'cards_formula_exercise está instalada e validada');
select ok(exists(
  select 1 from pg_constraint constraint_row
  join pg_class relation on relation.oid=constraint_row.conrelid
  join pg_namespace namespace on namespace.oid=relation.relnamespace
  where namespace.nspname='public' and relation.relname='card_blocks'
    and constraint_row.conname='card_blocks_formula_shape'
    and constraint_row.contype='c' and constraint_row.convalidated
),'card_blocks_formula_shape está instalada e validada');
select ok(exists(
  select 1 from pg_constraint constraint_row
  join pg_class relation on relation.oid=constraint_row.conrelid
  join pg_namespace namespace on namespace.oid=relation.relnamespace
  where namespace.nspname='public' and relation.relname='block_nodes'
    and constraint_row.conname='block_nodes_formula_shape'
    and constraint_row.contype='c' and constraint_row.convalidated
),'block_nodes_formula_shape está instalada e validada');
select ok(position('formula' in pg_get_constraintdef(
  (select oid from pg_constraint where conname='block_nodes_scope'
    and conrelid='public.block_nodes'::regclass)
))>0,'o escopo relacional reconhece nós de fórmula');
select ok(position('subsup' in pg_get_constraintdef(
  (select oid from pg_constraint where conname='block_nodes_kind'
    and conrelid='public.block_nodes'::regclass)
))>0,'a lista de nós inclui os operadores estruturais da AST');
select ok(exists(
  select 1
  from pg_index index_row
  join pg_class index_relation on index_relation.oid=index_row.indexrelid
  where index_relation.relname='block_nodes_formula_root_uidx'
    and index_row.indrelid='public.block_nodes'::regclass
    and index_row.indisunique
    and position('formula' in pg_get_expr(index_row.indpred,index_row.indrelid))>0
    and position('parent_node_id is null' in lower(
      pg_get_expr(index_row.indpred,index_row.indrelid)
    ))>0
),'cada bloco de fórmula admite no máximo uma raiz');

select has_function('private','assert_formula_block_ast',array['uuid'],
  'validador privado da AST existe');
select has_function('private','enforce_formula_block_ast',array[]::text[],
  'função privada do gatilho existe');
select ok((select procedure.prosecdef
  from pg_proc procedure
  where procedure.oid='private.assert_formula_block_ast(uuid)'::regprocedure),
  'validador da AST usa SECURITY DEFINER');
select ok((select procedure.prosecdef
  from pg_proc procedure
  where procedure.oid='private.enforce_formula_block_ast()'::regprocedure),
  'gatilho da AST usa SECURITY DEFINER');
select ok(position('search_path=pg_catalog, public, private' in coalesce((
  select array_to_string(procedure.proconfig,',')
  from pg_proc procedure
  where procedure.oid='private.assert_formula_block_ast(uuid)'::regprocedure
),''))>0,'validador da AST fixa o search_path');
select ok(position('search_path=pg_catalog, public, private' in coalesce((
  select array_to_string(procedure.proconfig,',')
  from pg_proc procedure
  where procedure.oid='private.enforce_formula_block_ast()'::regprocedure
),''))>0,'gatilho da AST fixa o search_path');

select ok(not has_function_privilege('anon',
  'private.assert_formula_block_ast(uuid)','EXECUTE'),
  'anon não executa o validador privado');
select ok(not has_function_privilege('authenticated',
  'private.assert_formula_block_ast(uuid)','EXECUTE'),
  'authenticated não executa o validador privado');
select ok(not has_function_privilege('service_role',
  'private.assert_formula_block_ast(uuid)','EXECUTE'),
  'service_role não chama o validador fora do fluxo controlado');
select ok(not has_function_privilege('anon',
  'private.enforce_formula_block_ast()','EXECUTE'),
  'anon não executa a função do gatilho');
select ok(not has_function_privilege('authenticated',
  'private.enforce_formula_block_ast()','EXECUTE'),
  'authenticated não executa a função do gatilho');
select ok(not has_function_privilege('service_role',
  'private.enforce_formula_block_ast()','EXECUTE'),
  'service_role não executa diretamente a função do gatilho');

select ok(exists(
  select 1 from pg_trigger trigger_row
  where trigger_row.tgrelid='public.block_nodes'::regclass
    and trigger_row.tgname='block_nodes_formula_ast_guard'
    and not trigger_row.tgisinternal
    and trigger_row.tgdeferrable and trigger_row.tginitdeferred
),'a árvore é conferida ao fim da transação de nós');
select ok(exists(
  select 1 from pg_trigger trigger_row
  where trigger_row.tgrelid='public.card_blocks'::regclass
    and trigger_row.tgname='card_blocks_formula_ast_guard'
    and not trigger_row.tgisinternal
    and trigger_row.tgdeferrable and trigger_row.tginitdeferred
),'o bloco também é conferido ao fim da transação');

savepoint formula_rows;
set constraints all deferred;

insert into public.courses(
  id,status,contract_key,title,goal,publication_seq,position
) values (
  'f4000000-0000-4000-8000-000000000001','draft','formula-pgtap',
  'Fórmulas para teste','Conferir a persistência granular de expressões.',0,0
);
insert into public.modules(id,course_id,contract_key,position,title) values (
  'f4000000-0000-4000-8000-000000000010',
  'f4000000-0000-4000-8000-000000000001','modulo-formula',0,'Fórmulas'
);
insert into public.lessons(id,course_id,module_id,contract_key,position,title) values (
  'f4000000-0000-4000-8000-000000000020',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000010','licao-formula',0,'Representação'
);
insert into public.microsequences(
  id,course_id,lesson_id,contract_key,position,title,goal,role,status
) values (
  'f4000000-0000-4000-8000-000000000030',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000020','micro-formula',0,
  'Notação estruturada','Interpretar uma expressão sem marcação executável.','explain','ready'
);

insert into public.cards(
  id,course_id,lesson_id,microsequence_id,contract_key,position,
  resource,kind,exercise,title
) values (
  'f4000000-0000-4000-8000-000000000040',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000020',
  'f4000000-0000-4000-8000-000000000030','card-formula-teoria',1,
  'formula','theory','none','Fração e soma'
),(
  'f4000000-0000-4000-8000-000000000041',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000020',
  'f4000000-0000-4000-8000-000000000030','card-formula-escolha',2,
  'formula','exercise','choice','Interpretação'
),(
  'f4000000-0000-4000-8000-000000000042',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000020',
  'f4000000-0000-4000-8000-000000000030','card-paragrafo',3,
  'paragraph','theory','none','Texto de controle'
);

insert into public.card_blocks(
  id,course_id,card_id,contract_key,position,role,block_type,
  prompt,has_prompt,notation,accessible_text,question,has_question,
  answer_contract_key,has_answer,is_primary
) values (
  'f4000000-0000-4000-8000-000000000050',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000040','bloco-formula-teoria',0,
  'primary','formula','Observe a expressão.',true,'mathematics',
  'x mais um dividido por dois.',null,false,null,false,true
),(
  'f4000000-0000-4000-8000-000000000051',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000041','bloco-formula-escolha',0,
  'primary','formula','Observe o símbolo.',true,'chemistry',
  'H com índice inferior dois.',
  'Qual leitura corresponde à fórmula?',true,'opcao-correta',true,true
);
insert into public.card_blocks(
  id,course_id,card_id,contract_key,position,role,block_type,
  value_text,value,has_value,is_primary
) values (
  'f4000000-0000-4000-8000-000000000052',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000042','bloco-paragrafo',0,
  'primary','paragraph','Texto sem AST.','Texto sem AST.',true,true
);

insert into public.block_options(
  id,course_id,block_id,contract_key,position,option_kind,text_value,text,is_correct
) values (
  'f4000000-0000-4000-8000-000000000060',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000051','opcao-correta',0,
  'text','H dois.','H dois.',true
),(
  'f4000000-0000-4000-8000-000000000061',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000051','opcao-incorreta',1,
  'text','H elevado a dois.','H elevado a dois.',false
);

insert into public.block_nodes(
  id,course_id,block_id,parent_node_id,contract_key,position,
  node_scope,node_kind,formula_value
) values (
  'f4000000-0000-4000-8000-000000000070',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000050',null,'raiz',0,'formula','row',null
),(
  'f4000000-0000-4000-8000-000000000071',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000050',
  'f4000000-0000-4000-8000-000000000070','variavel-x',0,
  'formula','identifier','x'
),(
  'f4000000-0000-4000-8000-000000000072',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000050',
  'f4000000-0000-4000-8000-000000000070','operador-mais',1,
  'formula','operator','+'
),(
  'f4000000-0000-4000-8000-000000000073',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000050',
  'f4000000-0000-4000-8000-000000000070','fracao',2,
  'formula','fraction',null
),(
  'f4000000-0000-4000-8000-000000000074',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000050',
  'f4000000-0000-4000-8000-000000000073','numerador',0,
  'formula','number','1'
),(
  'f4000000-0000-4000-8000-000000000075',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000050',
  'f4000000-0000-4000-8000-000000000073','denominador',1,
  'formula','number','2'
),(
  'f4000000-0000-4000-8000-000000000076',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000051',null,'raiz-quimica',0,
  'formula','subscript',null
),(
  'f4000000-0000-4000-8000-000000000077',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000051',
  'f4000000-0000-4000-8000-000000000076','simbolo-h',0,
  'formula','identifier','H'
),(
  'f4000000-0000-4000-8000-000000000078',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000051',
  'f4000000-0000-4000-8000-000000000076','indice-dois',1,
  'formula','number','2'
);

set constraints all immediate;
select lives_ok(
  $$select private.assert_formula_block_ast('f4000000-0000-4000-8000-000000000050')$$,
  'uma AST matemática válida passa pela validação relacional'
);
select lives_ok(
  $$select private.assert_formula_block_ast('f4000000-0000-4000-8000-000000000051')$$,
  'uma AST química válida passa pela validação relacional'
);
select is((select count(*) from public.block_nodes
  where block_id='f4000000-0000-4000-8000-000000000050'),6::bigint,
  'a expressão permanece decomposta em seis linhas de nós');
select is((select exercise::text from public.cards
  where id='f4000000-0000-4000-8000-000000000041'),'choice',
  'fórmula interativa usa apenas escolha contextual');

create temporary table formula_test_marker(value boolean);

create function pg_temp.accepted_formula_gap()
returns text
language plpgsql
as $$
declare v_constraint text;
begin
  begin
    insert into public.cards(
      id,course_id,lesson_id,microsequence_id,contract_key,position,
      resource,kind,exercise,title
    ) values (
      gen_random_uuid(),'f4000000-0000-4000-8000-000000000001',
      'f4000000-0000-4000-8000-000000000020',
      'f4000000-0000-4000-8000-000000000030','formula-gap-invalida',99,
      'formula','exercise','gap','Combinação inválida'
    );
    delete from public.cards where contract_key='formula-gap-invalida';
    return 'aceita';
  exception when check_violation then
    get stacked diagnostics v_constraint=constraint_name;
    return v_constraint;
  end;
end;
$$;

create function pg_temp.formula_token_constraint(
  p_kind text,p_value text,p_open text default null,p_close text default null
)
returns text
language plpgsql
as $$
declare v_constraint text; v_id uuid:=gen_random_uuid();
begin
  begin
    insert into public.block_nodes(
      id,course_id,block_id,parent_node_id,contract_key,position,
      node_scope,node_kind,formula_value,fence_open,fence_close
    ) values (
      v_id,'f4000000-0000-4000-8000-000000000001',
      'f4000000-0000-4000-8000-000000000050',
      'f4000000-0000-4000-8000-000000000070',v_id::text,63,
      'formula',p_kind,p_value,p_open,p_close
    );
    delete from public.block_nodes where id=v_id;
    return 'aceita';
  exception when check_violation then
    get stacked diagnostics v_constraint=constraint_name;
    return v_constraint;
  end;
end;
$$;

create function pg_temp.formula_prompt_flag_constraint()
returns text
language plpgsql
as $$
declare v_constraint text;
begin
  begin
    update public.card_blocks set has_prompt=false
      where id='f4000000-0000-4000-8000-000000000050';
    return 'aceita';
  exception when check_violation then
    get stacked diagnostics v_constraint=constraint_name;
    return v_constraint;
  end;
end;
$$;

select is(pg_temp.accepted_formula_gap(),'aceita',
  'o banco aceita fórmula com resposta gap');
select is(pg_temp.formula_prompt_flag_constraint(),'card_blocks_formula_shape',
  'prompt sem has_prompt é recusado para impedir perda no round-trip');
select is(pg_temp.formula_token_constraint(
  'text','<mi>x</mi>'
),'block_nodes_formula_shape','nó terminal recusa marcação MathML ou HTML');
select is(pg_temp.formula_token_constraint(
  'text','valor'||chr(11)
),'block_nodes_formula_shape','nó terminal recusa caracteres de controle');
select ok(
  char_length(repeat(chr(66376),256)) = 256,
  'o limite conta caracteres Unicode completos, não unidades UTF-16'
);
select ok(
  char_length(repeat(chr(66376),257)) > 256,
  'o limite recusa mais de 256 caracteres Unicode no terminal'
);
select is(pg_temp.formula_token_constraint(
  'fenced',null,'(',']'
),'block_nodes_formula_shape','nó delimitado recusa pares incompatíveis');

set constraints all deferred;

savepoint formula_bad_arity;
insert into public.block_nodes(
  id,course_id,block_id,parent_node_id,contract_key,position,node_scope,node_kind
) values (
  'f4000000-0000-4000-8000-000000000080',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000050',
  'f4000000-0000-4000-8000-000000000070','fracao-sem-filhos',3,
  'formula','fraction'
);
select throws_ok(
  $$select private.assert_formula_block_ast('f4000000-0000-4000-8000-000000000050')$$,
  '23514','Aridade ou posição inválida na AST formula.',
  'a AST recusa operador estrutural sem os filhos exigidos'
);
rollback to savepoint formula_bad_arity;
release savepoint formula_bad_arity;

savepoint formula_disconnected_cycle;
insert into public.block_nodes(
  id,course_id,block_id,parent_node_id,contract_key,position,node_scope,node_kind
) values (
  'f4000000-0000-4000-8000-000000000081',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000050',
  'f4000000-0000-4000-8000-000000000082','ciclo-a',0,'formula','row'
),(
  'f4000000-0000-4000-8000-000000000082',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000050',
  'f4000000-0000-4000-8000-000000000081','ciclo-b',0,'formula','row'
);
select throws_ok(
  $$select private.assert_formula_block_ast('f4000000-0000-4000-8000-000000000050')$$,
  '23514','AST formula cíclica, desconectada ou profunda demais.',
  'a AST recusa um ciclo desconectado da raiz válida'
);
rollback to savepoint formula_disconnected_cycle;
release savepoint formula_disconnected_cycle;

savepoint formula_wrong_scope;
insert into public.block_nodes(
  id,course_id,block_id,parent_node_id,contract_key,position,
  node_scope,node_kind,label
) values (
  'f4000000-0000-4000-8000-000000000083',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000050',
  'f4000000-0000-4000-8000-000000000070','no-arvore-invasor',0,
  'tree','folder','Incompatível'
);
select throws_ok(
  $$select private.assert_formula_block_ast('f4000000-0000-4000-8000-000000000050')$$,
  '23514','Bloco formula só pode conter nós da AST formula.',
  'bloco de fórmula recusa nó de outro recurso'
);
rollback to savepoint formula_wrong_scope;
release savepoint formula_wrong_scope;

savepoint formula_node_in_text;
insert into public.block_nodes(
  id,course_id,block_id,parent_node_id,contract_key,position,
  node_scope,node_kind,formula_value
) values (
  'f4000000-0000-4000-8000-000000000084',
  'f4000000-0000-4000-8000-000000000001',
  'f4000000-0000-4000-8000-000000000052',null,'formula-em-texto',0,
  'formula','identifier','z'
);
select throws_ok(
  $$select private.assert_formula_block_ast('f4000000-0000-4000-8000-000000000052')$$,
  '23514','Nós formula só podem pertencer a bloco formula.',
  'nó de fórmula não pode migrar para bloco de outro recurso'
);
rollback to savepoint formula_node_in_text;
release savepoint formula_node_in_text;

savepoint formula_too_large;
insert into public.block_nodes(
  id,course_id,block_id,parent_node_id,contract_key,position,
  node_scope,node_kind,formula_value
)
select gen_random_uuid(),
  'f4000000-0000-4000-8000-000000000001'::uuid,
  'f4000000-0000-4000-8000-000000000050'::uuid,
  'f4000000-0000-4000-8000-000000000070'::uuid,
  'excesso-'||series::text,series+2,'formula','number',series::text
from generate_series(1,507) series;
select throws_ok(
  $$select private.assert_formula_block_ast('f4000000-0000-4000-8000-000000000050')$$,
  '23514','Bloco formula exige uma raiz e aceita no máximo 512 nós.',
  'a AST recusa mais de 512 nós'
);
rollback to savepoint formula_too_large;
release savepoint formula_too_large;

savepoint formula_too_deep;
create temporary table formula_depth_ids on commit drop as
select series,gen_random_uuid() as id
from generate_series(1,32) series;
insert into public.block_nodes(
  id,course_id,block_id,parent_node_id,contract_key,position,
  node_scope,node_kind,formula_value
)
select current_node.id,
  'f4000000-0000-4000-8000-000000000001'::uuid,
  'f4000000-0000-4000-8000-000000000050'::uuid,
  case when current_node.series=1
    then 'f4000000-0000-4000-8000-000000000070'::uuid
    else parent_node.id
  end,
  'profundidade-'||current_node.series::text,
  case when current_node.series=1 then 3 else 0 end,
  'formula',
  case when current_node.series=32 then 'number' else 'row' end,
  case when current_node.series=32 then '1' else null end
from formula_depth_ids current_node
left join formula_depth_ids parent_node
  on parent_node.series=current_node.series-1;
select throws_ok(
  $$select private.assert_formula_block_ast('f4000000-0000-4000-8000-000000000050')$$,
  '23514','AST formula cíclica, desconectada ou profunda demais.',
  'a AST recusa profundidade superior a 32 níveis'
);
rollback to savepoint formula_too_deep;
release savepoint formula_too_deep;

rollback to savepoint formula_rows;
release savepoint formula_rows;

select * from finish();
rollback;
