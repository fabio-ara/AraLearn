# DeepSeek v4 Flash Structured Engine

- Data: 2026-05-31T22:08:39.929Z
- Modelo: deepseek-v4-flash
- Resultado: success
- semanticValidation: true
- graphSemanticValidation: true
- auditPatchApplied: true
- freeResourceSelection: matrix / matrix_locate_cell_choice

## Fases
- top_down_structure: total=984, hit=256, miss=17, retries=0
- top_down_structure_audit: total=1731, hit=0, miss=1426, retries=0
- top_down_structure_audit: total=1475, hit=0, miss=1422, retries=0
- top_down_structure_audit: total=1618, hit=256, miss=1148, retries=0
- bottom_up_micro_plan: total=313, hit=0, miss=263, retries=0
- bottom_up_card_build: total=300, hit=0, miss=197, retries=0
- graph_bottom_up_micro_plan: total=325, hit=0, miss=262, retries=0
- graph_bottom_up_card_build: total=421, hit=0, miss=217, retries=0
- composite_bottom_up_micro_plan: total=326, hit=0, miss=265, retries=0
- composite_bottom_up_card_build: total=537, hit=0, miss=343, retries=0
- free_resource_selection: total=619, hit=0, miss=495, retries=0
- bottom_up_card_audit: total=325, hit=0, miss=286, retries=0

## Resumo
- structuralLeakWarnings: 0
- topDownAuditContradictions: 0
- graphAmbiguityWarnings: 0
- feedbackContradictions: 0
- choiceAnswerFallbacks: 0
- computedAnswers: 1:b, 1:b
- graphComputedAnswers: 1:a