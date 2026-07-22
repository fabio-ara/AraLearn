begin;

alter table public.flow_cases
  drop constraint flow_cases_kind;

update public.flow_cases
set case_kind = 'if_chain_branch'
where case_kind = 'legacy_branch';

alter table public.flow_cases
  add constraint flow_cases_kind
  check (case_kind in ('switch', 'if_chain', 'if_chain_branch'));

commit;
