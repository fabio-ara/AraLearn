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
| `aralearn.course.v1` aceita `contract`, `scope` opcional e `courses` | `src/domain/aralearnProject.js`; `src/domain/courseEntities.js` | `tests/runtime/aralearn-project-strict.test.js`; `tests/runtime/course-entities.test.js` | demonstrado; Microssequências usam `studyUnits`, e a forma da raiz não substitui invariantes profundos do validador |
| o kernel valida o mesmo contrato para um Curso unitário | `src/resources/kernel/courseContract.js` | `tests/kernel/resource-package-kernel.test.js` | demonstrado; a forma unitária não cria outro nome de contrato |
| Unidades de estudo usam slots e instâncias `package@version` | `src/resources/kernel/studyUnitEnvelope.js`; `src/resources/kernel/packageRegistry.js` | `tests/kernel/resource-package-kernel.test.js`; `tests/kernel/resource-package-edge.test.js` | demonstrado; teoria exige conteúdo e prática exige resposta |
| `StudyUnit.sources` continua como compatibilidade do conteúdo | validadores de `aralearn.course.v1`; `courseEntities.js`; migration `20260817190000_course_sources_provenance.sql` | testes de contrato, corte e composição | não oferecido: `sources` é rejeitado sem alias, fallback ou leitura dupla; atribuições vivem fora do envelope |
| package novo entra pelo registry sem branch no kernel | `src/resources/packages/generated.js`; `src/resources/kernel/packageRegistry.js` | `tests/kernel/resource-package-autoindex.test.js`; `tests/kernel/resource-package-kernel.test.js` | demonstrado para packages que cumprem a interface; índice derivado precisa ser regenerado |
| manifest, contrato autoral, schema e renderer têm papéis separados | `src/resources/packages/*/index.js`; `src/resources/kernel/packageRegistry.js` | testes do registry, catálogo e kernel de packages | demonstrado |
| descoberta usa `aralearn.resource-library.v1` | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js`; `tests/runtime/authoring-mcp.test.js` | demonstrado; o protocolo não transporta árvore de curso |
| busca entrega lista curta e contratos sob demanda | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js`; `tests/runtime/authoring-catalog-search-v5.test.js` | demonstrado: busca padrão 12, máximo 32; inspeção 8; contratos exatamente 1 por chamada |
| `canonical`, `versatile` e `substitute` representam cobertura calculada | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js` | demonstrado; não certifica consenso acadêmico externo |
| o validador implementa todo JSON Schema 2020-12 | `src/resources/kernel/schemaValidation.js` | `tests/kernel/resource-package-kernel.test.js` | não oferecido; apenas o subconjunto documentado é aceito |
| auditoria catalográfica reproduz layout real | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js` | não oferecido; `rendered: false`; layout exige navegador e motores reais |
| contratos, packages, catálogo, IndexedDB, MCP e app possuem versões próprias | registry, catálogo, store, servidor MCP e `package.json` | testes de cada fronteira | demonstrado; `revision` é CAS e `cursor` é paginação, não versão de contrato |
| catálogo pedagógico aceita somente quatro definições versionadas | `src/domain/courseDesignParameters.js`; migration `20260817180000_course_design_parameters.sql` | `course-design-parameters.test.js`; PGlite e PostgreSQL focais | demonstrado com limite: inteiros e conjuntos fechados têm schema próprio; defaults são hipóteses do produto, não valores ótimos da literatura |
| valor efetivo conserva origem, fonte e herança sem copiar atribuições | resolvedor comum de `courseDesignParameters.js`; mudanças append-only no PostgreSQL | testes de Curso→Lição→Microssequência, clear, no-op, CAS e replay | demonstrado: `author|research_condition` mais próximo precede `automatic` mais próximo e `system_default`; condição de pesquisa é proveniência, não lock |
| orientação original e interpretação automatizada permanecem separadas | `course_authoring_guidance_revisions`; `course_authoring_guidance_interpretations` | domínio, PGlite, Edge/MCP e jornada visual | demonstrado: pilha Curso→alvo, revisão original imutável, interpretação ligada por UUID exato e nova revisão sem reaproveitamento silencioso |
| itens de análise e evidência são atribuídos explicitamente por Microssequência | `course_design_target_plan_items`; `targetPlanItems`; `set_target_plan_items` | domínio, PGlite, Edge/MCP e jornada visual multi-alvo | demonstrado: relação muitos-para-muitos, FKs do mesmo Curso, substituição atômica das duas listas e `null` fora do escopo de Microssequência |
| Fontes e Âncoras possuem revisões e atribuições exatas por alvo | `src/domain/courseSources.js`; cinco relações `private.course_source_*`; contratos `aralearn.course-sources.v1` e `aralearn.course-source-change.v1` | `course-sources.test.js`; PGlite, PostgreSQL, Edge/MCP e jornada da sexta área | demonstrado: escrita nova substitui conjunto ordenado, exige Âncora ativa/exata, limita 32 Fontes por alvo e oito identidades de Âncora por revisão de Fonte e preserva histórico append-only |
| legado de Fontes é completado por inferência ou por nova identidade | migration `1900`; revisão `unresolved_legacy`; relação `legacy_reference` | corte focal, hashes e casos de resolução in-place | não oferecido: identidade literal e ordem são preservadas, metadados permanecem nulos/ocultos e resolver acrescenta revisão ativa sob a mesma identidade |
| política de componentes separa disponibilidade, exclusão, preferência e uso | `course_component_policy_changes`; catálogo executável `1-3e5629f8`; validação do lote de materialização | domínio, PGlite, adapter e teste de componente proibido | demonstrado: exclusão vence, `allow_only` limita e preferência não autoriza; referências usadas são confrontadas na mesma transação |
| contexto aplicado é derivado pelo servidor, não declarado pelo cliente | `courseDesignParameters.js`; `courseSources.js`; `start` de materialização; hash do `aralearn.course-design-context.v2` | testes de contexto multi-alvo, Fontes, hash, rollback e retry | demonstrado com limite: catálogos selam `{id,position,statement,version}`, cada alvo referencia seus IDs e Fontes/Âncoras atribuídas, e a etapa é auditada somente contra esse subconjunto |
| aplicação factual separa declaração pedagógica de reconciliação material | auditor `auditDesignApplication`; `assert_course_design_application_materialized_v1` | casos de schema, pertencimento, contagem, alvo, lote e componente proibido | demonstrado com limite: formas, oportunidades e variações são declarações validadas internamente; o banco reconcilia materialmente apenas IDs de Unidades, pai/alvo e `componentRefs` |
| regressão de densidade não usa caracteres como proxy | fixture DNS/DHCP e auditor `auditDesignApplication` | casos teto/7 de 7/formas/prática e metamórficos longo-claro, curto-denso, divisão cosmética e omissão | demonstrado sobre os fatos declarados no cenário codificado; não é análise semântica independente, não mede aprendizagem nem inventa dependência ausente do plano |
| experimento, variante, lock e inferência causal fazem parte deste marco | documentação de roadmap e fronteiras sem RPC/UI corrente | scanner de runtime e inventário vertical | não oferecido; `research_condition` registra apenas origem da decisão, sem protocolo, lock, assignment ou alegação causal |

## 3. Representações e interação

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| packages expõem texto acessível, edição e alvos de prática | `src/resources/kernel/packageRegistry.js`; packages instalados | testes do kernel e de package | demonstrado para o registry corrente |
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
| conteúdo já materializado pode ser estudado sem rede | repositórios de Curso e estado pessoal | testes de `CourseStudy*`, controller e estado pessoal | demonstrado; login inicial, primeiro download e serviços remotos continuam online |
| desenho sincronizado pode ser lido offline sem virar autoridade | `src/persistence/WorkspaceDesignOfflineStore.js`; `syncState` | `tests/runtime/workspace-design-offline-store.test.js` | demonstrado: fatias por microssequência; fila apenas para override manual/Auto, separada do snapshot e revalidada remotamente |
| revisão remota só substitui a local depois de contrato e hash válidos | `src/sync/RelationalSyncEngine.js`; `canonicalCourseHash.js` | `tests/runtime/relational-sync.test.js`; `integrated-course-sync.test.js` | demonstrado; falha conserva a projeção anterior |
| todas as mutações usam uma outbox universal | `DomainMutationService.js`; sync engine; repositórios contextuais | testes de sync e estado pessoal | não oferecido; seleção, trilhas, estado e autoria têm protocolos limitados próprios |
| mutação repetida não duplica efeito dentro de sua janela | sync engine e RPCs de idempotência | testes de sync integrado e PGlite | demonstrado com limite; retenções variam por família |
| dispositivo ausente indefinidamente pode reproduzir todo feed | compactação e bootstrap | testes de retenção/sync | não oferecido; após a janela segura, novo bootstrap pode ser necessário |

## 5. Curso, concorrência e materialização

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| Curso vivo e entidades usam CAS e diferenças reais | `public.courses`; `private.course_entities`; `commit_course_composition_for_actor_v1` | PGlite, PostgreSQL real, Router/Adapter e smokes com duas contas | demonstrado; conflito exige reler, no-op não avança revisão e eventos não restauram documento passado |
| plano e Partes são relações próprias, não documento monolítico | `course_instructional_plans`, itens, Partes e vínculos | domínio, PGlite, API/MCP e E2E de Autoria | demonstrado; posição da Parte não altera ordem curricular e remover vínculo não apaga conteúdo |
| materialização é retomável e confirma etapa atomicamente | tentativas, até 64 etapas, leitura detalhada owner-only e `advance_part_materialization` | PGlite, Router/Adapter/MCP e E2E visual | demonstrado com limites de versão, bytes e mudanças; contexto e fatos não são transcrição de chat |
| composição pode gravar Unidade sem declarar o conjunto de Fontes | `commit_course_composition_for_actor_v1`; `sourceAttributionApplications` | domínio, PGlite, Router/Adapter e replay | não oferecido: cada upsert de Unidade exige exatamente uma aplicação, inclusive vazia; entidade, atribuição, evento e recibo confirmam juntos |
| materialização pode atribuir Fonte fora do contexto selado | `aralearn.course-design-context.v2`; `aralearn.course-source-attribution-application.v1` | casos de revisão/Âncora fora do contexto, rollback e retry | não oferecido: aplicação, entidades, vínculo, atribuições, etapa, evento e recibo formam uma transação; o resultado guarda hash e contagens, não uma cópia da aplicação |
| repetir `requestId` com mesmo comando recupera recibo | `course_change_receipts` e executor comum | testes de resposta perdida, replay, conflito de hash e expiração | demonstrado dentro da janela; chave divergente é conflito |
| objetos físicos do runtime anterior constituem capacidade corrente | inventário vertical marcado `pre-course-database-removal` | `auditVerticalParity.mjs` e PostgreSQL pós-reset | não oferecido; não possuem rota/grant/UI/MCP corrente e serão removidos pela #130 |

## 6. Identidade, RLS, MCP e API de Curso

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| dados pessoais são isolados por JWT, RLS e RPC | migrations, políticas e cliente Auth | pgTAP, PostgREST e smoke com duas contas | demonstrado nos fluxos cobertos |
| corte pode preservar contagem de Fontes e trocar identidade ou ordem | `sourceReferenceHash` sobre `{studyUnitId,sourceOrdinal,sourceId}`; atestações `prepared|verified` | corte focal e comparação origem/artefato/pós-`1900` | não oferecido: identidade literal, ordem e hash precisam coincidir junto com `documentHash`, `rowHash`, `entityStateHash` e contagens |
| uma estrutura persistente pode surgir sem caso de uso revisado | `auditVerticalParity.mjs`; registro canônico de Estudo, Autoria, proveniência, pessoas/acesso, componentes e transportes; inventário exato versionado de relações, funções, índices, restrições, triggers, policies, estado RLS e buckets | `vertical-parity-audit.test.js`; comparação do PostgreSQL após `db reset` na CI | não oferecido: todo objeto novo falha até regeneração e revisão explícitas; o inventário pós-`20260817190000` contém 2.010 objetos, liga 416 aos seis casos correntes (`course-authoring-experience` 272, `course-source-provenance` 84, `study-course-experience` 25, `person-profile-and-course-access` 31, `didactic-component-runtime` 1 e `course-shared-transports` 3) e mantém 1.594 em `pre-course-database-removal`, como objetos físicos substituídos sob remoção pela #130; o catch-all interno não sobrepõe relações correntes, mas a classificação estrutural não demonstra necessidade de produto nem correção da regra SQL |
| Estudo recebe catálogo, histórico ou campos privados de Fonte | `get_course_study_citations_v1`; `aralearn.course-study-citations.v1` | casos hidden/unresolved, citation sem URL, citation_and_link, 404/revogação e DTO estrito | não oferecido: a leitura é lazy por Unidade e omite trecho de verificação, ator, canal, histórico e edição; atribuição por alvo não prova autoria nem cadeia W3C completa |
| termo abolido, decisão incompleta ou alias de legado pode entrar no estado corrente | `docs/evidence/terminologia-canonica.v1.json`; `scripts/auditTerminology.mjs`; documento humano derivado `docs/vocabulario-controlado.md` | `tests/runtime/terminology-audit.test.js`; `npm run audit:terminology` | não oferecido: cada ficha exige termos de interface e domínio, equivalente inglês, símbolo-alvo, definição, exemplo, risco, alternativas específicas, fontes, impacto de migração, issue e não sinônimos; `cutoverStatus` descreve apenas o corte terminológico, corte pendente exige `removeBy` e decisão concluída falha diante de símbolo abolido fora de migrations e evidência histórica; aliases, fallbacks e boilerplate são rejeitados; a imagem continua hipótese visual não implementada |
| compartilhar um Curso exige papel, capability ou recipiente institucional | `course_access`; `CourseAuthoringSurface.js`; `gerirPessoas` | `course-identity-cutover-pglite.test.js`; `course-authoring-surface.test.js`; `course-mcp-tools.test.js` | não oferecido: propriedade é direta e a concessão explícita permite somente Estudo; Autoria e MCP listam apenas Cursos próprios |
| Inspeção visual e MCP podem divergir em escopo, âncora, cursor ou link | `CourseInspectionSequence.js`; vista MCP `study_units`; `list_owned_course_study_units_for_actor_v1` | `course-inspection-sequence.test.js`; `course-mcp-tools.test.js`; `course-router.test.js`; ensaio PostgreSQL focal | não oferecido: ambos usam a mesma leitura owner-only, revisão esperada, escopos curriculares e de Parte, âncora inclusiva e cursor `{studyUnitId}` |
| MCP usa Streamable HTTP sem sessão de servidor | `mcpServer.js`; função `aralearn-authoring-mcp` | testes runtime, Deno e jornada MCP | demonstrado: protocolo `2025-11-25`, JSON-RPC e sem `MCP-Session-Id`; corpo até 1 MiB e resposta total até 2 MiB |
| MCP aceita credencial estática de autoria | servidor MCP e segurança | testes OAuth e smoke local | não oferecido; exige access token OAuth do recurso protegido |
| aplicativo e MCP mantêm operações ou motores paralelos | `courseMcpTools.js`; `courseToolExecutor.js`; `courseApiServer.js`; `mcpServer.js` | `course-mcp-tools.test.js`; `course-tool-executor.test.js`; `course-api-server.test.js`; `course-mcp-server.test.js` | não oferecido: os dois transportes usam as mesmas seis ferramentas, o mesmo executor e o mesmo estado de Curso; o guardrail rejeita `applicationTools` |
| MCP aceita credencial do aplicativo ou fachada confidencial paralela | descoberta OAuth do MCP e sessão normal do aplicativo | `course-mcp-server.test.js`; `course-api-server.test.js` | não oferecido: o MCP exige seu token OAuth; o aplicativo usa a sessão autenticada corrente e origens CORS exatas |
| o assistente lê e altera o Curso por operações agrupadas e contratos fechados | `courseMcpTools.js`; `courseRouter.js`; `courseSupabaseAdapter.js` | `course-mcp-tools.test.js`; `course-router.test.js`; `course-supabase-adapter.test.js` | demonstrado no corte corrente: listar, ler paginado, criar, alterar sob CAS, gerir perfil/acesso e consultar componentes; não existe ferramenta exclusiva do aplicativo |
| system prompt fica estável e ciência/políticas entram por knowledge JIT | prompts em `authoring/platforms/`; `authoringKnowledge.js`; oito chunks em `authoring/knowledge/` | `authoring-contextual-planning-guidance.test.js`; `authoring-guidance-regression.test.js`; `testAuthoringPackages.mjs` | demonstrado com limite: seleção determinística de até oito trechos; os cenários A–H são regressão de engenharia, não validação educacional |
| secret key entra no site ou APK | runtime config, ambiente de função e verificador de artefato | testes de ambiente/deployment/Android | não oferecido; clientes recebem apenas URL e publishable key |
| callback customizado Android prova propriedade do aplicativo | Auth client e manifesto Android | testes de callback | não oferecido; PKCE protege a troca, mas App Link HTTPS é necessário contra interceptação/DoS |

## 7. Assistência contextual por API

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| seleção delimita caminhos graváveis | `cardAssistanceScope.js`; `bottomUpAssistanceScope.js` | testes de operações e sync scope | demonstrado; contexto não selecionado é somente leitura |
| edição textual expõe apenas rótulos declarados | registry e renderer de packages | testes do kernel e de edição | demonstrado no contrato dos packages; a edição contextual ainda não está acessível na superfície canônica de Curso |
| provider pode gravar qualquer JSON que retornar | escopo e validação semântica | testes de assistência | não oferecido; `edit_text` limita caminhos e recomposição exige contrato completo |
| conversa admite iteração e navegação de versões | ledger e navigation | testes de ledger/navigation | demonstrado com limite: até oito turnos e nove versões; novo ramo elimina redo abandonado |
| conversa é proveniência persistida e sincronizada | ledger e local state | testes de estado local | não oferecido; prompts/respostas são voláteis; somente mudança aceita segue a persistência do curso |
| pedido pode criar conteúdo fora do escopo | domínio de autoria e operações MCP | testes de Router, MCP e domínio | não oferecido; toda mutação exige Curso próprio, revisão corrente e lote explícito |
| contexto e resposta são ilimitados | Router, ferramentas MCP e políticas de payload | testes de transporte, Router e limites | não oferecido; pedido até 1 MiB e projeções/lotes possuem limites menores; Inspeção falha acima de 1,75 MiB |

## 8. Front-end, offline e acessibilidade

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| Estudo avalia e avança sem aguardar a rede | `CourseStudyApplication.js`; `CoursePersonalStateRepository.js` | testes de Estudo e estado pessoal | demonstrado nos cenários cobertos; envio remoto permanece assíncrono |
| troca de tema depende de requisição | tokens e resolução local de tema | jornadas visuais/de estudo | não oferecido; preferência e aplicação são locais |
| Inspeção carrega o Curso inteiro ou cresce o DOM sem limite | `CourseInspectionSequence.js`; cache no `CourseController.js`; RPC de Inspeção | `course-inspection-sequence.test.js`; testes de controller/API e PostgreSQL | não oferecido: página normal 12, máximo 24, janela de até 36 Unidades, cache de quatro páginas ou 8 MiB por Curso e resposta de até 1,75 MiB; aceite visual ainda exige 360/390/430 px e desktop |
| fallback offline pode misturar revisão, escopo ou cursor | cache e posição local da Inspeção | testes de controller e sequência | não oferecido: somente pedido exato é reutilizado e marcado stale/offline; revisão reancora por identidade e revogação purga o estado privado |
| abrir ou navegar no Estudo carrega todas as Fontes | `CourseStudyApplication.js`; `CourseStudyRepository.js`; painel de citações | testes Study e E2E de Fontes | não oferecido: não há requisição antes de abrir; cache vale para a Unidade/revisão corrente, e mudança, 404 ou revogação limpam o estado |
| Autoria de Fontes exige editar JSON | `CourseSourcesPanel.js`; Planejamento e Inspeção | runtime focal e E2E em 360/390/430/1280 | não oferecido: catálogo, revisão, aposentadoria, Âncoras e conjunto completo usam formulários naturais; aceitar layout automatizado não substitui ensaio humano |
| abrir curso oficial equivale a selecioná-lo | painel e controlador de Trilhas | `learning-spaces-panel.spec.js` | não oferecido; seleção possui ação própria |
| edição manual apresenta só textos do package | `renderPackageStudyUnit.js`; `editableTargets()` | testes do kernel e de renderização de Unidade | demonstrado no renderer; edição contextual continua futura na superfície canônica de Curso |
| claro e escuro compartilham semântica visual | tokens e packages | galeria visual, E2E de packages | demonstrado nas fixtures e viewports cobertas |
| todos os usuários compreenderão toda representação | UI e packages | requer ensaios de leitura e usabilidade | avaliação externa |
| WCAG integral está certificada | sistema visual e testes automatizados | auditorias e jornadas | avaliação externa; automação cobre critérios selecionados, não certificação completa |

## 9. Implantação e artefatos

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| web e Android executam o mesmo aplicativo web | `public/`; Android; scripts de build | testes Android e `verifyDeploymentArtifacts.ps1` | demonstrado para o pipeline corrente |
| qualquer backend SQL substitui Supabase | cliente, migrations e Edge Functions | `validate:cutover`; smoke remoto | não oferecido; Auth, RLS, PostgREST, Storage e funções integram o contrato operacional |
| build contém apenas configuração pública | scripts de build e runtime config | verificador de Pages/Android | demonstrado nos artefatos examinados; segredo operacional ainda exige disciplina externa |
| limites de Fontes demonstram sustentabilidade no Free Plan | páginas de 24/256 KiB, 32 vínculos por alvo, oito identidades de Âncora por revisão, citações lazy e metadados/URLs no PostgreSQL | testes de limites e medição operacional futura | não oferecido: os caps limitam cada operação, mas crescimento append-only, banco, egress, Storage e funções exigem série real |
| versão do APK equivale à versão do contrato | `package.json`, Gradle e contracts | testes de versão | não oferecido; são ciclos diferentes |
| downloads de autoria são fontes primárias | `authoring/`; builder de packages | `test:authoring-packages` | não oferecido; `docs/downloads/authoring/` é saída derivada |
| `npm test` demonstra todos os requisitos | `package.json`; runners | suíte geral | não oferecido; não cobre pessoas, operação prolongada, custo ou disponibilidade futura |
| Fontes implementam observações ancoradas e ciclo de correção | fronteiras do roadmap #124/#125 | inventário de RPC/UI e documentação | não oferecido: #124 reúne observações e Anotação ancorada; #125 implementa achados, correção, revisão e verificação independente |

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
