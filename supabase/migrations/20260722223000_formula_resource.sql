begin;

alter type public.card_resource add value if not exists 'formula';

alter table public.cards drop constraint if exists cards_formula_exercise;
alter table public.cards add constraint cards_formula_exercise check (
  resource::text <> 'formula' or
  (kind = 'theory' and exercise = 'none') or
  (kind = 'exercise' and exercise = 'choice')
);

alter table public.card_blocks
  add column if not exists notation text,
  add column if not exists accessible_text text;

alter table public.card_blocks drop constraint if exists card_blocks_type;
alter table public.card_blocks add constraint card_blocks_type check (block_type in (
  'heading', 'paragraph', 'choice', 'composite', 'code', 'table', 'flow',
  'tree', 'graph', 'relation_map', 'matrix', 'plane', 'formula'
));

alter table public.card_blocks drop constraint if exists card_blocks_formula_shape;
alter table public.card_blocks add constraint card_blocks_formula_shape check (
  (
    block_type = 'formula'
    and prompt is not null and btrim(prompt) <> ''
    and has_prompt
    and notation in ('mathematics', 'chemistry')
    and accessible_text is not null and btrim(accessible_text) <> ''
  ) or (
    block_type <> 'formula'
    and notation is null
    and accessible_text is null
  )
);

alter table public.block_nodes
  add column if not exists formula_value text,
  add column if not exists fence_open text,
  add column if not exists fence_close text;

alter table public.block_nodes drop constraint if exists block_nodes_scope;
alter table public.block_nodes add constraint block_nodes_scope check (
  node_scope in ('tree','graph','relation_left','relation_right','formula')
);

alter table public.block_nodes drop constraint if exists block_nodes_kind;
alter table public.block_nodes add constraint block_nodes_kind check (
  (node_scope = 'tree' and node_kind in ('folder','file')) or
  (node_scope = 'graph' and node_kind = 'vertex') or
  (node_scope in ('relation_left','relation_right') and node_kind = 'set_item') or
  (node_scope = 'formula' and node_kind in (
    'row','number','identifier','operator','text','fraction','root',
    'superscript','subscript','subsup','fenced'
  ))
);

alter table public.block_nodes drop constraint if exists block_nodes_formula_shape;
alter table public.block_nodes add constraint block_nodes_formula_shape check (
  (
    node_scope <> 'formula'
    and formula_value is null
    and fence_open is null
    and fence_close is null
  ) or (
    node_scope = 'formula'
    and (
      (
        node_kind in ('number','identifier','operator','text')
        and formula_value is not null and btrim(formula_value) <> ''
        and char_length(formula_value) <= 256
        and formula_value !~ '</?[A-Za-z][^>]*>'
        and formula_value !~ (
          '[' || chr(1) || '-' || chr(8) || chr(11) || chr(12)
          || chr(14) || '-' || chr(31) || chr(127) || ']'
        )
        and fence_open is null and fence_close is null
      ) or (
        node_kind = 'fenced'
        and formula_value is null
        and (fence_open, fence_close) in (
          ('(',')'), ('[',']'), ('{','}'), ('|','|'), ('‖','‖'), ('⟨','⟩')
        )
      ) or (
        node_kind in ('row','fraction','root','superscript','subscript','subsup')
        and formula_value is null
        and fence_open is null and fence_close is null
      )
    )
  )
);

create unique index if not exists block_nodes_formula_root_uidx
  on public.block_nodes(block_id)
  where node_scope = 'formula' and parent_node_id is null;

create or replace function private.assert_formula_block_ast(p_block_id uuid)
returns void
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_block_type text;
  v_node_count integer;
  v_root_count integer;
  v_reachable_count integer;
  v_max_depth integer;
  v_has_cycle boolean;
begin
  select block_type into v_block_type
  from public.card_blocks
  where id = p_block_id;

  if not found then
    return;
  end if;

  if v_block_type <> 'formula' then
    if exists (
      select 1 from public.block_nodes
      where block_id = p_block_id and node_scope = 'formula'
    ) then
      raise exception 'Nós formula só podem pertencer a bloco formula.' using errcode = '23514';
    end if;
    return;
  end if;

  if exists (
    select 1 from public.block_nodes
    where block_id = p_block_id and node_scope <> 'formula'
  ) then
    raise exception 'Bloco formula só pode conter nós da AST formula.' using errcode = '23514';
  end if;

  select count(*)::integer,
         count(*) filter (where parent_node_id is null)::integer
  into v_node_count, v_root_count
  from public.block_nodes
  where block_id = p_block_id and node_scope = 'formula';

  if v_node_count < 1 or v_node_count > 512 or v_root_count <> 1 then
    raise exception 'Bloco formula exige uma raiz e aceita no máximo 512 nós.' using errcode = '23514';
  end if;

  if exists (
    select 1
    from public.block_nodes node
    left join lateral (
      select count(*)::integer as child_count,
             min(child.position)::integer as min_position,
             max(child.position)::integer as max_position,
             count(distinct child.position)::integer as distinct_positions
      from public.block_nodes child
      where child.parent_node_id = node.id
        and child.block_id = p_block_id
        and child.node_scope = 'formula'
    ) children on true
    where node.block_id = p_block_id
      and node.node_scope = 'formula'
      and (
        children.child_count <> children.distinct_positions
        or (children.child_count > 0 and (
          children.min_position <> 0 or children.max_position <> children.child_count - 1
        ))
        or (node.node_kind in ('number','identifier','operator','text') and children.child_count <> 0)
        or (node.node_kind = 'row' and children.child_count not between 1 and 64)
        or (node.node_kind in ('fraction','superscript','subscript') and children.child_count <> 2)
        or (node.node_kind = 'root' and children.child_count not between 1 and 2)
        or (node.node_kind = 'subsup' and children.child_count <> 3)
        or (node.node_kind = 'fenced' and children.child_count <> 1)
      )
  ) then
    raise exception 'Aridade ou posição inválida na AST formula.' using errcode = '23514';
  end if;

  with recursive walk as (
    select node.id, node.parent_node_id, 1 as depth, array[node.id]::uuid[] as path, false as cycle
    from public.block_nodes node
    where node.block_id = p_block_id
      and node.node_scope = 'formula'
      and node.parent_node_id is null
    union all
    select child.id, child.parent_node_id, parent.depth + 1,
           parent.path || child.id,
           child.id = any(parent.path)
    from walk parent
    join public.block_nodes child
      on child.parent_node_id = parent.id
     and child.block_id = p_block_id
     and child.node_scope = 'formula'
    where not parent.cycle and parent.depth <= 32
  )
  select count(distinct id)::integer, max(depth)::integer, coalesce(bool_or(cycle), false)
  into v_reachable_count, v_max_depth, v_has_cycle
  from walk;

  if v_has_cycle or v_max_depth > 32 or v_reachable_count <> v_node_count then
    raise exception 'AST formula cíclica, desconectada ou profunda demais.' using errcode = '23514';
  end if;
end;
$$;

create or replace function private.enforce_formula_block_ast()
returns trigger
language plpgsql
security definer
set search_path = pg_catalog, public, private
as $$
declare
  v_block_id uuid;
begin
  if tg_table_name = 'card_blocks' then
    v_block_id := case when tg_op = 'DELETE' then old.id else new.id end;
  else
    v_block_id := case when tg_op = 'DELETE' then old.block_id else new.block_id end;
    if tg_op = 'UPDATE' and old.block_id is distinct from new.block_id then
      perform private.assert_formula_block_ast(old.block_id);
    end if;
  end if;
  perform private.assert_formula_block_ast(v_block_id);
  if tg_op = 'DELETE' then return old; end if;
  return new;
end;
$$;

drop trigger if exists block_nodes_formula_ast_guard on public.block_nodes;
create constraint trigger block_nodes_formula_ast_guard
after insert or update or delete on public.block_nodes
deferrable initially deferred
for each row execute function private.enforce_formula_block_ast();

drop trigger if exists card_blocks_formula_ast_guard on public.card_blocks;
create constraint trigger card_blocks_formula_ast_guard
after insert or update on public.card_blocks
deferrable initially deferred
for each row execute function private.enforce_formula_block_ast();

revoke all on function private.assert_formula_block_ast(uuid) from public, anon, authenticated, service_role;
revoke all on function private.enforce_formula_block_ast() from public, anon, authenticated, service_role;

comment on column public.card_blocks.notation is
  'Domínio visual da AST formula: mathematics ou chemistry.';
comment on column public.card_blocks.accessible_text is
  'Leitura textual completa da fórmula para tecnologia assistiva e fallback.';
comment on column public.block_nodes.formula_value is
  'Conteúdo Unicode de um nó terminal da AST formula; nunca contém marcação MathML.';
comment on function private.assert_formula_block_ast(uuid) is
  'Confere raiz, conectividade, profundidade, posição e aridade da AST formula ao final da transação.';

commit;
