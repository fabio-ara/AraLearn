begin;

create extension if not exists pgtap with schema extensions;
set search_path = public, extensions, pg_catalog;
select no_plan();

select has_function(
  'private', 'authoring_plan_learning_references_are_valid',
  array['jsonb', 'jsonb'],
  'plano possui validador relacional do protocolo pedagógico'
);
select has_function(
  'private', 'authoring_part_learning_references_are_valid',
  array['jsonb', 'jsonb', 'jsonb'],
  'especificação possui validador das referências dos cards'
);

create temporary table authoring_learning_fixture(
  plan jsonb not null,
  outline jsonb not null,
  specification jsonb not null
);

insert into authoring_learning_fixture(plan, outline, specification)
select
  plan,
  plan->'parts'->0,
  jsonb_build_object(
    'key', 'part-foundation',
    'title', 'Fundamento e diagnóstico',
    'boundary', 'Uma operação observável.',
    'cutReason', 'Mantém o card com baixa densidade.',
    'dependsOnPartKeys', jsonb_build_array(),
    'ownership', jsonb_build_object(
      'courseId', 'course-protocol',
      'moduleId', 'module-protocol',
      'lessonId', 'lesson-protocol',
      'microsequenceIds', jsonb_build_array('micro-protocol')
    ),
    'outcomeIds', jsonb_build_array('outcome-evaluate'),
    'conceptIds', jsonb_build_array('concept-operation', 'concept-value'),
    'operationIds', jsonb_build_array('operation-evaluate'),
    'misconceptionIds', jsonb_build_array('misconception-order'),
    'structure', jsonb_build_object(),
    'cardPlan', jsonb_build_array(
      jsonb_build_object(
        'cardId', 'card-diagnosis',
        'microsequenceId', 'micro-protocol',
        'position', 1,
        'resource', 'table',
        'kind', 'exercise',
        'exercise', 'gap',
        'purpose', 'Diagnosticar a ordem aplicada.',
        'evidence', 'Completa a etapa correta.',
        'outcomeIds', jsonb_build_array('outcome-evaluate'),
        'operationId', 'operation-evaluate',
        'conceptIds', jsonb_build_array('concept-operation'),
        'retrievedConceptIds', jsonb_build_array('concept-value'),
        'misconceptionIds', jsonb_build_array('misconception-order'),
        'learningFunction', 'error_diagnosis',
        'resourceRationale', 'A tabela torna a ordem comparável.',
        'variationFocus', 'Nova sequência de valores.',
        'targetError', 'Trocar a ordem das etapas.',
        'contextAnchors', jsonb_build_array('ordem das etapas'),
        'introducedTermIds', jsonb_build_array(),
        'requiredTermIds', jsonb_build_array(),
        'sourceIds', jsonb_build_array()
      )
    ),
    'allowedSourceIds', jsonb_build_array(),
    'availableTermIds', jsonb_build_array(),
    'preserve', jsonb_build_array()
  )
from (
  select jsonb_build_object(
    'learningOutcomes', jsonb_build_array(jsonb_build_object(
      'id', 'outcome-evaluate',
      'statement', 'Avaliar uma operação.',
      'evidence', 'Determina e justifica o resultado.'
    )),
    'operations', jsonb_build_array(jsonb_build_object(
      'id', 'operation-evaluate',
      'label', 'Avaliar uma operação',
      'evidence', 'Determina o resultado e explicita o procedimento.',
      'representation', jsonb_build_object(
        'preferredResources', jsonb_build_array('table'),
        'allowedResources', jsonb_build_array('table', 'matrix'),
        'rationale', 'A tabela torna comparáveis a ordem e o resultado.'
      )
    )),
    'misconceptions', jsonb_build_array(jsonb_build_object(
      'id', 'misconception-order',
      'statement', 'A ordem das etapas não altera o resultado.',
      'correctionEvidence', 'Compara duas ordens e identifica a divergência.'
    )),
    'conceptMap', jsonb_build_object(
      'concepts', jsonb_build_array(
        jsonb_build_object('id', 'concept-operation', 'label', 'Operação'),
        jsonb_build_object('id', 'concept-value', 'label', 'Valor')
      ),
      'relations', jsonb_build_array(jsonb_build_object(
        'from', 'concept-operation',
        'to', 'concept-value',
        'relation', 'applies'
      ))
    ),
    'parts', jsonb_build_array(jsonb_build_object(
      'key', 'part-foundation',
      'title', 'Fundamento e diagnóstico',
      'boundary', 'Uma operação observável.',
      'cutReason', 'Mantém o card com baixa densidade.',
      'dependsOnPartKeys', jsonb_build_array(),
      'ownership', jsonb_build_object(
        'courseId', 'course-protocol',
        'moduleId', 'module-protocol',
        'lessonId', 'lesson-protocol',
        'microsequenceIds', jsonb_build_array('micro-protocol')
      ),
      'cardIds', jsonb_build_array('card-diagnosis'),
      'outcomeIds', jsonb_build_array('outcome-evaluate'),
      'conceptIds', jsonb_build_array(
        'concept-operation', 'concept-value'
      ),
      'operationIds', jsonb_build_array('operation-evaluate'),
      'misconceptionIds', jsonb_build_array('misconception-order')
    ))
  ) plan
) fixture;

select ok(
  private.authoring_plan_learning_references_are_valid(
    plan, plan->'parts'
  ),
  'plano aceita operação, conceitos e concepção explicitamente definidos'
)
from authoring_learning_fixture;

select ok(
  not private.authoring_plan_learning_references_are_valid(
    plan,
    jsonb_set(
      plan->'parts', '{0,operationIds}',
      '["operation-missing"]'::jsonb
    )
  ),
  'plano rejeita operação inexistente'
)
from authoring_learning_fixture;

select ok(
  not private.authoring_plan_learning_references_are_valid(
    jsonb_set(
      plan, '{operations}',
      (plan->'operations') || jsonb_build_array(jsonb_build_object(
        'id', 'operation-unassigned',
        'label', 'Operação sem parte',
        'evidence', 'Evidência que não foi atribuída.',
        'representation', jsonb_build_object(
          'preferredResources', jsonb_build_array('paragraph'),
          'allowedResources', jsonb_build_array('paragraph'),
          'rationale', 'A proposição exige somente uma representação textual.'
        )
      ))
    ),
    plan->'parts'
  ),
  'plano rejeita operação definida, mas não atribuída a uma parte'
)
from authoring_learning_fixture;

select ok(
  not private.authoring_plan_learning_references_are_valid(
    jsonb_set(
      plan, '{misconceptions}',
      (plan->'misconceptions') || jsonb_build_array(jsonb_build_object(
        'id', 'misconception-unassigned',
        'statement', 'Concepção sem parte.',
        'correctionEvidence', 'Correção que não foi atribuída.'
      ))
    ),
    plan->'parts'
  ),
  'plano rejeita concepção definida, mas não atribuída a uma parte'
)
from authoring_learning_fixture;

select ok(
  not private.authoring_plan_learning_references_are_valid(
    plan,
    jsonb_set(
      plan->'parts', '{0,misconceptionIds}',
      '["misconception-missing"]'::jsonb
    )
  ),
  'plano rejeita concepção equivocada inexistente'
)
from authoring_learning_fixture;

select ok(
  not private.authoring_plan_learning_references_are_valid(
    jsonb_set(
      plan, '{conceptMap,relations,0,to}', '"concept-missing"'::jsonb
    ),
    plan->'parts'
  ),
  'mapa conceitual rejeita relação com destino inexistente'
)
from authoring_learning_fixture;

select ok(
  not private.authoring_plan_learning_references_are_valid(
    jsonb_set(
      plan,
      '{operations,0,representation,allowedResources}',
      '["matrix"]'::jsonb
    ),
    plan->'parts'
  ),
  'plano rejeita recurso preferencial fora dos recursos permitidos'
)
from authoring_learning_fixture;

select ok(
  private.authoring_part_learning_references_are_valid(
    plan, outline, specification
  ),
  'especificação aceita referências pedagógicas coerentes'
)
from authoring_learning_fixture;

select ok(
  not private.authoring_part_learning_references_are_valid(
    plan,
    outline,
    jsonb_set(
      specification, '{cardPlan,0,resource}', '"graph"'::jsonb
    )
  ),
  'card planejado rejeita recurso não permitido para a operação'
)
from authoring_learning_fixture;

select ok(
  not private.authoring_part_learning_references_are_valid(
    plan,
    outline,
    jsonb_set(
      specification, '{cardPlan,0,resource}', '"matrix"'::jsonb
    )
  ),
  'parte rejeita prática sem recurso preferencial da operação'
)
from authoring_learning_fixture;

select ok(
  not private.authoring_part_learning_references_are_valid(
    plan,
    outline,
    jsonb_set(
      specification, '{cardPlan,0,operationId}',
      '"operation-missing"'::jsonb
    )
  ),
  'card planejado rejeita operação fora do contorno'
)
from authoring_learning_fixture;

select ok(
  not private.authoring_part_learning_references_are_valid(
    plan,
    outline,
    jsonb_set(
      specification, '{cardPlan,0,misconceptionIds}',
      '["misconception-missing"]'::jsonb
    )
  ),
  'card planejado rejeita concepção fora do contorno'
)
from authoring_learning_fixture;

select ok(
  not private.authoring_part_learning_references_are_valid(
    plan,
    outline,
    jsonb_set(
      specification, '{cardPlan,0,misconceptionIds}', '[]'::jsonb
    )
  ),
  'diagnóstico de erro exige a concepção que será corrigida'
)
from authoring_learning_fixture;

select ok(
  position(
    'private.authoring_plan_learning_references_are_valid'
    in pg_get_functiondef(
      'public.apply_authoring_command(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure
    )
  ) > 0,
  'set_plan chama o validador do protocolo pedagógico'
);

select ok(
  position(
    '''conceptIds'', v_item->''conceptIds'''
    in pg_get_functiondef(
      'public.apply_authoring_command(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure
    )
  ) > 0,
  'contorno persistido conserva conceptIds'
);

select ok(
  position(
    '''operationIds'', coalesce(v_specification->''operationIds'''
    in pg_get_functiondef(
      'public.apply_authoring_command(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure
    )
  ) > 0,
  'especificação reconstruída conserva operationIds'
);

select ok(
  position(
    'private.authoring_part_learning_references_are_valid'
    in pg_get_functiondef(
      'public.apply_authoring_command(uuid,uuid,text,uuid,text,text,jsonb)'::regprocedure
    )
  ) > 0,
  'set_part_specification chama o validador de referências dos cards'
);

select ok(not has_function_privilege(
  'service_role',
  'private.authoring_plan_learning_references_are_valid(jsonb,jsonb)',
  'EXECUTE'
), 'o cliente de serviço não chama diretamente o validador do plano');

select ok(not has_function_privilege(
  'authenticated',
  'private.authoring_part_learning_references_are_valid(jsonb,jsonb,jsonb)',
  'EXECUTE'
), 'usuário autenticado não chama diretamente o validador de parte');

select * from finish();
rollback;
