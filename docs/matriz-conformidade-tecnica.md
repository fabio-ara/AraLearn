# Matriz de conformidade técnica

Esta matriz ajuda a localizar a explicação canônica, o mecanismo e a evidência
executável de cada propriedade material. Ela é uma referência de verificação,
não uma descrição substituta da arquitetura. Os capítulos ligados em cada
grupo explicam primeiro o problema, o fluxo e os limites.

## Aplicação web, interface e componentes

Explicações principais: [Arquitetura](arquitetura.md), [Sistema
visual](sistema-visual.md), [Componentes didáticos](componentes-didaticos.md) e
[Auditoria da interface](auditoria-front-end.md).

| Propriedade | Mecanismo corrente | Evidência executável | Limite da evidência |
| --- | --- | --- | --- |
| o shell escolhe configuração, entrada, recuperação, consentimento ou aplicação autenticada antes de abrir um Curso | inicialização de `public/main.js`, `AuthSessionStore` e configuração pública | `course-main-cutover.test.js`, `supabase-auth.test.js` | cobre estados programados; não avalia compreensão das mensagens |
| Estudo segue Curso → Módulo → Lição → Microssequência → Unidade | aplicação e telas de Estudo sobre a composição validada | `course-study-cutover.spec.js`, `study-final-ux.spec.js` | não mede aprendizagem |
| Voltar restaura a origem real e Home oferece saída global | histórico, origem, rolagem e foco restaurados; pai somente contextual | `application-back-navigation.test.js`, testes E2E de Estudo | demonstra jornadas exercitadas |
| Visualizar, Editar e Assistência por IA usam o mesmo alvo nos níveis autorizados | renderer, edição contextual e sessão de assistência | testes de Estudo, edição manual e assistência | não mede preferência nem usabilidade percebida |
| Autoria começa pela Visão geral e mantém sete tarefas encontráveis | `CourseAuthoringSurface` e rotas tipadas | `course-authoring-surface.test.js`, `course-authoring-cutover.spec.js` | teste de navegação não prova facilidade de uso |
| foco, dialog, disclosure, teclado e área segura seguem os contratos da interface | controladores de overlay, estilos e navegação | `study-final-ux.spec.js`, `android-workbench-safe-area.test.js`, auditor de estilos | requer verificação visual real em navegadores e aparelhos representativos |
| uma Unidade renderiza somente pacotes registrados e validados | catálogo gerado, contratos por pacote e renderer canônico | testes de catálogo, kernel, corpus e galeria Playwright | validade estrutural não prova adequação didática |
| descoberta de componentes é progressiva e limitada | `explore`, `search`, `inspect`, `contracts`, validação, auditoria e prévia | testes de catálogo e `course-mcp-tools.test.js` | pacote disponível não garante que seja a melhor escolha |

## Estado local, funcionamento sem conexão e sincronização

Explicação principal: [Persistência relacional e
sincronização](persistencia-relacional.md).

| Propriedade | Mecanismo corrente | Evidência executável | Limite da evidência |
| --- | --- | --- | --- |
| a interface web abre sem rede depois de instalada | service worker com cache versionado, rede primeiro e fallback de navegação | `service-worker-runtime.test.js`, verificador do site | não inclui Cursos que nunca foram replicados |
| o Android usa shell empacotado e não registra service worker | assets do APK, `AndroidHost` e origem `appassets` | `android-runtime-security.test.js`, verificador Android | aparelho e versão de WebView ainda podem diferir |
| cada conta possui réplica local separada | banco `aralearn-course-v1-<conta>` e `course_cache` | `course-local-store.test.js`, `auth-session-store.test.js` | isolamento lógico depende também do sistema operacional e do perfil do navegador |
| uma composição nova só substitui a anterior quando todas as páginas são válidas | estágio candidato e promoção atômica do ponteiro | testes de store, controlador e repositório de Estudo | não transforma a réplica em autoridade autoral |
| Curso validado continua legível sem rede | composição promovida, posição e estado pessoal no IndexedDB | `course-study-repository.test.js`, E2E de Estudo | Fontes privadas e PDFs não são copiados para a réplica |
| progresso e itens para rever repetem comandos com segurança | fila própria de estado pessoal, recibos e reconciliação | `course-personal-state-repository.test.js`, `progress-store.test.js` | não existe fila genérica para toda mutação |
| Observações pendentes sobrevivem à interrupção | repositório e fila próprios, quotas e estados de entrega | `course-annotation-repository.test.js`, `study-unit-observation-sheet.test.js` | estado de sincronização não informa tratamento pedagógico |
| duas abas percebem mudança sem transportar texto bruto | `BroadcastChannel` carrega identidades e versões; cada aba relê IndexedDB | testes de repositórios de estado e Observações | coordenação local não substitui revisão remota |
| revogação, saída explícita e exclusão de conta têm efeitos distintos | purga por Curso, limpeza por conta e confirmação remota terminal | testes de identidade, armazenamento, produto e acesso local | recuperação de dados removidos depende de backup quando aplicável |

## Banco, concorrência, segurança e ciclo de vida

Explicações principais: [Persistência relacional](persistencia-relacional.md),
[Supabase](supabase.md) e [Privacidade](privacidade.md).

| Propriedade | Mecanismo corrente | Evidência executável | Limite da evidência |
| --- | --- | --- | --- |
| a hierarquia não aceita pais ou árvores incompatíveis | chaves e restrições relacionais em PostgreSQL | smoke local, pgTAP e `course-entities.test.js` | não avalia qualidade do conteúdo |
| uma escrita autoral não sobrescreve revisão concorrente | comparação `expectedRevision` e versões focais, ou CAS | `course-postgres-concurrency.test.js`, testes PGlite e E2E local | conflito exige decisão humana depois da releitura |
| repetição da mesma intenção não duplica o efeito | `requestId`, assinatura da intenção e recibos retidos | testes de pedido, roteador, PostgreSQL e PGlite | pedido novo representa outra intenção |
| alteração multiobjeto confirma ou reverte em conjunto | transações e funções SQL canônicas | testes PGlite/PostgreSQL de cada família | não garante disponibilidade do serviço |
| autenticação não basta para acessar qualquer Curso | privilégios, RLS, propriedade e acesso direto | `course-security.test.js`, `course-access-local.spec.js`, smoke local | os testes cobrem políticas e identidades preparadas |
| chave administrativa nunca pertence ao cliente | build aceita somente URL e chave publicável; Edge Functions guardam segredo | `supabase-server-environment.test.js`, testes de implantação e Android | inspeção do artefato não substitui gestão operacional de segredos |
| cada Edge Function valida a credencial de seu transporte | sessão Supabase na API, JWT MCP, token opaco em Actions | testes de API, MCP, Actions, OAuth e adaptador | não prova configuração de cliente externo indisponível |
| retenção física independe da abertura de Curso | `pg_cron` diário às 03:17 e rotina em lotes por classe | `course-data-lifecycle-pglite.test.js`, migration e inventário de Manutenção | horário observado depende do fuso e da execução do banco |
| exclusão de Curso, saída de compartilhamento e exclusão de conta são operações diferentes | contratos de produto, cascatas e limpeza correspondente do Storage | `product-operations-pglite.test.js`, testes de Home e acesso | toda ação destrutiva real exige confirmação do alvo |
| órfão só é removido após classificação e revalidação | inventário administrativo e autorização focal | testes de ciclo de vida, privacidade e Manutenção | não oferece exclusão genérica por prefixo |

## Autoria e conhecimento estruturado

Explicações principais: [Contrato do Curso](aralearn-contract.md), [Guia de
Autoria](guia-professor-autor.md), [Parâmetros](desenho-instrucional-parametrizado.md),
[Fontes](guia-professor-autor.md#fontes), [Observações](observacoes-pedagogicas.md),
[Auditoria](auditoria-de-conformidade-instrucional.md),
[Variantes](experimentos-instrucionais-parametrizados.md) e
[Pesquisa](analytics-instrucionais.md).

| Propriedade | Mecanismo corrente | Evidência executável | Limite da evidência |
| --- | --- | --- | --- |
| Planejamento conserva objetivo, público, escopo, resultados, evidências e Partes | plano versionado e comandos tipados | `course-authoring-plan.test.js`, teste PGlite e E2E de Autoria | preencher um plano não prova qualidade instrucional |
| parâmetros efetivos registram valor e origem de herança | resolução por nível e política do Curso | `course-design-parameters.test.js`, testes de painel | valor configurado não demonstra efeito educacional |
| materialização mantém histórico por Parte | execuções, etapas, fatos, canal e alvos produzidos | `course-inspection-sequence.test.js`, E2E de Autoria e migration corrente | histórico técnico não explica sozinho a qualidade do resultado |
| Aplicativo, MCP e Actions convergem no mesmo histórico | canal fechado `application`, `mcp` ou `actions` no executor e na persistência | testes de API, MCP, Actions e materialização | os clientes preservam autenticações distintas |
| Conteúdo navega, renderiza e edita a árvore canônica | inspeção paginada, renderer e operações focais | testes de superfície, controlador e E2E | paginação limita o documento visual, não o Curso |
| edição de pessoa compartilhada preserva o original | primeira escrita material cria cópia pessoal privada e serializada | testes de cópia, IndexedDB, PGlite e E2E | Fontes, acesso, progresso e Observações não são copiados |
| Fontes preservam revisões e proveniência | Fonte versionada, Âncora e atribuição por revisão | `course-sources.test.js`, painel e PGlite | citação existente não comprova a afirmação citada |
| PDF só ganha vínculo depois da conferência dos bytes | intenção de dez minutos, POST autenticado, hash, cotas e Storage privado | `course-source-attachments-pglite.test.js`, smoke local e hospedado | URL de download emitida continua válida até expirar |
| Observação permanece distinta de correção | Anotação ancorada, estados, classificação e permissões próprios | testes de Observações, repositório e PGlite | quantidade ou estado não mede aprendizagem |
| Auditoria conserva rodada, achado, correção, verificação e reversão | entidades versionadas e CAS focal | testes de ciclo, painel, PGlite e E2E | conformidade técnica não valida mérito acadêmico |
| Variantes partem de ponto comum e continuam Cursos independentes | conjunto de comparação, diferenças declaradas e cópia autorizada | testes de domínio, painel e PGlite | comparação factual não distribui participantes nem sustenta causalidade |
| Pesquisa deriva sete conjuntos das autoridades correntes | projeção paginada, filtros, cursor, métricas e exportação CSV/JSON | testes de domínio, PGlite, painel e exportação | fatos de Autoria não são fatos de aprendizagem; ausente não vira zero |
| Pessoas e acesso permanecem na aplicação | concessão e revogação por e-mail resolvido no servidor | testes de acesso, API e E2E local | e-mail não é exposto a MCP nem Actions |
| Manutenção só aparece para papel autorizado | resolução administrativa e operações confirmadas | `product-operations-pglite.test.js`, testes de superfície | identidade comum não consegue inspecionar o inventário |

## Assistência por IA, MCP e Actions

Explicações principais: [Assistência por modelo de
linguagem](assistencia-por-ia.md), [Autoria por MCP](autoria-mcp.md), [GPT com
Actions](autoria-actions.md) e [Fluxos, instruções e
contratos](fluxos-prompts-e-contratos.md).

| Propriedade | Mecanismo corrente | Evidência executável | Limite da evidência |
| --- | --- | --- | --- |
| Assistência por IA é uma sessão contextual do aplicativo | estado em memória, conversa multiturmo, proposta concreta corrente, provider escolhido, aceite explícito e escrita tipada | testes de assistência no domínio, runtime e E2E | resposta válida não garante utilidade pedagógica |
| credencial do provider permanece efêmera e fora dos artefatos | chave somente em memória, origem oficial por provider e limpeza ao encerrar a sessão | oráculos preparados em `provider-runtime-security.test.js`, testes dos adapters e E2E com stubs; ativação acompanha a implementação | navegador público não protege chave duradoura; testes não fazem chamadas pagas |
| candidato de IA não altera conteúdo antes da decisão humana | gerar somente após aceite, validar, reparar de forma limitada, renderizar e aplicar ao rascunho | testes de assistência, renderer e E2E | confirmação humana pode conter erro de julgamento |
| MCP usa protocolo e OAuth próprios | cinco ferramentas, servidor MCP, PKCE S256, JWT minimizado e consentimento | testes MCP, JWT, consentimento e smokes OAuth | cliente MCP externo pode ter comportamento próprio |
| Actions usa HTTP descrito por OpenAPI e OAuth próprio | cinco operações, cliente confidencial ligado ao GPT e tokens opacos | `course-action-server.test.js`, gerador OpenAPI e testes de OAuth | configuração real do GPT exige acesso à plataforma externa |
| MCP e Actions compartilham operações, não sessão | executor comum depois de resolver principais distintos | testes do executor, MCP, Actions e adaptador | equivalência de contrato não torna os transportes intercambiáveis |
| operações mutáveis preservam autoridade humana e concorrência | confirmação quando exigida, `requestId`, revisão e validação tipada | testes de ferramentas, confirmação e concorrência | protocolo não demonstra qualidade da decisão |

## Web, Android e operação

Explicações principais: [Implantação](implantacao.md), [Aplicativo
Android](../android/README.md), [Supabase](supabase.md) e [Solução de
problemas](solucao-de-problemas.md).

| Propriedade | Mecanismo corrente | Evidência executável | Limite da evidência |
| --- | --- | --- | --- |
| web e Android executam a mesma aplicação | build Pages e assets do APK sobre os mesmos módulos | E2E web, testes Android e verificadores de artefato | hardware e WebView reais exigem ensaio representativo |
| a WebView hospeda assets sob origem HTTPS estável | `WebViewAssetLoader` e `appassets.androidplatform.net` | `android-runtime-security.test.js`, verificador Android | não transforma o APK em aplicação nativa independente |
| navegação e capacidades nativas têm escopo fechado | esquemas permitidos, quadro principal, origem exata e limites de exportação | testes Android de segurança e área segura | novos recursos nativos exigem nova análise de superfície |
| release Android preserva identidade de atualização | keystore externo e configuração de assinatura | build de release e inspeção do APK | perder a chave impede atualização direta |
| publicação parte de uma revisão validada | planos de implantação, workflows e verificadores por SHA | `deployment-automation.test.js`, testes de CI e site publicado | serviços distintos não oferecem transação distribuída de publicação |
| backend é aplicado antes dos clientes dependentes | dry-run, confirmação literal, migrations, funções e verificação hospedada | testes de automação e `hosted-backend-verifier.test.js` | resposta ambígua exige diagnóstico manual do destino |
| configuração pública não carrega segredos | geradores e verificadores de Pages/Android | testes de ambiente, artefato e site publicado | não audita armazenamento de segredos fora do processo observado |
| recuperação separa código, dados e objetos | Git/release para clientes; backup de PostgreSQL e Storage para dados | ensaios operacionais e relatórios do ambiente | restauração precisa ser testada no ambiente responsável |

## Como usar a matriz

Ao alterar uma propriedade, comece pela explicação principal e acompanhe o
fluxo somente pelas camadas afetadas. Uma tela sem autorização e persistência
não fecha um caso vertical; uma RPC sem caminho compreensível também não.

Execute primeiro a prova focal capaz de detectar a regressão. Amplie para
Supabase local, navegador, build e ambiente hospedado quando o risco atravessar
essas fronteiras. Resultado técnico aprovado demonstra comportamento nas
condições exercitadas. Usabilidade, aprendizagem, validade científica e
adequação institucional exigem métodos próprios.
