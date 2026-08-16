# Checkpoint recuperável da validação integrada de Autoria

Este documento registra um ponto seguro de retomada da #109. Ele existe para
que a validação possa ser interrompida sem perder trabalho nem confundir um
checkpoint técnico com o encerramento do roadmap.

## Estado preservado

As etapas anteriores estão separadas em commits locais auditáveis:

| Etapa | Commit | Resultado |
| --- | --- | --- |
| #102 | `e5951d51` | contratos e fundamento do desenho parametrizado |
| #103 | `e037d628` | persistência e resolução do desenho |
| #104 | `9d1a9a2f` | MCP, Action, knowledge e cenários pedagógicos |
| #105 | `57511c6b` | integração responsiva da Autoria |
| #106 | `e61f163a` | auditoria, findings, reparo e reauditoria |
| #107 | `b63383d5` | experimentos, variantes, freeze e assignment |
| #108 | `f3346eb3` | outcomes e analytics versionados |

A #109 já corrigiu regressões de integração em capabilities, orientação JIT,
compatibilidade legada e estilos; regenerou os seis pacotes de assistentes; e
gerou capturas de Mapa, Desenho, Auditoria, fluxo e Resultados. O branch remoto
de checkpoint é `checkpoint/autoria-109-20260816`.

## Evidência obtida antes da pausa

- `npm test`: 1.165 testes, 1.164 aprovados, nenhuma falha e um skip do ensaio
  PostgreSQL real, condicionado a `ARALEARN_TEST_DATABASE_URL` e `psql`;
- `npm run test:e2e`: 143 cenários aprovados, nenhuma falha e uma captura
  opt-in ignorada na execução normal;
- captura opt-in: uma jornada aprovada e imagens em 360, 390, 412 e 1280 px,
  nos temas claro e escuro;
- inspeção visual representativa: fluxo em 360 px claro e Resultados em
  1280 px escuro, sem corte ou sobreposição observados;
- curso grande exercitado no Chromium: arquivo de 3.432.348 bytes, 175
  microssequências e 1.052 cards; na execução observada, heap usado passou de
  670.596 para 14.215.064 bytes e as ações medidas ficaram entre 1,3 e 29,1 ms;
- jornada relacional PGlite de experimento: 68 relações privadas de Autoria,
  3.817.472 bytes incluindo índices/TOAST e 5.120 bytes de artefatos referidos
  na fixture;
- orçamento lógico do desenho de 500 microssequências: 7.042.790 bytes em
  1.500 registros serializados; cache local limitado a 2 MiB por fatia,
  32 MiB por workspace e 512 KiB de outbox;
- Action OpenAPI: 82.375 bytes, 30 paths; system prompt: 7.563 bytes;
  respostas MCP/Action continuam limitadas a menos de 96 KiB.

Esses números pertencem às fixtures e ao ambiente local de 16 de agosto de
2026. Não são previsão de produção nem evidência de aprendizagem.

## O que ainda não pode ser dado como concluído

1. Reexecutar `npm test` e `npm run test:e2e` no commit final do checkpoint. A
   suíte integral acima passou no mesmo código de produto, antes somente da
   adição das duas instrumentações de medição; ambas passaram focalmente.
2. Completar o relatório final da #109, os exemplos exportados CSV/JSON e o
   checklist comparativo de UX por persona.
3. Executar os pgTAP `050`, `060` e `070` e os smokes locais quando Supabase
   CLI, `psql` e a stack local estiverem disponíveis. Eles foram preparados,
   mas não foram executados neste ambiente.
4. Verificar implantação hospedada apenas em ambiente autorizado. Nenhum
   deploy foi inferido a partir dos testes locais.
5. Executar com uma pessoa real o roteiro de aceitação leiga, primeiro no
   celular e depois no desktop. Playwright e agentes não podem aprovar esse
   critério humano.
6. Só depois desses itens atualizar a #101/#109 como encerradas e promover o
   checkpoint para `main`.

## Retomada exata

```powershell
git fetch origin
git switch checkpoint/autoria-109-20260816
npm ci
npm test
npm run test:e2e
npm run lint
node scripts/auditDocumentation.mjs
npm run audit:frontend
node scripts/syncEdgeResourceRuntime.mjs --check
node scripts/syncInstructionalDesignSchemas.mjs --check
node scripts/testAuthoringPackages.mjs
git diff --check
```

Se a stack Supabase estiver disponível, executar depois os testes pgTAP e os
smokes locais descritos em [Supabase](supabase.md). Se qualquer comando falhar,
corrigir a regressão antes de produzir o relatório final; não reabrir contratos
estáveis da #102–#108 por preferência de implementação.

O [estado atual e roadmap](estado-atual-e-roadmap.md) continua sendo a fonte
canônica de capacidades e limites. Este arquivo é apenas o marcador operacional
de interrupção e retomada.
