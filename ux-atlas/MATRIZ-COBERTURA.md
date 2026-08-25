# Matriz histórica de cobertura da rodada de UX

Esta matriz registra os requisitos examinados na rodada encerrada. Seus nomes,
agrupamentos e instruções pertencem àquele período. Para o produto vigente,
prevalecem os contratos executáveis e o
[mapa da documentação atual](../docs/README.md).

Naquela rodada, a matriz cobria as capacidades que precisavam aparecer no
produto final. A regra adotada era que uma capacidade não se considerava
concluída apenas por existir no backend: a pessoa autorizada precisava
conseguir encontrá-la e usá-la pela interface, salvo quando sua natureza fosse
estritamente interna.

| Capacidade | Tarefa humana | Superfície alvo | Observação |
| --- | --- | --- | --- |
| entrada Estudo/Autoria | escolher entre estudar e editar | Home → switch `Estudo / Autoria` | identidade visual obrigatória |
| runtime, progresso, Rever e offline | estudar, retomar e continuar sem perder contexto | Estudo → Curso → Módulo → Lição → Microssequência → Unidade | estado pessoal não mede aprendizagem |
| edição manual da Unidade | modificar conteúdo no mesmo contexto | Unidade → modo `Editar` | proprietário grava no próprio Curso; quem estuda Curso compartilhado só persiste em cópia pessoal |
| assistência por IA na Unidade | discutir e propor mudanças de conteúdo ou da composição de componentes sem sair da Unidade | Unidade → modo `Assistência por IA` | minichat focal; contexto de leitura inclui a Unidade inteira e contexto curricular compacto; escrita continua estrita ao escopo autorizado; prévia antes de aplicar |
| assistência por IA na Microssequência | discutir e propor quantidade, ordem, função didática e composição/conteúdo das Unidades | Microssequência → modo `Assistência por IA` | pode acrescentar/remover/reordenar Unidades e alterar teoria/prática conforme contratos atuais; prévia estrutural e validação antes de aplicar |
| assistência estrutural na Lição | discutir e propor a organização das Microssequências, inclusive criar nova Microssequência | Lição → modo `Assistência por IA` ou ação contextual explicitamente rotulada a partir da Microssequência | mutação pertence à Lição; não apresentar criação de irmã como se fosse alteração interna da Microssequência corrente |
| cópia pessoal | editar compartilhado sem alterar original | Unidade → salvar na minha cópia | Curso privado próprio |
| criar/editar/excluir Curso próprio | manter a própria biblioteca, inclusive Cursos de teste | Autoria → Meus cursos → ações do Curso | exclusão remota ≠ limpeza local ≠ zerar progresso |
| sair de Curso compartilhado | encerrar o próprio acesso | Estudo → ações do Curso | não excluir o Curso do proprietário |
| composição do Curso | entender onde está o conteúdo | Curso → Estrutura | `activity` quando aplicável |
| planejamento + Partes | planejar e materializar | Curso → Planejamento | `materializations` |
| parâmetros de desenho | configurar decisões didáticas | Curso → Parâmetros | `design` |
| catálogo/política de componentes | permitir, excluir ou preferir componentes | Parâmetros → Componentes; Variantes | `design`, `variants` |
| Fontes/revisões/Âncoras | manter evidência e proveniência | Curso → Fontes; Unidade → Fontes | `sources` |
| PDFs de Fonte | enviar, consultar e remover vínculo/arquivo quando válido | Fonte → revisão → PDFs | não apagar Fonte ou outro vínculo por acidente |
| Inspeção | ler material real no contexto curricular | Revisar → Inspeção | renderer de Estudo |
| Observações | registrar, considerar, responder e resolver | Revisar → Discussões e correções | `annotations` |
| Auditoria/correções/reversões | verificar e reparar | Revisar → Auditoria | `audits` |
| Variantes | criar/comparar/desvincular e manter Cursos variantes | Pesquisa → Variantes | `variants`; Curso variante segue ciclo normal de Curso |
| Analytics | explorar fatos e métricas | Pesquisa → Analytics e fatos | sete datasets; gráfico+tabela+definição+fatos+exportação |
| concessão/revogação de acesso | administrar quem estuda diretamente | Pessoas | `activity` |
| MCP / conversa conectada | agir no objeto corrente sem copiar contexto | ação ChatGPT contextual | canal `authoring_chat` |
| GPT personalizado com Actions | operar o AraLearn a partir de um GPT personalizado por chamadas HTTP autorizadas | integração Actions/OpenAPI do GPT personalizado | cinco operações correntes de Curso; OAuth confidencial próprio; canal distinto do MCP e sem arquitetura de Workspace |
| dados locais | remover réplica do dispositivo sem apagar Curso remoto | Conta / ações locais | alcance explícito |
| perfil e aparência | reconhecer a conta, atualizar nome e foto e ajustar a leitura | Conta e aparência | avatar próprio; preferências visuais permanecem locais |
| exclusão da conta | encerrar a própria conta e seus dados conforme contrato final | Conta | ação destrutiva confirmada |
| retenção corrente | executar/verificar manutenção automática do modelo final | Conta → Manutenção, apenas administrador | reutilizar retenção corrente |
| inventário de resíduos correntes | saber se há objetos/vínculos quebrados | Conta → Manutenção, apenas administrador | classificação determinística do backend |
| correção de resíduo seguro | remover/reparar resíduo reconhecido sem SQL/Storage manual | Conta → Manutenção → detalhe/ação | autorização server-side e releitura do estado |

## Regras de cobertura registradas na rodada

`←` retorna à tela imediatamente anterior. `↑`, quando existir, sobe somente a hierarquia didática. Unidade, Microssequência e Lição usam a mesma gramática de modos quando a capacidade existir, sem confundir os respectivos escopos de escrita.

Na Assistência por IA, **provider/modelo** é configuração do serviço de linguagem, não nova arquitetura autoral. OpenAI, Gemini e DeepSeek usam seus adaptadores e origens oficiais; a chave fornecida pela pessoa permanece somente na memória da sessão. Modelos continuam configuráveis sem expor endpoint ou infraestrutura na interface.

A sessão de assistência separa três coisas:

- **conversa**: minichat efêmero e limitado, suficiente para discutir e refinar a proposta antes de aplicá-la;
- **contexto somente leitura**: quando o alvo está dentro de uma Unidade, enviar a Unidade completa, não apenas os campos/componentes selecionados, além de objetivo/papel/ordem da Microssequência e caminho/estrutura compacta do Curso necessários para situar a decisão;
- **escopo de escrita**: somente as operações tipadas explicitamente autorizadas pelo nível corrente.

O orçamento de contexto precisa ser adequado a modelos leves: priorizar alvo de escrita → Unidade completa → Microssequência → caminho/outline do Curso → conversa recente. Contexto menos importante pode ser compactado ou omitido de forma determinística; o alvo de escrita não pode ser truncado silenciosamente. PDFs, Fontes e conteúdo completo de outras regiões do Curso não entram apenas por conveniência.

Quando a mudança exigir escolher ou configurar componentes didáticos, o fluxo é progressivo e reaproveita `consultarComponentesDidaticos`: conversa/plano → confirmação da pessoa → `explore/search/inspect` → contratos exatos necessários → geração estruturada → `validate_study_unit` → reparo delimitado quando houver erro → `audit_representation` quando pertinente → `preview_study_unit`/renderer real → aplicação explícita. Não enviar todo o catálogo ou todos os schemas ao modelo de uma vez.

O ciclo de reparo é finito: uma geração inicial e no máximo duas tentativas de correção com erros estruturados. Se a proposta continuar inválida, o original permanece intacto, não há cópia/persistência parcial e a conversa informa que a proposta não pôde ser preparada. **JSON bem-formado não é suficiente**: somente composição válida e renderizável pode chegar a `Aplicar ao rascunho`.

Na Unidade, a assistência pode alterar conteúdo e a composição de componentes didáticos, inclusive acrescentar, remover, substituir ou reordenar componentes, sempre validando a Unidade completa. Na Microssequência, pode propor Unidades, sua ordem, função didática e conteúdo. Criar/remover/reordenar Microssequências é mutação da Lição, ainda que a ação possa ser iniciada contextualmente a partir de uma Microssequência.

Para quem é proprietário, alterações estruturais autorizadas persistem no próprio Curso. Para quem apenas estuda um Curso compartilhado, nenhuma operação escreve no original. A edição focal de Unidade continua usando a cópia pessoal corrente. Alterações estruturais mais amplas só devem ser oferecidas ao estudante se o contrato de cópia pessoal puder ser ampliado de forma segura e proporcional; essa limitação não pode retirar a capacidade estrutural do proprietário.

A superfície **Manutenção** é secundária e restrita ao papel administrativo. Ela não é um cliente de banco de dados: expõe somente problemas que o AraLearn sabe classificar e ações de produto correspondentes.

MCP e GPT personalizado com Actions são canais distintos. Um não substitui o outro apenas porque ambos permitem operar o AraLearn a partir de uma conversa. Para Actions, investigar a implementação histórica somente o suficiente para recuperar a capacidade desejada sobre os contratos correntes; não restaurar arquitetura superada por arrasto.

A matriz não autoriza telemetria nova, arquitetura genérica nem backend especulativo. Pequenas mudanças verticais são permitidas pelo gate #174 quando necessárias para realizar um comportamento já definido.

`research_condition` e Variantes não criam experimento causal com estudantes. Grupos/coortes, regra de atribuição, exposição, instrumentos/outcomes e plano de análise permanecem futuros.
