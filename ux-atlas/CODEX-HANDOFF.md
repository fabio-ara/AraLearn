# Handoff para Codex — frontend final do AraLearn

## Ponto de partida

Use a branch `ux/codex-frontend-v11`, criada diretamente do `main` atual. Não use `ux/atlas-frontend`, `ux/atlas-v11-continuity` nem `ux/final-interface-spec` como base de código; são histórico de exploração.

Antes de implementar, leia nesta ordem:

1. issue #147 — roadmap corrente;
2. issue #174 — gate obrigatório contra overengineering;
3. `ux-atlas/STUDY-VISUAL-BASELINE.md`;
4. `ux-atlas/MATRIZ-COBERTURA.md`;
5. `ux-atlas/index.html`;
6. a issue corrente da sequência #151–#155.

## Ordem de autoridade

1. **Backend e contratos de `main`** são a verdade funcional, de dados e autorização. Não invente endpoints, tabelas, RLS, eventos, datasets ou resultados para satisfazer o mock.
2. **`ux-atlas/`** define cobertura, navegação, estados e hierarquia desejados para o frontend.
3. **`ux-atlas/STUDY-VISUAL-BASELINE.md`** define a identidade visual/interacional de Estudo. Quando o Atlas divergir apenas na apresentação de Estudo, essa referência visual prevalece.
4. **`docs/sistema-visual.md`, tokens e componentes atuais de `src/ui` / `src/study`** são a base de implementação e acessibilidade. Reutilize-os; não copie literalmente HTML ou handlers históricos.

O baseline histórico `9e7ddc013d8efcf2918bf2b5b03f506217098e15` é referência **visual/interacional**, não arquitetura a restaurar. Não recuperar Workspace, Trilhas, persistência, rotas, APIs ou schemas antigos.

## Identidade visual obrigatória

Preservar/reaplicar:

- switch compacto **Estudo / Autoria** como seletor da área principal;
- mesma família de cards, espaçamento, tipografia, iconografia e densidade entre Estudo e Autoria;
- no Estudo, modos pares **Visualizar / Editar / Assistência por API** na Unidade de estudo, com `Visualizar` como padrão;
- a mesma gramática na Microssequência quando a capacidade existir naquele nível;
- ações internas do modo surgem depois da seleção do modo;
- uma única coluna útil de aproximadamente 430 px, inclusive em desktop;
- ações irmãs no mesmo eixo; overlays preservam posição/foco.

### Implementação funcional desses modos

Use somente os mecanismos atuais:

- Visualizar → renderer/runtime atual;
- Editar → `manualStudyUnitEdit` e fluxo manual atual;
- Assistência por API → `StudyUnitProviderAssistance` e disponibilidade/configuração atuais;
- cópia pessoal → contratos atuais implementados após #149.

Não criar editor, provider, chat ou navegação paralelos.

## O que o Atlas é

O Atlas é uma especificação navegável de cobertura e comportamento. Cada tela mostra grafo de transições, mock, ações, função, decisão de UX e evidência funcional.

Não implemente o **shell do Atlas** dentro do produto. Implemente os estados e comportamentos representados usando os componentes reais do AraLearn.

Para inspecionar o código legível das telas, execute:

`node ux-atlas/extract.mjs`

Isso gera `atlas.generated.js`, `graphs.generated.js` e `atlas.generated.css` a partir do payload versionado.

## Capacidades atuais que devem ficar encontráveis

- Estudo, retomada e Rever;
- navegação Curso → Módulo → Lição → Microssequência → Unidade;
- edição manual, assistência por API e cópia pessoal quando autorizadas;
- Estrutura, Planejamento e materialização por Partes;
- Parâmetros, orientações e política de componentes;
- Fontes, revisões, Âncoras, atribuições e PDFs;
- Inspeção vertical;
- Observações, auditoria, correção, verificação e reversão;
- Variantes;
- Pesquisa/Analytics com sete datasets, gráfico, tabela equivalente, definição, fatos, filtros, deep links e CSV/JSON;
- Pessoas/acesso;
- ação contextual ChatGPT/MCP.

`research_condition`, Variantes e Analytics não significam randomização, aprendizagem nem efeito causal em estudantes. Esses outcomes permanecem futuros.

## Regra contra overengineering

Durante #151–#155, aplique #174 literalmente.

Salvo bloqueio técnico comprovado e aprovação explícita do responsável, **não**:

- criar tabela, migration, Edge Function, endpoint, ferramenta MCP, serviço, adapter ou camada de domínio nova;
- adicionar biblioteca/framework para função já coberta pelos componentes atuais;
- criar plugin system, event sourcing, store versionado, Git/GitHub runtime ou abstração preventiva;
- refatorar backend que já satisfaz o contrato apenas por organização;
- abrir subissues ou expandir escopo automaticamente;
- fazer benchmark/auditoria ampla sem falha concreta bloqueando o release;
- iniciar qualquer item #156–#168.

Se surgir necessidade fora do escopo: **pare, registre o bloqueio e peça decisão**. Não arquitete ao redor dele.

## Sequência de execução permitida

1. #151 — fechar capacidades existentes;
2. #152 — frontend final + identidade visual;
3. #153 — validar fluxos críticos;
4. #154 — integrar/publicar;
5. #155 — limpeza mínima/estabilização.

**Depois de #155, pare.** #156–#168 estão congeladas até decisão explícita do responsável.

## Critérios de aceite finais

1. Nenhuma capacidade atual da matriz fica sem caminho claro de UI ou justificativa interna explícita.
2. Nenhum item futuro é apresentado como funcional.
3. Estudo mantém `Estudo / Autoria` e `Visualizar / Editar / Assistência por API` conforme a referência visual.
4. Toda ação visível tem destino/estado de erro e autorização continua server-side.
5. Voltar, subir nível, overlays e deep links preservam contexto e foco.
6. Pesquisa tem gráfico + tabela equivalente + definição + denominador + missingness + fatos + exportação.
7. Variantes mostram planejado × efetivo e diferenças sem alegação causal.
8. O frontend não cria backend para Coleções ou outras propostas não suportadas.
9. `node ux-atlas/validate.mjs` retorna zero falhas.
10. Na integração final, `npm test` e testes E2E/smokes pertinentes passam.
11. A implementação reduz ou mantém a complexidade total; não cria nova plataforma para concluir a release.
