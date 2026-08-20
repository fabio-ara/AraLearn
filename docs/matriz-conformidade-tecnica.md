# Matriz de conformidade técnica

Esta matriz liga propriedades do AraLearn à implementação e à evidência
executável da entrega 0.0.23. O estado “demonstrado” indica que a capacidade
existe no contrato corrente e possui verificação no repositório. Limites
declarados fazem parte desse contrato.

## Curso e composição

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| Estudo, Autoria e MCP usam a mesma identidade de Curso | `public.courses`, `private.course_entities`, `CourseController.js` | `course-main-cutover.test.js`, `course-controller.test.js` | demonstrado; não há conversão para uma árvore autoral paralela |
| a hierarquia aceita Módulo, Lição, Tópico, Microssequência e Unidade de estudo | `courseEntities.js` e restrições de `course_entities` | `course-entities.test.js`, recriação local | demonstrado; Tópico e Microssequência são irmãos sob Lição |
| composição extensa é lida em páginas de uma revisão | RPCs de lista e composição, `CourseStudyRepository.js` | `course-study-repository.test.js`, teste local de funcionamento | demonstrado; revisão divergente invalida a candidata |
| uma candidata inválida não substitui a última composição íntegra | `CourseLocalStore.js`, `CourseController.js` | `course-local-store.test.js`, `course-controller.test.js` | demonstrado no processo e após reinício; revisão anterior fica somente para leitura |
| inspeção autoral limita rede, memória e documento visual | RPC de inspeção, `CourseInspectionSequence.js` | `course-inspection-sequence.test.js`, `course-authoring-surface.test.js` | demonstrado; quatro páginas ou 8 MiB por Curso na réplica de inspeção |

## Persistência pessoal

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| cada conta usa um banco IndexedDB próprio | `CourseLocalStore.js` | `course-local-store.test.js`, `auth-session-store.test.js` | demonstrado em `aralearn-course-v1-<user-id>` |
| conteúdo já promovido pode ser estudado sem rede | `CourseStudyApplication.js` e repositório local | `course-study-bridge.test.js`, `course-study-screen.test.js`, teste de Estudo no navegador | demonstrado; autenticação inicial e primeiro carregamento exigem rede |
| progresso e itens para rever usam estado pessoal v2 | `CoursePersonalStateRepository.js` e RPCs próprias | `course-personal-state-repository.test.js`, teste local de funcionamento | demonstrado; Anotações não fazem parte desse documento |
| Anotações possuem dados locais, paginação e fila próprios | `CourseAnnotationRepository.js` | `course-annotation-repository.test.js`, `course-anchored-annotations-pglite.test.js` | demonstrado; limites bloqueiam nova entrada sem descartar comandos existentes |
| alterações autorais podem ser enfileiradas sem conexão | ausência de fila autoral; API de Cursos exige conexão | controlador, painéis e auditor de persistência | fora do contrato; revisão corrente é necessária para escrever |
| duas abas convergem sem transmitir texto bruto pelo canal | repositórios e `BroadcastChannel` | testes de estado pessoal e Anotações | demonstrado; o canal sinaliza releitura do IndexedDB |

## Autoria

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| plano e Partes de autoria são editáveis no Curso | `courseAuthoringPlan.js`, migração de plano | `course-authoring-plan.test.js`, `course-authoring-plan-pglite.test.js` | demonstrado; título e objetivo continuam na raiz do Curso |
| desenho resolve parâmetros e política por escopo | `courseDesignParameters.js`, `CourseDesignPanel.js` | `course-design-parameters.test.js`, testes de superfície | demonstrado; limites técnicos permanecem separados da orientação pedagógica |
| uma Parte pode materializar Unidades de estudo | operações canônicas e `course_entities` | testes de plano, adaptador e executor | demonstrado; materialização registra origem e respeita revisão esperada |
| operações repetidas não duplicam efeito | recibos e identificadores de pedido nas RPCs | `course-postgres-concurrency.test.js`, testes PGlite e do executor | demonstrado dentro da retenção da família |
| operação sem mudança avança a revisão | comparador semântico das operações | `course-tool-executor.test.js`, testes PGlite | fora do contrato; ausência de mudança conserva revisão e evento |
| a interface oferece as nove áreas correntes | `CourseAuthoringSurface.js` e painéis de Curso | `course-authoring-surface.test.js`, teste de Autoria no navegador | demonstrado em Planejamento, Parâmetros, Fontes, Estrutura, Inspeção, Auditoria e correções, Variantes, Pesquisa e Pessoas |

## Fontes e PDFs

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| fonte possui proveniência revisável e identidade estável | `courseSources.js`, relações de fonte e revisão | `course-sources.test.js`, `course-sources-panel.test.js` | demonstrado; revisões anteriores permanecem endereçáveis |
| âncoras ligam fonte a alvos do Curso | relações de âncora e atribuição | `course-anchored-annotations-pglite.test.js`, testes de fonte | demonstrado; citações não dependem de texto copiado no estado pessoal |
| PDF é privado e vinculado depois do envio | API de Cursos, `course_source_attachments`, bucket `course-source-pdfs` | `course-source-attachments-pglite.test.js`, testes da API e segurança | demonstrado em duas fases com URL assinada |
| conhecimento do caminho concede acesso ao PDF | vínculo relacional e autorização da API | `course-security.test.js`, teste local de funcionamento | fora do contrato; acesso exige a propriedade do Curso vinculado |
| cotas do aplicativo limitam anexos | domínio de fontes e RPCs | testes de fonte e anexos | demonstrado: 20 MiB por PDF, 64 MiB únicos por Curso e oito anexos por detalhe |
| variantes podem reaproveitar objeto imutável | vínculos autorizados por Curso e hash da origem | testes de anexos e variantes | demonstrado; cada Curso conserva vínculo próprio |
| autoria pode anotar, contestar e pedir reformulação de uma Fonte | Anotações ancoradas com alvos Fonte e Âncora, categoria de reformulação e vínculos considerados na resposta | `course-sources-panel.test.js`, `course-anchored-annotations-pglite.test.js`, testes de controlador, adaptador, roteador e MCP | demonstrado; a reformulação exige revisões vigentes de Fonte e Âncora e não copia o PDF para a Anotação |

## Auditoria, variantes e Pesquisa

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| auditoria registra ciclo, achado, decisão, correção e vínculo com Anotação | `courseAuditCycle.js`, `CourseAuditPanel.js`, relações privadas | `course-audit-cycle.test.js`, `course-audit-corrections-pglite.test.js`, teste de auditoria no navegador | demonstrado; escrita exclusiva do proprietário e com conexão |
| comparação cria Cursos independentes a partir de ponto de controle comum | `courseVariants.js`, relações de ponto de controle, conjunto e membro | `course-variants.test.js`, `course-variants-pglite.test.js`, `course-variants-panel.test.js` | demonstrado para dois a oito membros |
| variantes copiam Unidades já materializadas | operação de criação de variante | testes de variantes | fora do contrato; cada Curso materializa suas próprias Unidades |
| comparação distingue declaração, observação e desvio factual | domínio e painel de variantes | testes de variantes e painel | demonstrado; não há atribuição de participantes nem inferência causal |
| Pesquisa lê projeção factual das autoridades correntes | `courseAuthoringAnalytics.js`, RPC exclusiva do proprietário e `CourseAnalyticsPanel.js` | `course-authoring-analytics-domain.test.js`, `course-authoring-analytics-pglite.test.js`, `course-analytics-panel.test.js` | demonstrado em sete conjuntos, até duzentas linhas por página |
| fatos de Pesquisa expõem identidade ou texto bruto | função de projeção e validadores do domínio | testes de domínio, PGlite e painel | fora do contrato; pessoa, e-mail, texto bruto e instantâneos integrais são excluídos |
| gráfico de Pesquisa possui equivalente textual e exportação direta delimitada | `CourseAnalyticsPanel.js`, `downloadTextFile.js` | `course-analytics-panel.test.js`, `text-file-download.test.js` | demonstrado com tabela, definições, CSV e JSON paginados, até 8 MiB por arquivo |

## API, MCP e catálogo

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| navegador e MCP executam o mesmo contrato de Curso | `courseRouter.js`, `courseToolExecutor.js`, `courseSupabaseAdapter.js` | `course-router.test.js`, `course-tool-executor.test.js`, `course-supabase-adapter.test.js` | demonstrado; transportes diferem, regra e autorização convergem |
| MCP oferece seis ferramentas estáveis | `courseMcpTools.js`, `mcpServer.js` | `course-mcp-tools.test.js`, `course-mcp-server.test.js` | demonstrado; capacidades novas entram como visões ou operações quando cabem |
| recurso visual MCP corresponde à versão 0.0.23 | `courseMcpAppResource.js` | `course-mcp-app-resource.test.js`, `course-mcp-app-resource.spec.js` | protocolo, temas, tamanho, encerramento, prévia, Pesquisa e Variantes verificados localmente; sessão no cliente conectado permanece pendente |
| cliente escolhe vários pacotes para uma instância | catálogo e `courseContract.js` | validação do corpus e testes de pacotes | fora do contrato; cada instância usa um `package@version` |
| navegador e Edge usam catálogo idêntico | código gerado em `_shared/aralearn/runtime` | `resources:sync-edge --check`, testes globais | demonstrado; divergência reprova a validação |
| catálogo oferece 29 pacotes de conteúdo e três de resposta | `src/resources/packages/` e registro gerado | `resources:catalog-course:check`, teste do Curso de recursos | demonstrado; busca retorna até oito resultados por chamada |

## Segurança

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| cliente público recebe credencial administrativa | configuração pública e verificadores de artefato | `supabase-server-environment.test.js`, `deployment-automation.test.js` | fora do contrato; somente URL e chave pública entram em site e APK |
| tabelas expostas exigem privilégio e segurança por linha | migrações, privilégios e políticas | `course-security.test.js`, teste PostgREST/RLS, análise do banco | demonstrado para os contratos públicos correntes |
| função com credencial administrativa aceita identidade declarada pelo corpo | funções de entrada e RPCs exclusivas do proprietário | testes de API, MCP, adaptador e segurança | fora do contrato; a função valida o token e a função SQL comprova a pessoa |
| MCP usa OAuth 2.1 com PKCE | Auth OAuth Server, gancho de token e função MCP | `local-mcp-oauth-smoke.test.js`, teste local e hospedado | demonstrado; servidor valida sessão, emissor, destinatário, recurso, cliente, sujeito e validade temporal; cliente valida estado e código PKCE |
| origens de produção são exatas | segredos CORS e `deploySupabase.ps1` | `deployment-automation.test.js` | demonstrado; HTTP somente em desenvolvimento local |
| buckets são privados | políticas de Storage e URLs assinadas | testes de segurança, anexos e teste local de funcionamento | demonstrado para `person-avatars` e `course-source-pdfs` |

## Integração e publicação

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| aplicativo confirma o contrato remoto antes de publicar | `runtime-manifest.json`, verificador hospedado e fluxo Pages | `hosted-backend-verifier.test.js`, `deployment:verify-hosted` | demonstrado na revisão `20260820101500` |
| integração contínua recria o banco e confere inventário exato | `.github/workflows/validacao.yml`, auditoria de paridade | `vertical-parity-audit.test.js`, execução Supabase do fluxo | demonstrado; diferença de objeto, política ou bucket reprova |
| artefatos são examinados contra segredo e configuração indevida | `verifyDeploymentArtifacts.ps1` | `deployment-automation.test.js`, fluxos Pages e Android | demonstrado para site e APK |
| Pages publica qualquer ramo | `.github/workflows/pages.yml` | `deployment-automation.test.js` | fora do contrato; publicação automática parte de `main` |
| publicação Android parte da ponta validada de `main` | `.github/workflows/android-release.yml` | `deployment-automation.test.js` | demonstrado; revisão superada e tag existente não são republicadas |
| limpeza física acompanha toda migração | `scripts/courseCutover/prepareLegacyCleanup.mjs` | `course-legacy-cleanup-plan.test.js`, `course-legacy-cleanup-backup.test.js` | fora do contrato; requer inventário, cópia verificada, restauração e confirmação específicas |

## Verificações documentais

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| links, títulos, índices e independência editorial são auditados | `scripts/auditDocumentation.mjs` | `documentation-audit.test.js`, `npm run audit:docs` | demonstrado para documentação pública corrente |
| vocabulário abolido é detectado | `scripts/auditTerminology.mjs` | `terminology-audit.test.js`, `npm run audit:terminology` | demonstrado em código, interface e documentação cobertos pelo auditor |
| a evidência citada continua executável | comandos e testes desta matriz | validação de integração | demonstrado para itens automatizados; inspeção visual e ambiente hospedado conservam verificações próprias |
