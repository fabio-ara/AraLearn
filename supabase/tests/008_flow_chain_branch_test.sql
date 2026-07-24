begin;

select plan(3);

select ok(
  not exists (
    select 1
    from public.flow_cases
    where case_kind = 'legacy_branch'
  ),
  'nenhuma linha conserva a classificação antiga de ramificação'
);

select ok(
  pg_get_constraintdef(oid) like '%if_chain_branch%',
  'a restrição aceita a classificação explícita de ramificação'
)
from pg_constraint
where conrelid = 'public.flow_cases'::regclass
  and conname = 'flow_cases_kind';

select ok(
  pg_get_constraintdef(oid) not like '%legacy_branch%',
  'a restrição já não aceita a classificação antiga'
)
from pg_constraint
where conrelid = 'public.flow_cases'::regclass
  and conname = 'flow_cases_kind';

select * from finish();
rollback;
