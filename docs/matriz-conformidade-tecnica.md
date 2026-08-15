# Matriz de conformidade técnica

Uma matriz de conformidade liga uma afirmação sobre o sistema à implementação que pretende realizá-la e ao teste que pode refutá-la. Ela evita que documentação, código e validação evoluam como descrições independentes.

Esta matriz é versionada junto com o repositório. Não fixa contagem de testes nem data de uma execução: esses valores envelhecem sem que a propriedade mude. O resultado de uma rodada deve ser registrado pelo processo de integração ou de release.

## 1. Como interpretar

| Estado | Significado |
|---|---|
| demonstrado | código e teste citado cobrem a propriedade no escopo descrito |
| demonstrado com limite | a propriedade existe, mas possui teto, janela ou cenário não coberto |
| proposta conceitual verificada | contrato exploratório e fixtures cobrem a forma proposta, sem integração à produção |
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
| busca entrega lista curta e contratos sob demanda | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js`; `tests/runtime/authoring-catalog-search-v5.test.js` | demonstrado: busca padrão 12, máximo 32; inspeção 8; contratos 4 |
| `canonical`, `versatile` e `substitute` representam cobertura calculada | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js` | demonstrado; não certifica consenso acadêmico externo |
| o validador implementa todo JSON Schema 2020-12 | `src/resources/kernel/schemaValidation.js` | `tests/kernel/resource-package-kernel.test.js` | não oferecido; apenas o subconjunto documentado é aceito |
| auditoria catalográfica reproduz layout real | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js` | não oferecido; `rendered: false`; layout exige navegador e motores reais |
| contratos, packages, catálogo, IndexedDB, MCP e app possuem versões próprias | registry, catálogo, store, servidor MCP e `package.json` | testes de cada fronteira | demonstrado; `revision` é CAS e `cursor` é paginação, não versão de contrato |
| a proposta de desenho separa análise, definição, atribuição, valores efetivos, manifesto e disponibilidade de resources | `src/authoring/instructionalDesignContracts.js` | `tests/kernel/instructional-design-contracts.test.js`; corpus em `tests/fixtures/pedagogy/` | proposta conceitual verificada; não integra `authoring/schemas/`, persistência, MCP, Action, publicação ou UI |
| parâmetros propostos preservam grandezas não escalares | `DesignParameterDefinition` em `src/authoring/instructionalDesignContracts.js` | casos de inteiro, faixa, categoria, conjunto, vetor e relação no teste focado | proposta conceitual verificada; tipo representável não valida unidade, limite nem decisão pedagógica |
| valor efetivo proposto conserva escopo, definição, atribuição e proveniência exatos | `EffectiveDesignSnapshot` em `src/authoring/instructionalDesignContracts.js` | referências fechadas no teste focado | proposta conceitual verificada; não é snapshot restaurável do workspace e ainda não há resolução ou CAS em produção |
| `ResourceSet` proposto separa disponibilidade, seleção e materialização | `ResourceSet` e `MaterializationManifest` em `src/authoring/instructionalDesignContracts.js` | corpus multidomínio e testes de referência | proposta conceitual verificada; conjunto não escolhe package, não copia contracts e não finge equivalência quando falta representação adequada |
| cards, palavras, caracteres e total de resources são métricas posteriores | `MaterializationManifest` em `src/authoring/instructionalDesignContracts.js` | teste de métricas derivadas e algoritmo versionado | proposta conceitual verificada; métricas descrevem materialização e não comandam decomposição pedagógica |

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

## 6. Auth, RLS, MCP e Action

| Propriedade | Implementação | Verificação | Estado e limite |
|---|---|---|---|
| dados pessoais são isolados por JWT, RLS e RPC | migrations, políticas e cliente Auth | pgTAP, PostgREST e smoke com duas contas | demonstrado nos fluxos cobertos |
| papel nominal concede toda operação sem examinar alvo | adaptador Supabase e migrations de capacidade | testes de acesso e protocolo | não oferecido; papel e relações derivam capacidade e cada operação revalida alvo/estado |
| MCP usa Streamable HTTP sem sessão de servidor | `mcpServer.js`; função `aralearn-authoring-mcp` | testes runtime, Deno e jornada MCP | demonstrado: protocolo `2025-11-25`, JSON-RPC e sem `MCP-Session-Id`; corpo até 32 MiB |
| MCP aceita credencial estática de autoria | servidor MCP e segurança | testes OAuth e smoke local | não oferecido; exige access token OAuth do recurso protegido |
| MCP e Action mantêm dois motores de autoria | `mcpServer.js`; `actionServer.js`; `authoringToolExecutor.js` | testes MCP e Action | não oferecido; são adaptadores sobre registry/executor comuns |
| MCP e Action usam o mesmo fluxo OAuth | `actionOAuthServer.js`; integração MCP | testes do adaptador OAuth | não oferecido; MCP usa PKCE S256; Action usa fachada confidencial apropriada ao cliente |
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
```

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
