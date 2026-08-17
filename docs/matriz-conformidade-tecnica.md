# Matriz de conformidade técnica

Uma matriz de conformidade liga uma afirmação sobre o sistema à implementação que pretende realizá-la e ao teste que pode refutá-la. Ela evita que documentação, código e validação evoluam como descrições independentes.

Esta matriz é versionada junto com o repositório. Não fixa contagem de testes nem data de uma execução: esses valores envelhecem sem que a propriedade mude. O resultado de uma rodada deve ser registrado pelo processo de integração ou de release.

## 1. Como interpretar

| Estado | Significado |
|---|---|
| demonstrado | código e teste citado cobrem a propriedade no escopo descrito |
| demonstrado com limite | a propriedade existe, mas possui teto, janela ou cenário não coberto |
| proposta conceitual verificada | contrato exploratório e fixtures cobrem a forma proposta, sem integração operacional |
| não oferecido | a arquitetura deliberadamente não promete a propriedade |
| avaliação externa | código não basta; requer participantes, operação ou análise especializada |

“Demonstrado” não significa prova formal, segurança absoluta ou eficácia pedagógica universal. Significa que há uma cadeia rastreável entre requisito, implementação e ensaio automatizado. Um teste pode conter defeito, e uma fixture não representa todas as entradas.

## 2. Contratos, kernel e catálogo

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| `aralearn.library.v1` aceita `contract`, `scope` opcional e `courses` | `src/domain/aralearnProject.js`; `authoring/schemas/workspace-envelope.schema.json` | `tests/runtime/aralearn-project-strict.test.js`; `tests/kernel/package-contract-editor.test.js` | demonstrado; o schema da raiz não substitui invariantes profundos do validador |
| o kernel oferece `aralearn.course.v1` para um curso unitário | `src/resources/kernel/courseContract.js` | `tests/kernel/resource-package-kernel.test.js` | demonstrado; não é o envelope persistido multi-curso |
| cards usam slots e instâncias `package@version` | `src/resources/kernel/cardEnvelope.js`; `src/resources/kernel/packageRegistry.js` | `tests/kernel/resource-package-kernel.test.js`; `tests/kernel/resource-package-edge.test.js` | demonstrado; teoria exige conteúdo e prática exige resposta |
| package novo entra pelo registry sem branch no kernel | `src/resources/packages/generated.js`; `src/resources/kernel/packageRegistry.js` | `tests/kernel/resource-package-autoindex.test.js`; `tests/kernel/resource-package-kernel.test.js` | demonstrado para packages que cumprem a interface; índice derivado precisa ser regenerado |
| manifest, contrato autoral, schema e renderer têm papéis separados | `src/resources/packages/*/index.js`; `src/resources/kernel/packageRegistry.js` | `tests/kernel/package-contract-editor.test.js`; `tests/kernel/package-card-assistance.test.js` | demonstrado |
| descoberta usa `aralearn.resource-library.v1` | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js`; `tests/runtime/authoring-mcp.test.js` | demonstrado; o protocolo não transporta árvore de curso |
| busca entrega lista curta e contratos sob demanda | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js`; `tests/runtime/authoring-catalog-search-v5.test.js` | demonstrado: busca padrão 12, máximo 32; inspeção 8; contratos exatamente 1 por chamada |
| `canonical`, `versatile` e `substitute` representam cobertura calculada | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js` | demonstrado; não certifica consenso acadêmico externo |
| o validador implementa todo JSON Schema 2020-12 | `src/resources/kernel/schemaValidation.js` | `tests/kernel/resource-package-kernel.test.js` | não oferecido; apenas o subconjunto documentado é aceito |
| auditoria catalográfica reproduz layout real | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js` | não oferecido; `rendered: false`; layout exige navegador e motores reais |
| contratos, packages, catálogo, IndexedDB, MCP e app possuem versões próprias | registry, catálogo, store, servidor MCP e `package.json` | testes de cada fronteira | demonstrado; `revision` é CAS e `cursor` é paginação, não versão de contrato |
| o desenho separa análise, definição, assignment, valores efetivos, manifesto e disponibilidade de resources | `instructionalDesignContracts.js`; schemas em `authoring/schemas/`; `instructionalDesignValidation.js` | `instructional-design-contracts.test.js`; `instructional-design-domain-v1.test.js`; corpus em `tests/fixtures/pedagogy/`; `authoring-mcp.test.js` | demonstrado; os contratos integram runtime, backend, MCP e Action, mas ainda não publicação ou UI |
| parâmetros preservam grandezas não escalares | `DesignParameterDefinition` e resolvedor em `src/authoring/` | casos de inteiro, faixa, categoria, conjunto, vetor e relação nos testes focados | demonstrado com limite; tipo representável não valida unidade, teto nem decisão pedagógica |
| valor efetivo conserva escopo, definição, assignment, modo, herança e proveniência exatos | `designParameterResolution.js`; `EffectiveDesignSnapshot`; migration parametrizada | `instructional-design-domain-v1.test.js`; `parameterized-authoring-design-pglite.test.js` | demonstrado: autoridade lock → manual → Auto → default, `nearest_scope_replaces` dentro do modo, duplicidade do mesmo modo no mesmo escopo e lock separado; o snapshot não restaura o workspace |
| `ResourceSet` separa disponibilidade, seleção autorizada e materialização | `resourceSetResolution.js`; `ResourceSet`; `MaterializationManifest`; tabelas normalizadas | corpus multidomínio; `instructional-design-domain-v1.test.js`; `parameterized-authoring-design-pglite.test.js` | demonstrado; package, fit e papel precisam ser aceitos pelo mesmo conjunto; `versatile` e `substitute` obedecem à política efetiva ∩ conjunto, exigem limitação quando admitidos e não viram equivalência |
| binding preserva o blueprint pedagógico v2 e diff compara somente fatos | `instructionalDesignBinding.js`; `authoring_pedagogical_blueprints`; `authoring_pedagogical_blueprint_bindings`; `authoring_microsequence_design_bindings` | `instructional-design-domain-v1.test.js`; `parameterized-authoring-design-pglite.test.js` | demonstrado com limite; blueprint e binding completo são imutáveis, o apontador corrente é mutável e o diff não faz julgamento semântico |
| manifesto identifica exatamente os cards correntes | `authoring_materialization_states`; `authoring_materialized_content_hash_v1`; trigger de entidades; registro de manifesto | `parameterized-authoring-design-pglite.test.js` | demonstrado com limite: hash é derivado no servidor, `artifactRefs` coincide exatamente com cards e mutação posterior torna o manifesto stale; o registro prova identidade/contrato, enquanto a auditoria posterior deriva as instâncias reais |
| auditoria confronta o manifesto com cards e resources realmente persistidos | `instructionalConformanceAudit.js`; `authoring_audit_runs`; registro da rodada | `instructional-conformance-audit.test.js`; corpus `instructional-conformance-audit-scenarios.v1.json`; testes focais de serviço e PGlite | demonstrado nas regras cobertas: multiconjunto real de card/slot/package@version/papel é derivado novamente; autorização estrutural não é apresentada como adequação semântica |
| finding estruturado não se autoriza a reparar e só é verificado por reauditoria corrente | lifecycle de observations; mandato `repair_findings`; audit run e run de verificação | testes focais de persistência, CAS/replay e jornada auditoria→decisão→reparo→reauditoria | demonstrado nas transições cobertas; falso positivo pode ser rejeitado, `repaired` não significa `resolved` e a rodada posterior também procura regressões |
| auditoria de Parte agrega cobertura e distribuição sem score | `aggregatePartConformanceAudits`; microssequências congeladas no audit run | corpus #106 e testes de Parte grande/paginação | demonstrado como coordenação operacional; não oferecido como unidade pedagógica, medida de qualidade ou eficácia |
| protocolo experimental parte de base comum, fatores ordinários e condições explícitas | `instructionalExperiment.js`; `authoring_experiments`, revisões de protocolo, fatores, condições, bases e variantes | `authoring-experiment-domain.test.js`; `authoring-experiments-pglite.test.js` | demonstrado com limite: não há produto cartesiano implícito; no máximo 8 fatores, 32 condições e 60.000 bytes UTF-8 no protocolo completo; forma válida não demonstra adequação do desenho |
| `research_lock` só é emitido pelo control plane experimental | capability `research`; guard de assignments; locks de revisão de variante | jornada PGlite de geração e testes de tentativa pela API genérica | demonstrado: owner/admin operam o protocolo, enquanto `set_parameter`/`remove_parameter` e o GPT não criam, removem nem contornam o lock |
| uma variante congela conteúdo e proveniência exatos antes de assignment | revisões de variante, pins por microssequência, audit runs, difference runs e freeze | domínio; serviço; jornada PGlite freeze/invalidar/regenerar | demonstrado com limite: correção cria nova revisão e invalida comparações dependentes; freeze garante identidade técnica, não equivalência pedagógica ou eficácia |
| diferença factual e classificação semântica têm autoridades separadas | diff canônico; `register_experiment_variant_evidence`; `record_experiment_diff_classification`; decisão app-only | testes de 0/25/5.000 hunks, retomada, replay e mandato | demonstrado com limite: páginas e progresso são bounded; classificação não altera protocolo, condição, assignment nem decisão humana |
| assignment fixa uma revisão congelada sem expor seed, roster ou outras condições | enrollment consentido, pseudônimo local, assignment append-only, seleção privada | vetores seeded, manual/balanceado, concorrência/replay, UI participante e PGlite | demonstrado no protocolo coberto; assignment reproduzível não prova randomização suficiente, exposição, adesão nem efeito |
| `ResourceSet` experimental usa o conjunto exato da condição | fatores `available_resource_set_refs`; locks; auditoria da materialização efetiva | domínio, jornada PGlite e cenário de package fora do conjunto | demonstrado: alvos sobrepostos são recusados; permitido, selecionado e efetivamente usado permanecem relações distintas |
| cards, palavras, caracteres e total de resources são métricas posteriores | `MaterializationManifest`; `instructionalDesignBinding.js` | teste de métricas derivadas, diff e algoritmo versionado | demonstrado; métricas descrevem materialização e não comandam decomposição pedagógica |
| conteúdo sem manifesto não recebe parâmetros retroativos inventados | `legacyInstructionalDesign.js`; `get_authoring_design_state_v1` | `instructional-design-domain-v1.test.js`; `parameterized-authoring-design-pglite.test.js` | demonstrado: sem conteúdo, `unresolved`; qualquer conteúdo sem manifesto usa `legacy_untracked` e `legacy_unrestricted` até nova análise |

## 3. Representações e interação

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| packages expõem texto acessível, edição e alvos de prática | `src/resources/kernel/packageRegistry.js`; packages instalados | `tests/kernel/package-card-assistance.test.js`; testes de package | demonstrado para o registry corrente |
| lacunas distintas mantêm estado e opções próprios | `gap-response`; mediação do registry e renderer | `tests/e2e/table-resource.spec.js`; matriz do curso de resources | demonstrado nos packages com múltiplos alvos |
| Graphviz calcula layout de grafos e fluxos sem coordenadas autorais | `src/resources/sdk/graphviz.js`; packages diagramáticos | `tests/e2e/package-visuals.spec.js`; testes acadêmicos de resources | demonstrado com limite; pertinência e semântica dependem do contrato preenchido |
| Vega/Vega-Lite materializa gráficos e planos | `src/resources/sdk/vegaRuntime.js`; `chart`; `plane` | testes de packages e galeria visual | demonstrado com limite; escala e interpretação científicas exigem dados corretos |
| MathML preserva estrutura de fórmulas, matrizes e reações | `formula`; `matrix`; `reaction`; `stretchDelimiter.js` | testes de package e geometrias em navegador | demonstrado nos exemplos cobertos; suporte depende também do motor do navegador |
| corpus, viewport móvel e estresse acadêmico exercitam o catálogo | scripts de corpus, cursos acadêmicos e galeria | `tests/resource-course/`; `tests/e2e/package-visuals.spec.js` | demonstrado com limite; não cobre todas as áreas nem eficácia com estudantes |
| um package é pedagogicamente necessário | manifest e documentação de fundamentação | auditoria acadêmica e avaliação disciplinar | avaliação externa; testes técnicos não demonstram necessidade didática |

## 4. Persistência local e sincronização

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| cada conta possui namespace IndexedDB próprio | `src/persistence/IndexedDbRelationalStore.js` | `tests/runtime/relational-sync.test.js`; `tests/e2e/workspace-offline-authoring.spec.js` | demonstrado: `aralearn-relational-v4-r3`, versão 4, sufixo da conta |
| IndexedDB funciona como SGBD SQL completo | store e `relationalSchema.js` | testes de persistência | não oferecido; é projeção normalizada sobre object stores e índices |
| conteúdo já materializado pode ser estudado sem rede | repositório relacional e store | `tests/e2e/study-card-progression.spec.js`; `workspace-offline-authoring.spec.js` | demonstrado; login inicial, primeiro download e serviços remotos continuam online |
| desenho sincronizado pode ser lido offline sem virar autoridade | `src/persistence/WorkspaceDesignOfflineStore.js`; `syncState` | `tests/runtime/workspace-design-offline-store.test.js` | demonstrado: fatias por microssequência; fila apenas para override manual/Auto, separada do snapshot e revalidada remotamente |
| revisão remota só substitui a local depois de contrato e hash válidos | `src/sync/RelationalSyncEngine.js`; `canonicalCourseHash.js` | `tests/runtime/relational-sync.test.js`; `integrated-course-sync.test.js` | demonstrado; falha conserva a projeção anterior |
| todas as mutações usam uma outbox universal | `DomainMutationService.js`; sync engine; repositórios contextuais | testes de sync e estado pessoal | não oferecido; seleção, trilhas, estado e autoria têm protocolos limitados próprios |
| mutação repetida não duplica efeito dentro de sua janela | sync engine e RPCs de idempotência | testes de sync integrado e PGlite | demonstrado com limite; retenções variam por família |
| dispositivo ausente indefinidamente pode reproduzir todo feed | compactação e bootstrap | testes de retenção/sync | não oferecido; após a janela segura, novo bootstrap pode ser necessário |

## 5. Workspaces, concorrência e artefatos

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| workspace mutável é armazenado por entidades correntes | migrations de workspaces; `workspaceEngine.js` | `tests/runtime/authoring-workspace-engine.test.js` | demonstrado; até 10 mil partes, 1 MiB por parte e 32 MiB recomposto |
| commit usa CAS global e versões das partes | `workspaceEngine.js`; migrations de hardening/continuidade | testes de engine e `authoring-continuity-pglite.test.js` | demonstrado; conflito exige reler, não há merge silencioso |
| repetir `requestId` com mesmo payload recupera recibo | migrations de idempotência e executor | testes de continuidade e integração | demonstrado com limite; prazo depende do fluxo |
| eventos permitem restaurar qualquer revisão passada | `workspaceContinuity.js`; eventos recentes | `authoring-workspace-continuity.test.js` | não oferecido; eventos são resumos compactos, não snapshots |
| publicação gera JSON imutável por SHA-256 | `artifactStore.js`; migrations do plano de artefatos | `authoring-artifact-store.test.js`; teste Deno de revisões | demonstrado; máximo 32 MiB e TUS acima de 6 MiB |
| PostgreSQL guarda a árvore integral de toda publicação | plano de artefatos e `artifactStore.js` | testes de catálogo e artefato | não oferecido; o banco guarda descritor e relação; bytes ficam no Storage |
| objeto órfão é removido imediatamente | `artifactGarbageCollector.js`; migration de GC | `artifact-garbage-collector.test.js` | não oferecido; coleta usa tombstone, lotes e idade mínima padrão de sete dias |
| hash prova autoria e qualidade | canonicalização e SHA-256 | testes de hash | não oferecido; hash prova identidade dos bytes, não autoria ou mérito |
| estado instrucional persiste objetos imutáveis e versionados sob CAS | migrations `20260815193000_parameterized_authoring_design.sql` e `20260815230000_authoring_blueprint_artifact_receipt.sql`; módulos de `src/authoring/`; `authoringDesignService.js` | `instructional-design-domain-v1.test.js`; `parameterized-authoring-design-pglite.test.js`; `authoring-design-service.test.js`; `authoring-mcp.test.js` | demonstrado com limite; blueprint e binding são imutáveis, apenas o apontador corrente é mutável; MCP/Action e a projeção visual responsiva usam o mesmo estado |
| lista e Mapa mostram estado autoral canônico sem depender de cache visitado | `20260815233000_authoring_product_state_projection.sql`; `workspaceEngine.js`; `workspaceContinuity.js`; `authoringWorkspaceProjection.js` | `authoring-product-state-pglite.test.js`; `authoring-workspace-continuity.test.js`; `authoring-workspace-view-model.test.js` | demonstrado para planejamento, análise, materialização, finding e pronto; estado é de processo, não score de qualidade |
| Autoria tem paridade funcional no celular, desktop e APK | `AuthoringWorkspaceSurface.js`; `renderAuthoringWorkspace.js`; `public/styles.css`; `public/main.js` | `authoring-workspace-surface.spec.js`; testes de retorno e Android | demonstrado nas jornadas e viewports cobertos; compreensibilidade por pessoa leiga permanece teste humano, acompanhado no estado corrente |
| editor de Resources preserva conjunto exato entre páginas e escopos | `AuthoringWorkspaceClient.js`; `WorkspaceDesignOfflineStore.js`; view `resource_set`; `AuthoringWorkspaceSurface.js` | testes de client/store; `authoring-design-service.test.js`; `authoring-workspace-surface.spec.js` | demonstrado com seleção progressiva e resultados parciais explícitos; disponibilidade não obriga uso e não configura cards individualmente |
| Analytics são versionados, não punitivos e exportáveis | migration `20260817120000_authoring_analytics.sql`; `authoringAnalytics.js`; serviço app-only `authoringAnalyticsService.js`; destino Resultados | PGlite integrado de outcome/pseudônimo/pins; testes domain/service/client/VM; Playwright 360/390/412/1280; pgTAP `070_authoring_analytics_test.sql` | demonstrado nos cenários proporcionais: gráfico e tabela partilham valores, quatro datasets são pinados e Resources permanecem explícitos; não demonstra validade das medidas, escala nem avaliação humana |
| GC do desenho apaga qualquer artefato antigo | `private.prune_authoring_design_state_v1` | `parameterized-authoring-design-pglite.test.js` | não oferecido; somente versões substituídas, antigas e sem referência são elegíveis; manifestos são preservados |

## 6. Identidade, RLS, MCP e API de Curso

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| dados pessoais são isolados por JWT, RLS e RPC | migrations, políticas e cliente Auth | pgTAP, PostgREST e smoke com duas contas | demonstrado nos fluxos cobertos |
| uma estrutura persistente pode surgir sem caso de uso revisado | `auditVerticalParity.mjs`; registro canônico de Estudo, Autoria, pessoas/acesso, componentes e transportes; inventário exato versionado de relações, funções, índices, restrições, triggers, policies, estado RLS e buckets | `vertical-parity-audit.test.js`; comparação do PostgreSQL após `db reset` na CI | não oferecido: todo objeto novo falha até regeneração e revisão explícitas; o inventário pós-`20260817160000` contém 1.820 objetos, liga 226 objetos canônicos aos cinco casos correntes e mantém 1.594 objetos físicos substituídos em remoção por #130; o catch-all interno não sobrepõe relações correntes, mas a classificação estrutural não demonstra necessidade de produto nem correção da regra SQL |
| termo abolido, decisão incompleta ou alias de legado pode entrar no estado corrente | `docs/evidence/terminologia-canonica.v1.json`; `scripts/auditTerminology.mjs`; documento humano derivado `docs/vocabulario-controlado.md` | `tests/runtime/terminology-audit.test.js`; `npm run audit:terminology` | não oferecido: cada ficha exige termos de interface e domínio, equivalente inglês, símbolo-alvo, definição, exemplo, risco, alternativas específicas, fontes, impacto de migração, issue e não sinônimos; `cutoverStatus` descreve apenas o corte terminológico, corte pendente exige `removeBy` e decisão concluída falha diante de símbolo abolido fora de migrations e evidência histórica; aliases, fallbacks e boilerplate são rejeitados; a imagem continua hipótese visual não implementada |
| compartilhar um Curso exige papel, capability ou recipiente institucional | `course_access`; `CourseAuthoringSurface.js`; `gerirPessoas` | `course-identity-cutover-pglite.test.js`; `course-authoring-surface.test.js`; `course-mcp-tools.test.js` | não oferecido: propriedade é direta e a concessão explícita permite somente Estudo; Autoria e MCP listam apenas Cursos próprios |
| MCP usa Streamable HTTP sem sessão de servidor | `mcpServer.js`; função `aralearn-authoring-mcp` | testes runtime, Deno e jornada MCP | demonstrado: protocolo `2025-11-25`, JSON-RPC e sem `MCP-Session-Id`; corpo até 1 MiB e resposta total até 2 MiB |
| MCP aceita credencial estática de autoria | servidor MCP e segurança | testes OAuth e smoke local | não oferecido; exige access token OAuth do recurso protegido |
| aplicativo e MCP mantêm operações ou motores paralelos | `courseMcpTools.js`; `courseToolExecutor.js`; `courseApiServer.js`; `mcpServer.js` | `course-mcp-tools.test.js`; `course-tool-executor.test.js`; `course-api-server.test.js`; `course-mcp-server.test.js` | não oferecido: os dois transportes usam as mesmas seis ferramentas, o mesmo executor e o mesmo estado de Curso; o guardrail rejeita `applicationTools` |
| MCP aceita credencial do aplicativo ou fachada confidencial paralela | descoberta OAuth do MCP e sessão normal do aplicativo | `course-mcp-server.test.js`; `course-api-server.test.js` | não oferecido: o MCP exige seu token OAuth; o aplicativo usa a sessão autenticada corrente e origens CORS exatas |
| o assistente lê e altera o Curso por operações agrupadas e contratos fechados | `courseMcpTools.js`; `courseRouter.js`; `courseSupabaseAdapter.js` | `course-mcp-tools.test.js`; `course-router.test.js`; `course-supabase-adapter.test.js` | demonstrado no corte corrente: listar, ler paginado, criar, alterar sob CAS, gerir perfil/acesso e consultar componentes; não existe ferramenta exclusiva do aplicativo |
| system prompt fica estável e ciência/políticas entram por knowledge JIT | prompts em `authoring/platforms/`; `authoringKnowledge.js`; oito chunks em `authoring/knowledge/` | `authoring-contextual-planning-guidance.test.js`; `authoring-guidance-regression.test.js`; `testAuthoringPackages.mjs` | demonstrado com limite: seleção determinística de até oito trechos; os cenários A–H são regressão de engenharia, não validação educacional |
| descoberta sob snapshot obedece aos `ResourceSet`s persistidos | `resourceCatalogAccess.js`; `resourceCatalog.js`; `authoringDesignService.js` | `resource-catalog-access.test.js`; `authoring-mcp.test.js` | demonstrado: busca filtrada, inspeção/contrato recusados fora do conjunto e autorizer explícito; sem contexto permanece `legacy_unrestricted` sem alegação de conformidade |
| secret key entra no site ou APK | runtime config, ambiente de função e verificador de artefato | testes de ambiente/deployment/Android | não oferecido; clientes recebem apenas URL e publishable key |
| callback customizado Android prova propriedade do aplicativo | Auth client e manifesto Android | testes de callback | não oferecido; PKCE protege a troca, mas App Link HTTPS é necessário contra interceptação/DoS |

## 7. Assistência contextual por API

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| seleção delimita caminhos graváveis | `cardAssistanceScope.js`; `bottomUpAssistanceScope.js` | testes de operações e sync scope | demonstrado; contexto não selecionado é somente leitura |
| edição textual expõe apenas rótulos declarados | registry e renderer de edição | `package-card-assistance.test.js`; E2E de card assistance | demonstrado |
| provider pode gravar qualquer JSON que retornar | escopo e validação semântica | testes de assistência | não oferecido; `edit_text` limita caminhos e recomposição exige contrato completo |
| conversa admite iteração e navegação de versões | ledger e navigation | testes de ledger/navigation | demonstrado com limite: até oito turnos e nove versões; novo ramo elimina redo abandonado |
| conversa é proveniência persistida e sincronizada | ledger e local state | testes de estado local | não oferecido; prompts/respostas são voláteis; somente mudança aceita segue a persistência do curso |
| pedido pode criar conteúdo fora do escopo | bottom-up runtime | testes runtime e E2E | não oferecido; até oito cards na microssequência e no máximo uma nova microssequência quando a lição é o escopo |
| contexto e resposta são ilimitados | bottom-up runtime e políticas de provider | testes de UI/política | não oferecido; prompt 12 mil, envelope 64 mil, índice 48 itens e limites por card; até duas tentativas |

## 8. Front-end, offline e acessibilidade

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| Play avalia e avança sem aguardar a rede | `studyCardProgression.js`; `lessonEditorApp.js` | `tests/e2e/study-card-progression.spec.js` | demonstrado inclusive com rede pendente e CPU reduzida |
| troca de tema depende de requisição | tokens e resolução local de tema | jornadas visuais/de estudo | não oferecido; preferência e aplicação são locais |
| abrir curso oficial equivale a selecioná-lo | painel e controlador de Trilhas | `learning-spaces-panel.spec.js` | não oferecido; seleção possui ação própria |
| edição manual apresenta só textos do package | `renderPackageCard.js`; `editableTargets()` | `card-assistance.spec.js`; testes kernel | demonstrado |
| claro e escuro compartilham semântica visual | tokens e packages | galeria visual, E2E de packages | demonstrado nas fixtures e viewports cobertas |
| todos os usuários compreenderão toda representação | UI e packages | requer ensaios de leitura e usabilidade | avaliação externa |
| WCAG integral está certificada | sistema visual e testes automatizados | auditorias e jornadas | avaliação externa; automação cobre critérios selecionados, não certificação completa |

## 9. Implantação e artefatos

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| web e Android executam o mesmo aplicativo web | `public/`; Android; scripts de build | testes Android e `verifyDeploymentArtifacts.ps1` | demonstrado para o pipeline corrente |
| qualquer backend SQL substitui Supabase | cliente, migrations e Edge Functions | `validate:cutover`; smoke remoto | não oferecido; Auth, RLS, PostgREST, Storage e funções integram o contrato operacional |
| build contém apenas configuração pública | scripts de build e runtime config | verificador de Pages/Android | demonstrado nos artefatos examinados; segredo operacional ainda exige disciplina externa |
| versão do APK equivale à versão do contrato | `package.json`, Gradle e contracts | testes de versão | não oferecido; são ciclos diferentes |
| downloads de autoria são fontes primárias | `authoring/`; builder de packages | `test:authoring-packages` | não oferecido; `docs/downloads/authoring/` é saída derivada |
| `npm test` demonstra todos os requisitos | `package.json`; runners | suíte geral | não oferecido; não cobre pessoas, operação prolongada, custo ou disponibilidade futura |

## 10. Validações de referência

```powershell
npm.cmd run lint
npm.cmd test
npm.cmd run test:e2e
npm.cmd run validate:example
npm.cmd run validate:cutover
npm.cmd run catalog:validate
npm.cmd run audit:frontend
npm.cmd run audit:residues
npm.cmd run audit:docs
npm.cmd run audit:parity
npm.cmd run audit:terminology
```

Durante a evolução da Autoria, a validação intermediária é proporcional ao
risco: começa por verificações estáticas e testes do comportamento alterado,
avança para a integração da fatia vertical e concentra a regressão integral em
mudanças que atravessam várias camadas, marcos de fechamento e releases. Uma
suíte ampla já aprovada não é repetida sem mudança de código, fixture,
dependência, ambiente ou outro insumo relevante. A execução integral é
registrada com data e commit no [estado corrente](estado-atual-e-roadmap.md).
Isso não permite concluir uma etapa com teste focado falhando nem alegar
integração ainda não exercitada.
Para o banco parametrizado, o ensaio autocontido está em
`tests/runtime/parameterized-authoring-design-pglite.test.js`; o complemento de
RLS/PostgREST no stack Supabase está em
`supabase/tests/040_parameterized_authoring_design_test.sql` e não deve ser dado
como executado quando CLI ou `psql` não estiverem disponíveis.

O ensaio experimental autocontido está em
`tests/runtime/authoring-experiments-pglite.test.js`; o complemento estrutural e
de RLS está em `supabase/tests/060_authoring_experiments_test.sql`. Testes de
software demonstram fences, replay, privacidade e identidade do artefato, mas
não autorizam afirmar validade causal, qualidade do instrumento ou efeito de
aprendizagem.

Quando banco ou funções mudarem, acrescente `validateLocalSupabase.ps1`; quando o ambiente remoto mudar, execute smoke hospedado; quando site ou APK mudar, examine os artefatos finais.

## 11. Como manter a matriz

Ao alterar uma propriedade:

1. reescreva a afirmação de modo observável;
2. identifique a fonte normativa da regra;
3. acrescente teste capaz de falhar diante da regressão;
4. registre limite e cenário não coberto;
5. evite contagens e datas que não sejam geradas automaticamente;
6. não transforme ausência de teste em alegação de conformidade.

Saídas derivadas são regeneradas a partir das fontes. Avaliação pedagógica, acessibilidade com participantes, segurança independente e custo em produção pertencem a protocolos próprios e não devem ser convertidos em “demonstrado” apenas porque a suíte técnica passou.
