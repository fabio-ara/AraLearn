# Matriz de conformidade técnica

Esta matriz distingue mecanismos presentes e mudanças aprovadas no
[programa #295](https://github.com/fabio-ara/AraLearn/issues/295). A base examinada
é a versão `0.0.64`, revisão `20f9a1b575a21b1714452fdb17b4d6b70e610d29`.
Código e testes localizados demonstram onde uma regra está implementada e como
exercitá-la; sua presença não significa execução aprovada nesta revisão.
Teste de software demonstra o comportamento exercitado; não demonstra
aprendizagem, qualidade pedagógica global nem usabilidade com participantes.

## Mecanismos presentes na base

As verificações abaixo são pontos de partida reutilizáveis. Os destinos da
seção seguinte prevalecem quando a regra corrente diverge do programa.

| Propriedade | Mecanismo corrente | Evidência focal | Limite |
| --- | --- | --- | --- |
| Autoria abre diretamente no conteúdo | rota canônica `content` e superfície sem overview | `course-authoring-route.test.js`, `course-authoring-surface.test.js` | inspeção local não substitui jornada hospedada |
| Uma StudyUnit domina o leitor | sequência focal, índice/pesquisa e deep links | `course-inspection-sequence.test.js`, E2E de Autoria | conteúdo real ainda pode revelar problemas de densidade |
| Planejamento é incremental | uma parte por resposta, releitura do plano e parte anterior reabrível | `incremental-authoring-conversation-acceptance.test.js` | 7–12 é heurística, não gate |
| AnalysisUnit preserva granularidade semântica | inventário antes da produção e distribuição por teto | `instructional-analysis-granularity-eval.test.js` e fixtures correspondentes | o banco não julga equivalência semântica |
| Quatro parâmetros pedagógicos e dois alvos editoriais têm efeito | configuração focal e efetiva por escopo | `course-design-parameters.test.js`, Analytics e fixture de calibração | alvos são flexíveis e não podem reduzir conteúdo necessário |
| MCP e Actions oferecem os mesmos casos de uso | catálogo `COURSE_HUMAN_TASKS` projetado nos dois transportes | `course-human-mcp.test.js`, `chatgpt-action-human-schema.test.js`, gate OpenAPI | cliente real precisa ser reconectado após publicação |
| Contrato público usa referências humanas | camada confiável resolve identidades e concorrência | testes do executor humano e do roteador | ambiguidade material volta à conversa |
| Revisão alcança o contexto afetado | Observações abertas, preparação contextual e correções em conjunto | `contextual-review-repair-acceptance.test.js` | aplicação exige reinspeção humana ou assistida |
| Fontes permanecem localizáveis e contestáveis | Fonte, Âncora e atribuição correntes | testes de fontes, painel e ingestão PDF | proveniência não prova verdade nem qualidade científica |
| Analytics descreve desenho e autoria correntes | contrato v2 com escopo, Desenho e Autoria | testes de domínio, painel e PGlite | contagens não são scores nem efeito educacional |
| JSON e painel apresentam o mesmo snapshot | exportação do objeto v2 normalizado exibido | `course-analytics-panel.test.js` | snapshot não contém o curso completo |
| PDF permanece privado | download server-side e mutação de bytes somente pela Storage API | `course-storage-lifecycle-local-smoke.mjs` | backup do banco não contém os bytes |
| Remoção, reativação e órfão são recuperáveis | attachment corrente, tombstone e intents abertas | smoke de lifecycle e testes de ingestão | limpeza física exige a API e autorização de serviço |
| Upgrade preserva o estado útil | dump, restore em PostgreSQL descartável e migração de corte | `verifyBackupRestoreUpgrade.mjs`, `backup-restore-upgrade.test.js` | fixture é representativa, não cópia de dados hospedados |
| RLS e menor privilégio permanecem ativos | políticas, grants e funções com autoridade delimitada | Supabase local, PGlite e testes de autorização | ocultar controle na UI não substitui recusa do servidor |

## Requisitos, etapas e mudanças necessárias

As etapas indicam onde completar cada capacidade, incluindo suas camadas e
documentação. Esta seção especifica o destino; não declara funcionalidades
futuras disponíveis. Caminhos de código são relativos à raiz do repositório;
nomes curtos de testes referem-se às suítes existentes em `tests/`.

| Requisito aprovado | Etapa | Estado e escritores → consumidores atuais | Dados úteis e mudança necessária | Verificação necessária |
| --- | --- | --- | --- | --- |
| Definições e jornadas refutáveis | [#296](https://github.com/fabio-ara/AraLearn/issues/296) | `courseDesignParameters.js`, contratos de componentes e fixtures → produção, inspeção e contagens; classificação semântica permanece declaração a examinar | Preservar repertório, requisitos de evidência e referências; separar definição, valor aplicado e medição, sem recodificar cursos pela aparência | Corpus com casos/contraexemplos; ligação fonte–argumento–decisão–medida; protótipo de continuidade; limites explícitos |
| Validar candidata uma vez e promover artefatos identificados | [#297](https://github.com/fabio-ara/AraLearn/issues/297) | `validacao.yml` → candidata; `pages.yml` e `android-release.yml` publicam separadamente; Android repete testes/lint | Reutilizar workflows e scripts; conservar checks obrigatórios, identidade de artefatos e certificado; substituir promoção sem gate comum | `deployment-automation.test.js`; classificação documental/runtime/segurança, revisão superada, falha parcial, retry e origem dos artefatos |
| Identidade pública, visitante e edição só pelo proprietário | [#298](https://github.com/fabio-ara/AraLearn/issues/298) | `AuthGate`, `CourseAuthoringSurface` e `CourseApiClient` → `courseRouter`/adaptador/SQL; perfil aceita nome e avatar, concessão usa e-mail; Estudo permite derivação para editar | Preservar IDs internos, contas, acessos e cópias existentes; acrescentar identificador escolhido e projeção pública mínima; retirar concessão por e-mail e criação automática de cópia por estudante | `course-access-local.spec.js`, API/RLS e testes de cópia pessoal adaptados: duas contas e visitante, colisão, revogação, observação e negação de escrita direta |
| Estudo estável, edição compartilhada e sincronização manual completa | [#299](https://github.com/fabio-ara/AraLearn/issues/299) | `CourseStudyApplication`, `manualStudyUnitEdit` e repositórios locais → renderer/API; `public/main.js` relê por foco/reconexão e descarrega pendências ao sair | Preservar hierarquia, posição, progresso, Rever, observações e rascunhos; aplicar política de sincronização também ao conteúdo aberto, mantendo escrita autoral explícita e acesso | `manual-study-unit-edit.spec.js`, testes dos repositórios e de Estudo: geometria antes/depois, duas abas, offline, conflito, troca de conta e retomada |
| Parâmetros precisos, perfis por cópia e cadência independente | [#300](https://github.com/fabio-ara/AraLearn/issues/300) | `courseDesignParameters.js`/`CourseDesignPanel` e tarefas humanas → atribuições SQL, materialização e dados de autoria; há quatro parâmetros pedagógicos e dois alvos, sem perfis nem controles separados de lote/pausa | Reutilizar catálogo, atribuições e desenho aplicado; migrar valores explícitos e exceções sem recalibrá-los; perfis copiam preferências, sem vínculo que altere cursos anteriores | `course-design-parameters.test.js` e contratos: herança, automático, fixado, perfil apagado/reaplicado, escopo isolado, prática/posição e conteúdo não truncado |
| Componentes extensíveis, unidades mistas e notação legível | [#301](https://github.com/fabio-ara/AraLearn/issues/301) | Pacotes → índice gerado/registro → navegador e Edge; envelope limita papéis a `theory`/`practice`; envelope/editor ainda reconhecem tipos nominais; parágrafo não declara matemática | Preservar instâncias e textos; evoluir contrato comum de composição/edição e migrar uma vez o dado afetado; regras internas de cada tipo ficam no pacote | `resource-package-kernel`, `resource-package-autoindex`, `resource-package-edge` e corpus: extensão sem editar núcleo/enums dos canais; matemática, idiomas, XSS, prática, edição e inspeção visual |
| Fontes contextuais e arquivos com política explícita | [#302](https://github.com/fabio-ara/AraLearn/issues/302) | `courseSources.js`, painel e tarefas → fontes/âncoras/atribuições e Storage; já há referência textual, localizadores e visibilidade por fonte, sem estilo configurável e política pública do curso | Reutilizar identidades e lifecycle; migrar metadados/vínculos sem completar dados desconhecidos; política de #298 e exceções controlam arquivo; URL temporária não vira identidade | Testes de fontes/painel e `course-storage-lifecycle-local-smoke.mjs`: corpus incompleto, estilo, trecho–referência–arquivo–retorno, expiração, revogação, remoção/reanexo e cópia |
| Ferramentas auxiliares e três caminhos de áudio | [#303](https://github.com/fabio-ara/AraLearn/issues/303) | Registro atual resolve conteúdo/resposta/feedback; não há contrato de ferramentas do card nem caminhos de áudio nesses consumidores | Estender o mesmo catálogo e reutilizar configuração, abertura contextual e arquivos; preservar formato/acesso/cache por referência; adaptador de serviço só com contrato explícito | Extensão de ferramenta sem dispatch por tipo; calculadora determinística; voz ausente, arquivo inválido, idioma/offline/expiração; discriminar stub e serviço real autorizado |
| Autoria por tarefas com foco e revisão verificável | [#304](https://github.com/fabio-ara/AraLearn/issues/304) | `CourseAuthoringSurface`, rotas, painéis e `CourseInspectionSequence` → casos de uso existentes; mapa global e inspeção paginada já existem | Reutilizar mapa, partes, observações individuais e deep links; seleção múltipla permanece transitória; reorganizar apresentação e retorno sem segunda entidade de lote | `course-authoring-cutover.spec.js`, testes de rota/inspeção/observações: foco, seleção/sair, retorno contextual, reordenação de partes e correção verificada |
| Integrações focais e mesma autorização | [#305](https://github.com/fabio-ara/AraLearn/issues/305) | `courseHumanTasks.js` → MCP e OpenAPI/Actions; executor resolve referências/repetição e materialização valida o conteúdo | Manter catálogo único, recibos temporários e leituras exatas; retirar instruções duplicadas/substituídas; separar mandato de continuidade e tamanho do lote sem guardar conversa | Contratos humanos, gerador OpenAPI e OAuth; budgets com método; MCP reconectado e Actions importado em conversas novas, dois lotes, correção transversal e retomada |
| Cópias independentes e comparação do estado corrente | [#306](https://github.com/fabio-ara/AraLearn/issues/306) | `commitPersonalCourseCopyEdit` fornece remapeamento limitado; dados v2 de autoria → painel/JSON do mesmo objeto; não há fluxo atual de cópia comparativa do proprietário | Reutilizar operações úteis de remapeamento; nova cópia privada, sem acessos/progresso/observações pessoais; preservar conteúdo, desenho, fontes e arquivos autorizados independentemente da origem | Testes de cópia e dados: IDs remapeados, exclusão da origem, permissões, revisão consistente, ausência distinta de zero, valores iguais em UI/canais/exportação e condições da medida renderizada |
| Documentação fiel e retirada do caminho substituído | [#307](https://github.com/fabio-ara/AraLearn/issues/307) | Capítulos canônicos e geradores → guias, referências, contratos e auditorias | Consolidar fontes únicas; retirar leitores, aliases, campos e testes exclusivos após migração; conservar migrations aplicadas, Git e recuperação | Auditorias de documentação, terminologia, resíduos e paridade; busca de escritores/consumidores finais; referências e limites conferidos |
| Entrega integrada e recuperável | [#308](https://github.com/fabio-ara/AraLearn/issues/308) | CI, verificadores hospedados e builds → Pages, backend e APK | Inventário e backup privado ensaiado antes de alteração remota destrutiva; instalação nova e upgrade convergem; preservar arquivos e assinatura | Suíte integral da candidata, PostgreSQL/RLS, restore/Storage, Chrome e clientes reais; conferir origem, versão, certificado, URL, APK e falha parcial |

## Decisões de reutilização e remoção

O curso corrente, a hierarquia relacional, a réplica IndexedDB e os casos de uso
comuns permanecem a base. Revisão crescente, versões de concorrência e recibos
temporários têm consumidores reais; não constituem um histórico universal e
não devem ser removidos para diminuir a quantidade de estruturas.

A cópia automática de estudante atravessa `CourseStudyApplication`,
`CourseController`, `CourseApiClient`, `courseProtocol`, adaptador e
`commit_personal_course_copy_edit_for_actor_v1`. A substituição remove esse
percurso completo, incluindo a recuperação local exclusiva, depois de tratar
pendências e preservar cursos já criados com propriedade confirmada. O
remapeamento útil pode servir à cópia deliberada do proprietário. Tabelas de
comparações históricas já retiradas pela migração de corte não são base para
reintroduzir versionamento.

O registro já delega validação, apresentação, acessibilidade e folhas editáveis
aos pacotes. A fronteira ainda precisa de correção: `studyUnitEnvelope.js`
conhece a combinação nominal `choice`/`paragraph`, e `manualStudyUnitEdit.js`
conhece `gap`/`ordering`. Transferir a regra específica para o contrato do pacote
preserva a função; simplesmente apagá-la perderia verificação ou edição. O
núcleo conserva composição, posições, ciclo de vida e protocolos compartilhados.
Ferramentas usam a extensão mínima desse mecanismo, sem outro sistema de
plugins ou carregamento de código remoto.

Fontes e arquivos conservam identidades lógicas, vínculos e autorização. Uma
referência compartilhada por cópia exige que acesso e exclusão considerem todos
os vínculos válidos; o hash atual restrito ao curso não justifica deduplicação
global. Metadados de autoria, observações e bytes não entram na projeção pública
por consequência de o curso se tornar público.

O levantamento termina quando cada divergência material tem etapa, escritor,
consumidor, destino do dado e prova que pode refutá-lo. Ele não exige uma
arquitetura nova antecipada. As definições científicas e seus limites permanecem
em [Desenho instrucional parametrizado](desenho-instrucional-parametrizado.md);
as jornadas e a geometria, no [Sistema visual](sistema-visual.md).

## Gate de integração

Uma mudança atravessa camadas quando altera contrato, schema ou autorização.
Nesse caso, valide a regra pura, a projeção do transporte, o banco descartável e
o consumidor real correspondente. O gate final acrescenta fresh, upgrade,
restore, Chrome em tamanhos e temas definidos, MCP reconectado e OpenAPI
efetivamente reimportado.

Consulte [Verificação da interface](auditoria-front-end.md), [Persistência
relacional](persistencia-relacional.md) e [Supabase](supabase.md).
