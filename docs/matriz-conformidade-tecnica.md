# Matriz de conformidade técnica

Esta matriz liga propriedades do AraLearn à implementação e à evidência
executável. A linha publicada de clientes 0.0.27 usa a API de Cursos revisão 13,
o MCP revisão 128, cinco ferramentas públicas e o esquema `20260821191340`, com
36 capacidades obrigatórias; o recurso visual permanece 0.0.23. O estado
“demonstrado” indica que a capacidade existe no contrato corrente e possui
verificação no repositório e, quando indicado, no ambiente hospedado. Limites
declarados fazem parte desse contrato.

## Curso e composição

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| Estudo, Autoria e MCP usam a mesma identidade de Curso | `public.courses`, `private.course_entities`, `CourseController.js` | `course-main-cutover.test.js`, `course-controller.test.js` | demonstrado; não há conversão para uma árvore autoral paralela |
| a hierarquia aceita Módulo, Lição, Tópico, Microssequência e Unidade de estudo | `courseEntities.js` e restrições de `course_entities` | `course-entities.test.js`, recriação local | demonstrado; Tópico e Microssequência são irmãos sob Lição |
| composição extensa é lida em páginas de uma revisão | RPCs de lista e composição, `CourseStudyRepository.js` | `course-study-repository.test.js`, teste local de funcionamento | demonstrado; revisão divergente invalida a candidata |
| uma candidata inválida não substitui a última composição íntegra | `CourseLocalStore.js`, `CourseController.js` | `course-local-store.test.js`, `course-controller.test.js` | demonstrado no processo e após reinício; revisão anterior fica somente para leitura |
| inspeção autoral limita rede, memória e documento visual | RPC de inspeção, `CourseInspectionSequence.js` | `course-inspection-sequence.test.js`, `course-authoring-surface.test.js` | demonstrado; quatro páginas ou 8 MiB por Curso na réplica de inspeção |
| a entrada de Estudo repete um cartão para cada Curso | `renderHomeScreen.js` e `CourseStudyApplication.js` | `course-study-screen.test.js`, `course-study-cutover.spec.js` e oito capturas | fora do contrato; um combobox controla uma única prévia rica, sem UUID, hash ou revisão técnica visível |
| a entrada adota uma composição mais larga no computador | shell compartilhado e estilos da Home | matriz 360/390/430/1280 nos dois temas | fora do contrato; shell centralizado de até 430 px, uma coluna e nenhum overflow global |

## Persistência pessoal

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| cada conta usa um banco IndexedDB próprio | `CourseLocalStore.js` | `course-local-store.test.js`, `auth-session-store.test.js` | demonstrado em `aralearn-course-v1-<user-id>` |
| sessão local duplica o objeto completo do usuário | `SupabaseAuthClient.js`, `AuthSessionStore.js` | `supabase-auth.test.js` | fora do contrato; persiste apenas tokens, tipo, expiração e `user.id`, e reduz sessão legada na primeira leitura |
| logout comum apaga automaticamente o cache offline | `public/main.js`, `CourseLocalStore.js` | `course-main-cutover.test.js`, `course-local-store.test.js` | fora do contrato; sair preserva somente Curso, fila e rascunhos já persistidos, com confirmação de perda para formulário aberto, enquanto duas ações explícitas limpam somente a conta ativa |
| conteúdo já promovido pode ser estudado sem rede | `CourseStudyApplication.js` e repositório local | `course-study-bridge.test.js`, `course-study-screen.test.js`, teste de Estudo no navegador | demonstrado; autenticação inicial e primeiro carregamento exigem rede |
| seleção e posição exigem baixar todos os Cursos | envelope de navegação no `CourseStudyRepository.js` | testes de repositório, tela e navegador | fora do contrato; descritores alimentam a prévia e somente a entrada carrega o Curso selecionado |
| disponibilidade local é inferida do descritor | documento verificado no controlador e ponte de Estudo | testes de controlador, ponte, repositório e cenário sem conexão | fora do contrato; a prévia consulta a composição íntegra da revisão e revogação purga conteúdo e posição antes do fallback |
| progresso e itens para rever usam estado pessoal v2 | `CoursePersonalStateRepository.js` e RPCs próprias | `course-personal-state-repository.test.js`, teste local de funcionamento | demonstrado; Anotações não fazem parte desse documento |
| Anotações possuem dados locais, paginação e fila próprios | `CourseAnnotationRepository.js` | `course-annotation-repository.test.js`, `course-anchored-annotations-pglite.test.js` | demonstrado; limites bloqueiam nova entrada sem descartar comandos existentes |
| alterações autorais gerais podem ser enfileiradas sem conexão | ausência de fila autoral universal; API de Cursos exige conexão | controlador, painéis e auditor de persistência | fora do contrato; a versão 0.0.26 conserva apenas o envelope delimitado da primeira gravação pessoal e ainda exige reconexão e revisão corrente para confirmar a escrita |
| duas abas convergem sem transmitir texto bruto pelo canal | repositórios e `BroadcastChannel` | testes de estado pessoal e Anotações | demonstrado; o canal sinaliza releitura do IndexedDB |

## Autoria

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| plano e Partes de autoria são editáveis no Curso | `courseAuthoringPlan.js`, migração de plano | `course-authoring-plan.test.js`, `course-authoring-plan-pglite.test.js` | demonstrado; título e objetivo continuam na raiz do Curso |
| desenho resolve parâmetros e política por escopo | `courseDesignParameters.js`, `CourseDesignPanel.js` | `course-design-parameters.test.js`, testes de superfície | demonstrado; limites técnicos permanecem separados da orientação pedagógica |
| uma Parte pode materializar Unidades de estudo | operações canônicas e `course_entities` | testes de plano, adaptador e executor | demonstrado; materialização registra origem e respeita revisão esperada |
| operações repetidas não duplicam efeito | recibos e identificadores de pedido nas RPCs | `course-postgres-concurrency.test.js`, testes PGlite e do executor | demonstrado dentro da retenção da família |
| operação sem mudança avança a revisão | comparador semântico das operações | `course-tool-executor.test.js`, testes PGlite | fora do contrato; ausência de mudança conserva revisão e evento |
| a interface oferece todas as capacidades por quatro destinos progressivos | `CourseAuthoringSurface.js` e painéis de Curso | `course-authoring-surface.test.js`, teste de Autoria no navegador e matriz visual focal 10/10 em 51,4 s | Curso, Revisar, Pesquisa e Pessoas revelam Planejamento, Parâmetros, Fontes, Estrutura, Inspeção, discussões, auditoria, correções, Variantes, Analytics e acesso sem nove rótulos permanentes; #152 e #153 mantêm a simplificação e o aceite humano abertos |
| a Autoria excede 430 px em tela larga | `course-authoring.css` e shell único | matriz 360/390/430/1280 nos dois temas, 10/10 | fora do contrato; computador conserva a mesma superfície centralizada, sem segunda coluna, overflow global ou composição especial |
| proprietário edita texto da Unidade no renderer corrente | `manualInlineFields.js`, `manualStudyUnitEdit.js`, aplicações de Estudo e Inspeção | `manual-study-unit-edit.test.js`, `manual-study-unit-edit.spec.js` | demonstrado para os 32 componentes; acesso somente de Estudo nunca grava no original e a primeira mudança material tem como destino uma cópia pessoal, com prática e progresso separados |
| pessoa com acesso edita o Curso original | operação de cópia pessoal, API de Cursos e relação privada | pgTAP 78/78, PGlite 45/45, smoke local e navegador publicado | fora do contrato; demonstrado que a primeira gravação material cria outro Curso privado, continua na Unidade pertinente e deixa o original inalterado |
| cópia pessoal herda dados pessoais ou autorais laterais | transação `personal-course-copy-edit-v1` e projeções de Estudo | testes SQL, cliente, IndexedDB e navegador da versão 0.0.26 | fora do contrato; demonstrado que somente título, objetivo e entidades curriculares são materializados; planejamento, Fontes, PDFs, acessos, progresso e Observações começam separados |
| repetição offline ou duas abas criam duas cópias | envelope delimitado no IndexedDB, recibo e unicidade por pessoa e origem | testes de reinício, replay, revogação e concorrência 1/1 | fora do contrato; demonstrado que a mesma intenção é idempotente e intenções diferentes concorrem por uma única cópia, com conflito explícito |
| assistência por API altera diretamente o Curso | `StudyUnitProviderAssistance.js` e editor manual compartilhado | `study-unit-provider-assistance.test.js`, teste de navegador | fora do contrato; a resposta validada entra primeiro no rascunho e a pessoa decide salvar pela operação corrente |
| uma sugestão focal altera vários caminhos de uma vez | schema `changes` e validação corrente | testes de assistência e navegador | fora do contrato; cada pedido aceita zero ou uma mudança em caminho autorizado e até 8.000 tokens de saída |
| trecho acima do orçamento abre uma chamada fadada ao corte | disponibilidade calculada antes da sobreposição | testes de assistência, renderer e acessibilidade | fora do contrato; acima de 6.000 caracteres por caminho ou 12.000 no contexto, o comando informa o motivo acessível e a edição manual permanece disponível |
| edição contextual confirma uma Unidade e sua proveniência atomicamente | `courseComposition.js`, controlador, API, adaptador e migração `20260820224424` | testes de controlador, roteador, adaptador, PGlite, paridade IndexedDB e funcionamento hospedado | demonstrado localmente e no backend hospedado; carga histórica exige igualdade JSONB com o conjunto efetivo anterior, e mudança exige Fonte e Âncora correntes |
| uma resposta perdida muda a proveniência do replay | instantâneo limitado por `requestId` no `CourseController` | testes de controlador e resposta ambígua no navegador | fora do contrato; a mesma intenção reutiliza o conjunto fixado, e outra intenção com a mesma identidade é recusada |
| recibo 2xx depende de nova leitura para chegar ao IndexedDB | promoção de snapshot e `course.v1` no controlador | 136/136 verificações focais e 9/9 cenários integrados de Estudo/Inspeção | fora do contrato; antes da invalidação, a cópia confirmada chega a Estudo e Inspeção sem rede e sem repetir escrita; releitura igual normaliza, revisão superior supera e logout, limpeza ou revogação purgam |

## Fontes e PDFs

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| fonte possui proveniência revisável e identidade estável | `courseSources.js`, relações de fonte e revisão | `course-sources.test.js`, `course-sources-panel.test.js` | demonstrado; revisões anteriores permanecem endereçáveis |
| âncoras ligam fonte a alvos do Curso | relações de âncora e atribuição | `course-anchored-annotations-pglite.test.js`, testes de fonte | demonstrado; citações não dependem de texto copiado no estado pessoal |
| PDF é privado e vinculado depois do envio | API de Cursos, intenção de upload, `course_source_attachments`, bucket `course-source-pdfs` | `course-source-attachments-pglite.test.js`, `course-data-lifecycle-pglite.test.js`, testes da API, segurança e smoke hospedado | demonstrado em duas fases: v2 prepara intenção de dez minutos e POST com sessão viva; v1 permanece somente no download do Android 0.0.26; upload antigo falha fechado e retirar v1 exige encerrar explicitamente esse suporte |
| conhecimento do caminho concede acesso ao PDF | vínculo relacional e autorização da API | `course-security.test.js`, teste local de funcionamento | fora do contrato; acesso exige a propriedade do Curso vinculado |
| cotas do aplicativo limitam anexos | domínio de fontes e RPCs | testes de fonte e anexos | demonstrado: 20 MiB por PDF, 64 MiB únicos por Curso e oito anexos por detalhe |
| variantes podem reaproveitar objeto imutável | vínculos autorizados por Curso e hash da origem | testes de anexos e variantes | demonstrado; cada Curso conserva vínculo próprio |
| autoria pode anotar, contestar e pedir reformulação de uma Fonte | Anotações ancoradas com alvos Fonte e Âncora, categoria de reformulação e vínculos considerados na resposta | `course-sources-panel.test.js`, `course-anchored-annotations-pglite.test.js`, testes de controlador, adaptador, roteador e MCP | demonstrado; a reformulação exige revisões vigentes de Fonte e Âncora e não copia o PDF para a Anotação |

## Auditoria, variantes e Pesquisa

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| auditoria registra ciclo, achado, decisão, correção e vínculo com Anotação | `courseAuditCycle.js`, `CourseAuditPanel.js`, relações privadas | `course-audit-cycle.test.js`, `course-audit-corrections-pglite.test.js`, teste de auditoria no navegador | demonstrado; escrita exclusiva do proprietário e com conexão |
| comparação cria Cursos independentes a partir de ponto de controle comum | `courseVariants.js`, relações de ponto de controle, conjunto e membro | `course-variants.test.js`, `course-variants-pglite.test.js`, `course-variants-panel.test.js`, jornada hospedada Z/A | demonstrado para dois a oito membros; a posição inicial define a referência |
| variantes copiam Unidades já materializadas | operação de criação de variante | testes de variantes | fora do contrato; cada Curso materializa suas próprias Unidades |
| comparação distingue declaração, observação e desvio factual | domínio e painel de variantes | testes de variantes e painel | demonstrado; não há atribuição de participantes nem inferência causal |
| Pesquisa lê projeção factual das autoridades correntes | `courseAuthoringAnalytics.js`, RPC exclusiva do proprietário e `CourseAnalyticsPanel.js` | `course-authoring-analytics-domain.test.js`, `course-authoring-analytics-pglite.test.js`, `course-analytics-panel.test.js` | demonstrado em sete conjuntos, até duzentas linhas por página |
| fatos de Pesquisa expõem identidade ou texto bruto | função de projeção e validadores do domínio | testes de domínio, PGlite e painel | fora do contrato; pessoa, e-mail, texto bruto e instantâneos integrais são excluídos |
| gráfico de Pesquisa possui equivalente textual e exportação direta delimitada | `CourseAnalyticsPanel.js`, `downloadTextFile.js` | `course-analytics-panel.test.js`, `text-file-download.test.js` | demonstrado com tabela, definições, CSV e JSON paginados, até 8 MiB por arquivo |

## API, MCP e catálogo

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| navegador e MCP executam o mesmo contrato de Curso | `courseRouter.js`, `courseToolExecutor.js`, `courseSupabaseAdapter.js` | `course-router.test.js`, `course-tool-executor.test.js`, `course-supabase-adapter.test.js` | demonstrado; transportes diferem, regra e autorização convergem |
| MCP oferece cinco ferramentas públicas; gestão de Pessoas permanece na aplicação | `courseMcpTools.js`, `mcpServer.js` | `course-mcp-tools.test.js`, `course-mcp-server.test.js`, smoke hospedado | demonstrado; capacidades novas entram como visões ou operações quando cabem |
| Observações no MCP usam projeção mínima e opt-in de texto | `courseToolExecutor.js`, `mcpServer.js` | `course-tool-executor.test.js`, `course-mcp-server.test.js` | demonstrado; inbox omite texto, referência/rótulo protegidos, paths, links, IDs internos e horários; detail/auditoria só acrescentam `rawText` com `includeObservationText: true` e disclosure |
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
| MCP usa OAuth 2.1 com PKCE | Auth OAuth Server, gancho de token, verificador JWKS e RPC de principal | `local-mcp-oauth-smoke.test.js`, `oauth-jwt-verifier.test.js`, smoke local e hospedado | demonstrado: escopo exato `offline_access`, sem `id_token`, aliases pareados, ES256/EC P-256 e sessão/consentimento vivos; `aralearn_session_id` continua correlacionável; bearer direto é negado em GoTrue, API de dados e Storage; a janela de expiração, as negativas finais e o inventário foram concluídos antes do fechamento da fronteira anterior |
| origens de produção são exatas | segredos CORS e `deploySupabase.ps1` | `deployment-automation.test.js` | demonstrado; HTTP somente em desenvolvimento local |
| produção envia diretamente a um provider remoto | `providerRuntimeSecurity.js`, configuração e adaptadores | `provider-runtime-security.test.js`, `study-unit-provider-assistance.test.js` | fora do contrato; produção oferece somente relay nos três hosts locais previstos e na porta 4183, com chave fora do AraLearn; acesso remoto direto exige runtime explícito de desenvolvimento |
| credencial de assistência entra em armazenamento ou artefato | relay local, sessão efêmera de desenvolvimento e verificadores de publicação | testes de assistência, publicação e automação | fora do contrato; produção não recebe a chave; no desenvolvimento ela segue apenas no cabeçalho e não aparece em corpo, URL, Web Storage, IndexedDB, banco ou bundle |
| envelope da assistência identifica a Unidade | projeção mínima em `studyUnitProviderAssistance.js` | testes de assistência e segurança | fora do contrato; pedido, valores textuais, título, papel, tópicos e mensagens anteriores são enviados sem `targetId`, `studyUnitId`, PDFs, Fontes ou outras Unidades |
| resposta do provider conclui depois do logout | destruição da superfície, cancelamento e descarte da sessão | cenário integrado `SIGNED_OUT` | fora do contrato; a chamada é abortada antes de apagar a sessão e fechar os armazenamentos, sem callback tardio, sobreposição, credencial restaurada ou erro de página |
| relay da assistência possui paridade entre web local, Pages e Android | política de conteúdo, classificação de endereço, configuração, ponte nativa e WebView | duas provas verticais locais, 21/21 verificações de endereço, compilação Android, 28/28 testes de implantação, verificador de artefato e aceite hospedado | parcial; a prova web mais recente passou 1/1 em 14,2 s e a compilação de depuração passou; o navegador usa `loopback` para `127.0.0.1`/`localhost` e `local` para `10.0.2.2`; a ponte chama somente `127.0.0.1:4183`, entra no APK, não entra no Pages e não relaxa `MIXED_CONTENT_NEVER_ALLOW`; Pages ainda precisa provar acesso à rede local, e o APK de release instalado precisa ser exercitado em dispositivo real |
| buckets são privados | políticas de Storage e URLs assinadas | testes de segurança, anexos e jornadas local e hospedada | demonstrado para `person-avatars` e `course-source-pdfs`; terceiro e pessoa com acesso apenas de Estudo não recebem o PDF autoral |
| sessão revogada bloqueia nova escrita sensível | validação de `session_id`, políticas de avatar/PDF e exclusão de conta | `course-data-lifecycle-pglite.test.js`, smokes local e hospedado | demonstrado; a exclusão preserva a sessão durante a limpeza necessária e revoga todas imediatamente antes de `auth.users`; download assinado já emitido pode durar 60 segundos |
| falha de limpeza local reabre uma exclusão remota confirmada | estado terminal da interface e `deleteDatabase` com tratamento de bloqueio | `course-main-cutover.test.js`, `course-local-store.test.js`, `auth-session-store.test.js` | fora do contrato; depois do sucesso remoto, outra aba pode exigir retry somente do IndexedDB, mas a conta permanece excluída e a API não é chamada novamente |
| falha depois que a exclusão começou parece uma tentativa sem efeito | erro retomável distinto após a limpeza de Storage e repetição idempotente | `course-supabase-adapter.test.js`, `course-main-cutover.test.js` | fora do contrato; a tela informa que arquivos podem ter sido removidos, conserva a conta e permite concluir a transação relacional sem repetir uma remoção já feita |
| erros e logs não refletem credencial, e-mail ou corpo bruto | `toolErrorEnvelope.js`, Edge Functions e workflows | `tool-error-envelope.test.js`, `privacy-operational-boundaries.test.js` | demonstrado; diagnóstico público usa allowlist e a verificação estática reprova console em Edge e rastreamento de segredos em workflows |
| retenção física independe da abertura do Curso | `run_current_data_retention_v1`, `pg_cron`, inventário de órfãos | `course-data-lifecycle-pglite.test.js`, smokes local e hospedado | demonstrado; job diário às 03:17, limite padrão 512 por classe e contagens idempotentes; inventário não remove objetos |

## Integração e publicação

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| aplicativo confirma o contrato remoto antes de publicar | `runtime-manifest.json`, verificador hospedado e fluxo Pages | `hosted-backend-verifier.test.js`, `deployment:verify-hosted` | demonstrado para `20260821191340` e 36 capacidades; Apply, CORS, OAuth/MCP e PDF v2 passaram antes da publicação dos clientes 0.0.27 |
| integração contínua recria o banco e confere inventário exato | `.github/workflows/validacao.yml`, auditoria de paridade | `vertical-parity-audit.test.js`, execução Supabase do fluxo | demonstrado; diferença de objeto, política ou bucket reprova |
| artefatos são examinados contra segredo e configuração indevida | `verifyDeploymentArtifacts.ps1` | `deployment-automation.test.js`, fluxos Pages e Android | demonstrado no gate e nos artefatos oficiais da 0.0.27; o APK ainda exige ensaio com relay em dispositivo real |
| Pages publica qualquer ramo | `.github/workflows/pages.yml` | `deployment-automation.test.js` | fora do contrato; publicação automática parte de `main` |
| publicação Android parte da ponta validada de `main` | `.github/workflows/android-release.yml` | `deployment-automation.test.js` | demonstrado; revisão superada e tag existente não são republicadas |
| limpeza física acompanha toda migração | `scripts/courseCutover/prepareLegacyCleanup.mjs` | `course-legacy-cleanup-plan.test.js`, `course-legacy-cleanup-backup.test.js` | fora do contrato; requer inventário, cópia verificada, restauração e confirmação específicas |

## Verificações documentais

| Propriedade | Implementação | Evidência | Estado e limite |
|---|---|---|---|
| links, títulos, índices e independência editorial são auditados | `scripts/auditDocumentation.mjs` | `documentation-audit.test.js`, `npm run audit:docs` | demonstrado para documentação pública corrente |
| vocabulário abolido é detectado | `scripts/auditTerminology.mjs` | `terminology-audit.test.js`, `npm run audit:terminology` | demonstrado em código, interface e documentação cobertos pelo auditor |
| a evidência citada continua executável | comandos e testes desta matriz | validação de integração | demonstrado para itens automatizados; inspeção visual e ambiente hospedado conservam verificações próprias |
