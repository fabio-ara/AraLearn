# Matriz de conformidade técnica

Esta matriz confronta afirmações documentais com a implementação observável.
O recorte auditado é a release **0.0.19**, no estado local de **13 de agosto de
2026**. Nenhum SHA é fixado aqui antes do commit que incorpora a própria
documentação.

Ela não certifica propriedades que exigem avaliação externa, teste com pessoas
ou operação prolongada em produção. “Confirmado” significa apenas que há um
caminho de código e uma verificação automatizada coerentes no repositório
corrente; “parcial” explicita limites ou garantias restritas.

As linhas distinguem três naturezas de afirmação:

- **afirmação verificada**: comportamento observável confirmado por código e
  teste citado;
- **limite conhecido**: propriedade que o sistema deliberadamente não oferece,
  teto mensurável ou ponto ainda não demonstrado;
- **decisão de projeto**: escolha arquitetural efetivamente implementada, sem
  pretensão de ser a única solução possível nem evidência científica externa.

Resultados “Confirmado” registram afirmações verificadas. “Não confirmado” e
“Parcial” registram limites conhecidos. São decisões de projeto, em especial,
a separação kernel/package, o armazenamento endereçado por conteúdo, CAS sem
merge silencioso, os canais de sincronização separados, MCP sem sessão, o
executor comum de MCP/Action e o histórico de assistência deliberadamente
volátil.

## Contratos, kernel e catálogo

| Afirmação verificável | Evidência de implementação | Verificação | Resultado e limite |
| --- | --- | --- | --- |
| O envelope operacional aceita `contract`, `scope` opcional e `courses`. | `src/domain/aralearnProject.js`; `authoring/schemas/workspace-envelope.schema.json` | `tests/runtime/aralearn-project-strict.test.js`; `tests/kernel/package-contract-editor.test.js` | Confirmado para `aralearn.library.v1`; o schema de raiz não substitui a validação profunda executada em JavaScript. |
| O kernel também expõe um contrato unitário de curso. | `src/resources/kernel/courseContract.js`; `src/resources/kernel/cardEnvelope.js` | `tests/kernel/resource-package-kernel.test.js` | Confirmado para `aralearn.course.v1`; não é o envelope multi-curso persistido/publicado. |
| A descoberta de packages usa protocolo próprio. | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js`; `tests/runtime/authoring-mcp.test.js` | Confirmado para `aralearn.resource-library.v1`; não contém a árvore de curso. |
| Um card possui envelope estável e instâncias versionadas por slot. | `src/resources/kernel/cardEnvelope.js` | `tests/kernel/resource-package-kernel.test.js`; `tests/kernel/resource-package-edge.test.js` | Confirmado. Cards de teoria exigem conteúdo; cards de prática exigem resposta. |
| Um package novo não exige uma ramificação no kernel. | `src/resources/kernel/packageRegistry.js`; `src/resources/packages/generated.js` | `tests/kernel/resource-package-autoindex.test.js`; `tests/kernel/resource-package-kernel.test.js` | Confirmado para packages que satisfazem a interface obrigatória. O índice gerado ainda precisa ser sincronizado pelos scripts do repositório. |
| Manifest, contrato autoral, schema e renderer têm responsabilidades separadas. | `src/resources/kernel/packageRegistry.js`; `src/resources/packages/*/index.js` | `tests/kernel/package-contract-editor.test.js`; `tests/kernel/package-card-assistance.test.js` | Confirmado. O contrato autoral orienta preenchimento; o schema e o validador decidem aceitação estrutural/semântica. |
| A validação de schema é compatível com todas as palavras-chave de JSON Schema 2020-12. | `src/resources/kernel/schemaValidation.js` | `tests/kernel/resource-package-kernel.test.js` | **Não confirmado.** Há um subconjunto explícito de palavras-chave e referências JSON Pointer locais; a documentação não alega conformidade integral com o dialeto. |
| A busca progressiva limita o volume de contratos entregue ao modelo. | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js`; `tests/runtime/authoring-catalog-search-v5.test.js` | Confirmado: busca padrão 12 e máximo 32; inspeção até 8; contratos de até 4 packages por chamada. |
| `canonical`, `versatile` e `substitute` são estados públicos do ajuste. | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js` | Confirmado como tokens de protocolo. `canonical` expressa o resultado do algoritmo de facetas; não certifica consenso acadêmico externo. |
| Contrato, package, catálogo, banco local, protocolo e aplicativo possuem ciclos de versão distintos. | `src/resources/kernel/packageRegistry.js`; `src/resources/catalog/resourceCatalog.js`; `src/persistence/IndexedDbRelationalStore.js`; `supabase/functions/_shared/aralearn-authoring/mcpServer.js`; `package.json` | `tests/kernel/resource-package-kernel.test.js`; `tests/kernel/resource-catalog.test.js`; `tests/runtime/relational-sync.test.js`; `tests/runtime/authoring-mcp.test.js` | Confirmado: identificador de contrato, SemVer de package, `catalogVersion`, versão IndexedDB, versão MCP e versão do app não são intercambiáveis. `revision` é contador de concorrência e `cursor` é marcador de leitura, não outra versão. |
| A auditoria de representação executa uma prévia visual completa. | `src/resources/catalog/resourceCatalog.js` | `tests/kernel/resource-catalog.test.js` | **Não confirmado.** `preview_card` e a auditoria retornam `rendered: false`; viewport, Graphviz, Vega e interação só são avaliados no renderer do app e nas jornadas visuais. |
| Resources instalados passam por corpus, viewport móvel e estresse acadêmico. | `scripts/runResourceCorpusValidation.js`; `scripts/buildAcademicStressCourses.mjs`; `scripts/captureResourceGallery.mjs` | `tests/resource-course/resource-test-matrix.spec.js`; `tests/resource-course/academic-stress-courses.spec.js`; `tests/e2e/package-visuals.spec.js` | Parcial: há testes estruturais e visuais automatizados, mas eles não demonstram adequação pedagógica universal nem cobertura de todas as áreas. |

## Persistência, publicação e operação offline

| Afirmação verificável | Evidência de implementação | Verificação | Resultado e limite |
| --- | --- | --- | --- |
| Cada conta usa namespace local próprio. | `src/persistence/IndexedDbRelationalStore.js` | `tests/runtime/relational-sync.test.js`; `tests/e2e/workspace-offline-authoring.spec.js` | Confirmado: base `aralearn-relational-v4-r3`, versão IndexedDB 4, sufixada pelo UUID da conta. Sair não equivale a apagar o banco. |
| O IndexedDB é um banco relacional completo. | `src/persistence/IndexedDbRelationalStore.js`; `src/persistence/relationalSchema.js` | `tests/runtime/relational-sync.test.js` | **Não confirmado.** É uma projeção normalizada sobre object stores e índices do IndexedDB; não oferece SQL, constraints ou transações multicliente de um SGBD relacional. |
| Toda mutação do produto usa a mesma outbox. | `src/persistence/DomainMutationService.js`; `src/sync/RelationalSyncEngine.js`; `src/persistence/TrailPersonalStateRepository.js` | `tests/runtime/relational-sync.test.js`; `tests/runtime/integrated-course-sync.test.js` | **Não confirmado.** A outbox relacional sincroniza seleção leve; Trilhas, estado pessoal e autoria remota usam RPCs/filas próprias. |
| O estudo de material já baixado independe de conexão. | `src/persistence/RelationalProjectRepository.js`; `src/persistence/IndexedDbRelationalStore.js` | `tests/e2e/workspace-offline-authoring.spec.js`; `tests/e2e/study-card-progression.spec.js` | Confirmado no escopo testado. Login, primeiro download, governança e autoria MCP permanecem online. |
| Revisões oficiais são instaladas somente após validação e hash. | `src/sync/RelationalSyncEngine.js`; `src/persistence/canonicalCourseHash.js` | `tests/runtime/relational-sync.test.js`; `tests/runtime/integrated-course-sync.test.js` | Confirmado. Falha conserva a projeção anterior; isso não transforma a réplica em fonte de autoridade. |
| Conteúdo publicado fica como JSON imutável endereçado por conteúdo. | `supabase/functions/_shared/aralearn-authoring/artifactStore.js`; `supabase/migrations/20260728010000_storage_artifact_control_plane.sql`; `supabase/migrations/20260728030000_finalize_catalog_artifact_cutover.sql` | `tests/runtime/authoring-artifact-store.test.js`; `supabase/functions/tests/aralearn-course-revisions.test.ts` | Confirmado: SHA-256, JSON determinístico, objeto `artifacts/sha256/...`, máximo de 32 MiB; upload recomeçável acima de 6 MiB. |
| PostgreSQL contém todos os cursos oficiais decompostos em tabelas. | `supabase/functions/_shared/aralearn-authoring/artifactStore.js`; `supabase/migrations/20260728030000_finalize_catalog_artifact_cutover.sql` | `tests/runtime/catalog-control-plane.test.js`; `tests/runtime/authoring-artifact-store.test.js` | **Não confirmado.** PostgreSQL mantém metadados e referências; o artefato integral publicado fica no Storage. A composição mutável do workspace, esta sim, usa linhas por entidade. |
| Um artefato deixa de existir assim que perde uma referência. | `supabase/functions/_shared/aralearn-authoring/artifactGarbageCollector.js`; `supabase/migrations/20260729020000_harden_workspace_artifact_gc.sql` | `tests/runtime/artifact-garbage-collector.test.js` | **Não confirmado.** Ele se torna candidato; o coletor reivindica em lotes, usa idade mínima padrão de sete dias e conclui o descarte após verificar a reivindicação. |
| Concorrência de autoria é recusada por CAS. | `supabase/functions/_shared/aralearn-authoring/workspaceEngine.js`; `supabase/migrations/20260729070000_authoring_workspace_hardening.sql`; `supabase/migrations/20260809010000_authoring_continuity.sql`; `supabase/migrations/20260812160000_reuse_catalog_authoring_root.sql` | `tests/runtime/authoring-workspace-engine.test.js`; `tests/runtime/authoring-continuity-pglite.test.js` | Confirmado nos fluxos cobertos: `expectedRevision` compara a base lida; conflito exige nova leitura. |
| Repetir uma intenção confirmada é seguro. | `supabase/migrations/20260801210000_educational_workspaces.sql`; `supabase/migrations/20260807220000_trail_personal_state.sql`; `supabase/migrations/20260809010000_authoring_continuity.sql` | `tests/runtime/authoring-continuity-pglite.test.js`; `tests/runtime/integrated-course-sync.test.js` | Parcial e qualificado: chave + hash do payload recuperam recibo; janelas variam por fluxo (sete dias para workspaces educacionais e estado pessoal; quatorze dias para observações de workspace). A tabela geral de pedidos autorais não declara uma retenção universal. |
| Eventos recentes constituem versionamento restaurável do curso. | `supabase/functions/_shared/aralearn-authoring/workspaceContinuity.js`; `supabase/migrations/20260809011000_align_authoring_continuity_volatility.sql` | `tests/runtime/authoring-workspace-continuity.test.js` | **Não confirmado.** São resumos compactos de continuidade/auditoria; não há snapshots integrais nem restauração arbitrária de revisão. |

## MCP, Action, autenticação e autorização

| Afirmação verificável | Evidência de implementação | Verificação | Resultado e limite |
| --- | --- | --- | --- |
| O endpoint de autoria implementa servidor/gateway MCP por Streamable HTTP sem sessão. | `supabase/functions/_shared/aralearn-authoring/mcpServer.js`; `supabase/functions/aralearn-authoring-mcp/index.ts` | `tests/runtime/authoring-mcp.test.js`; `supabase/functions/tests/aralearn-authoring-mcp.test.ts`; `tests/runtime/authoring-mcp-journey.test.js` | Confirmado: protocolo `2025-11-25`, JSON-RPC, `tools/*`, `resources/*`, `structuredContent`; não emite `MCP-Session-Id`. Limite de corpo: 32 MiB. |
| MCP usa credencial estática de autoria. | `supabase/functions/_shared/aralearn-authoring/mcpServer.js`; `supabase/functions/_shared/aralearn-authoring/security.js` | `tests/runtime/authoring-oauth-adapter.test.js`; `tests/runtime/local-mcp-oauth-smoke.test.js` | **Não confirmado.** O endpoint exige access token OAuth para o recurso protegido e anuncia metadata por `WWW-Authenticate`. |
| MCP e Action são dois motores de autoria. | `supabase/functions/_shared/aralearn-authoring/actionServer.js`; `supabase/functions/_shared/aralearn-authoring/authoringToolExecutor.js`; `supabase/functions/_shared/aralearn-authoring/mcpServer.js` | `tests/runtime/authoring-action.test.js`; `tests/runtime/authoring-mcp.test.js` | **Não confirmado.** São adaptadores de protocolo sobre o mesmo registry/executor. |
| A Action usa exatamente o mesmo fluxo PKCE do MCP. | `supabase/functions/_shared/aralearn-authoring/actionOAuthServer.js` | `tests/runtime/authoring-oauth-adapter.test.js`; `tests/runtime/authoring-action.test.js` | **Não confirmado.** A Action usa fachada Authorization Code confidencial, com hashes de códigos/tokens; o MCP usa PKCE `S256` no Supabase Auth. |
| Um papel nominal autoriza diretamente todas as operações associadas. | `supabase/functions/_shared/aralearn-authoring/supabaseAdapter.js`; `supabase/migrations/20260801210000_educational_workspaces.sql`; `supabase/migrations/20260801213000_workspace_capability_enforcement.sql` | `tests/runtime/authoring-access-script.test.js`; `tests/runtime/authoring-workspace-protocol.test.js` | **Não confirmado.** Papel e relações derivam capacidades; cada operação revalida capacidade, objeto e estado. |
| A chave secreta do backend é publicada no site ou APK. | `src/supabase/runtimeConfig.js`; `supabase/functions/_shared/aralearn-authoring/supabaseEnvironment.js`; `scripts/verifyDeploymentArtifacts.ps1` | `tests/runtime/supabase-server-environment.test.js`; `tests/runtime/deployment-automation.test.js`; `tests/runtime/android-relational-cutover.test.js` | **Não confirmado.** Clientes recebem URL e chave publicável; a secret key fica no backend. `service_role` permanece apenas como papel literal/compatibilidade local da CLI. |

## Assistência contextual por API

| Afirmação verificável | Evidência de implementação | Verificação | Resultado e limite |
| --- | --- | --- | --- |
| A seleção visual delimita a autoridade do provider. | `src/assist/cardAssistanceScope.js`; `src/assist/bottomUpAssistanceScope.js` | `tests/kernel/card-assistance-operations.test.js`; `tests/runtime/bottom-up-sync-scope.test.js` | Confirmado. Contexto não selecionado pode ser lido, mas não amplia os caminhos graváveis. |
| A assistência cria exatamente um card por envio. | `src/assist/bottomUpAssistanceRuntime.js` | `tests/runtime/bottom-up-assistance-render.test.js`; `tests/e2e/authoring-assistant.spec.js` | **Não confirmado.** Pode criar até oito cards numa microssequência autorizada; no nível de lição, pode criar no máximo uma microssequência, também com até oito cards. |
| A conversa mantém somente um nível de desfazer. | `src/assist/cardAssistanceLedger.js`; `src/assist/cardAssistanceNavigation.js` | `tests/kernel/card-assistance-ledger.test.js`; `tests/kernel/card-assistance-navigation.test.js` | **Não confirmado.** O histórico volátil admite até oito turnos e nove versões, com desfazer, refazer e restauração; um novo ramo elimina o refazer abandonado. |
| A conversa da assistência é histórico de proveniência durável. | `src/assist/cardAssistanceLedger.js`; `src/assist/cardAssistanceLocalState.js` | `tests/runtime/card-assistance-local-state.test.js`; `tests/runtime/card-assistance-semantics.test.js` | **Não confirmado.** Prompt, resposta e versões não são persistidos nem sincronizados; mudanças aceitas no curso seguem o fluxo normal de conteúdo. |
| O provider pode editar qualquer JSON selecionado. | `src/assist/cardAssistanceScope.js`; `src/resources/kernel/packageRegistry.js` | `tests/kernel/package-card-assistance.test.js`; `tests/runtime/card-assistance-semantics.test.js` | **Não confirmado.** `edit_text` limita-se a alvos textuais declarados; `recompose_card` exige o card inteiro e contratos exatos. Mudanças estruturais fora do escopo são rejeitadas. |
| Os pedidos podem enviar contexto sem limite. | `src/assist/bottomUpAssistanceRuntime.js` | `tests/runtime/bottom-up-assistance-ui-state.test.js`; `tests/runtime/deepseek-card-assistance-policy.test.js` | **Não confirmado.** Prompt: 12.000 caracteres; envelope do provider: 64.000; índice: 48 itens; informação de cards selecionados: 8 itens, 12.000 no total e 4.000 por card; até duas tentativas do provider. |

## Implantação, testes e limites da auditoria

| Afirmação verificável | Evidência de implementação | Verificação | Resultado e limite |
| --- | --- | --- | --- |
| Web e Android executam a mesma aplicação web empacotada. | `public/`; `android/app/src/main/`; `scripts/buildAndroidRelease.ps1` | `tests/runtime/android-relational-cutover.test.js`; `scripts/verifyDeploymentArtifacts.ps1` | Confirmado para o pipeline atual. A versão do APK e `versionCode` são ciclo de release, não versão de contrato. |
| Qualquer backend SQL é substituto direto do Supabase. | `src/supabase/`; `supabase/functions/`; `supabase/migrations/` | `npm run validate:cutover`; `npm run test:supabase:smoke` | **Não confirmado.** Auth, RLS, PostgREST, RPCs, Storage e Edge Functions fazem parte do contrato operacional; não há adaptador BaaS geral. |
| `npm test` cobre todas as propriedades pedagógicas e operacionais. | `package.json`; `scripts/runTests.mjs`; `scripts/testAuthoringPackages.mjs` | `npm test` | **Não confirmado.** A suíte cobre contratos e regressões codificadas. Adequação pedagógica, acessibilidade com participantes, operação prolongada e custo real exigem outros métodos. |
| Pacotes de conhecimento baixáveis são fontes autorais. | `authoring/`; `scripts/buildAuthoringPackages.mjs` | `npm run test:authoring-packages` | **Não confirmado.** `docs/downloads/authoring/` é saída derivada; mudanças devem ser feitas nas fontes e regeneradas pelo script antes de publicar. |

## Cobertura documental da auditoria

A revisão técnica confrontou **75 documentos Markdown**: os 74 arquivos que já
existiam no recorte e o novo glossário técnico. A própria matriz é o relatório
da auditoria e foi excluída dessa contagem para evitar autorreferência. Dos 75,
71 são fontes autorais e quatro são saídas derivadas em
`docs/downloads/authoring/`. As fontes estão agrupadas da seguinte forma. Um
arquivo sem alteração foi mantido porque não continha
afirmação técnica divergente no recorte examinado; sua presença nesta lista
registra a leitura, não uma certificação científica.

| Categoria | Fontes confrontadas |
| --- | --- |
| Entrada e rotas de leitura | `README.md`, `docs/README.md`, `docs/guia-*.md`, `docs/solucao-de-problemas.md` |
| Produto e estudo | `docs/visao-do-produto.md`, `docs/modelo-didatico.md`, `docs/uso-do-app.md`, `docs/estado-de-estudo-nao-punitivo.md`, `docs/observacoes-pedagogicas.md`, `docs/workspaces-educacionais.md` |
| Arquitetura e operação | `docs/arquitetura.md`, `docs/persistencia-relacional.md`, `docs/plano-de-controle-e-artefatos.md`, `docs/supabase.md`, `docs/implantacao.md`, `docs/privacidade.md`, `docs/estado-atual-e-roadmap.md` |
| Contratos, resources e assistência | `docs/aralearn-contract.md`, `docs/recursos-de-card.md`, `docs/assistencia-por-ia.md`, `docs/fluxos-prompts-e-contratos.md`, `docs/autoria-mcp.md`, `docs/autoria-do-catalogo.md`, `docs/criar-cursos-pelo-chat.md`, `docs/integrations/*.md` |
| Interface | `docs/auditoria-front-end.md`, `docs/sistema-visual.md` |
| Autoria distribuída | `authoring/README.md`, `authoring/core/*.md`, `authoring/knowledge/*.md`, `authoring/platforms/**/*.md`, `authoring/examples/README.md` |
| Pesquisa e fundamentação | `docs/fundamentos-pesquisa-e-governanca.md`, `docs/revisao-de-literatura.md`, `docs/quadro-teorico.md`, `docs/glossario-construtos.md`, `docs/matriz-rastreabilidade-pedagogica.md`, `docs/protocolo-avaliacao-artefato.md`, `docs/contribuicao-originalidade.md`, `docs/fundamentacao-pedagogica-dos-resources.md`, `docs/auditoria-academica-dos-resources.md` |

Saídas em `docs/downloads/authoring/` não foram editadas diretamente. A
conformidade delas depende de regeneração a partir de `authoring/` e de
`npm run test:authoring-packages` no ciclo de release.
