begin;

-- O contrato v3 e o renderer aceitam lacunas em fórmulas estruturadas. A
-- restrição inicial permaneceu mais estreita e aceitava somente choice,
-- bloqueando a materialização relacional de um documento que já passara pela
-- validação integral.
alter table public.cards drop constraint if exists cards_formula_exercise;
alter table public.cards add constraint cards_formula_exercise check (
  resource::text <> 'formula'
  or (kind = 'theory' and exercise = 'none')
  or (kind = 'exercise' and exercise in ('choice', 'gap'))
);

-- Execuções privadas que ficaram interrompidas exclusivamente por essa
-- incompatibilidade podem retomar do cursor já persistido. A condição confere
-- o staging da própria execução: não libera erros estruturais de outra causa.
update private.authoring_runs run
set publication_error = null,
    publication_lease_token = null,
    publication_lease_until = null,
    updated_at = now()
where run.publication_target = 'private'
  and run.status = 'publishing'
  and run.publication_error @> jsonb_build_object(
    'kind', 'deterministic',
    'code', 'invalid_command',
    'message', 'A estrutura enviada viola uma regra do contrato.'
  )
  and exists (
    select 1
    from private.authoring_private_imports stage
    join private.authoring_private_import_stage_rows staged_card
      on staged_card.import_id = stage.import_id
     and staged_card.store_name = 'cards'
    where stage.run_id = run.id
      and staged_card.payload->>'resource' = 'formula'
      and staged_card.payload->>'exercise' = 'gap'
  );

commit;
