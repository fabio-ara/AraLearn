# Estado do projeto

## Aplicativo disponível

O AraLearn está disponível na web e no Android, com a mesma aplicação JavaScript. A conta dá acesso ao catálogo oficial, às coleções, às trilhas pessoais, ao estudo, aos comentários e ao progresso.

Os cursos oficiais ficam uma única vez no banco compartilhado. Selecionar um curso não cria uma cópia para a conta. O dispositivo baixa apenas a árvore necessária para estudo sem conexão; progresso, comentários, seleções e trilhas são gravados como dados pessoais.

Uma alteração remota de conteúdo atualiza somente as partes necessárias do
workspace composto. A publicação materializa o JSON imutável e troca a única
referência corrente do curso. Um artefato anterior só permanece enquanto outra
referência válida o proteger; depois disso, torna-se elegível à coleta de lixo.

Também estão disponíveis:

- cadastro, confirmação por e-mail, recuperação de senha, sessão persistida e saída;
- tela inicial integrada para estudar e organizar `Trilhas`, com painel apenas
  para `Coleções` e configuração do Chatbot/Plugin;
- retomada por lição, conclusão estrutural, marca **Rever**, observações e estudo sem conexão depois do primeiro download, sem telemetria de abertura, tempo, tentativa ou resultado;
- sincronização automática quando o aplicativo está aberto e encontra rede;
- modos contextuais **Ler** e **Editar** na mesma superfície do card, sem aba
  autoral concorrente;
- edição manual simples e assistência bottom-up por API no card, na
  microssequência e na lição, sem atuar em módulo ou curso;
- seleção direta por contorno, com reparo de resources ou card inteiro, criação
  de cards somente no recipiente de microssequência e criação de no máximo uma
  microssequência no recipiente de lição;
- validação interna, gravação direta do resultado e uma única reversão compacta,
  sem guardar pedido, contexto montado ou resposta do provider;
- observação situada no card, com cinco categorias, texto curto, sincronização
  offline e retorno do responsável; `Trilhas` permite acompanhar o workspace
  sem copiar o card ou guardar histórico da conversa;
- edição no curso privado próprio e, para conta administrativa ou editorial,
  no curso oficial; conteúdo sem autoridade permanece somente leitura;
- GPT externo com gateway MCP para planejamento e autoria extensa, com leitura,
  edição estrutural, recombinação, estudo imediato em Trilhas e submissão editorial
  (`atomic-resource-authoring`);
- OAuth 2.1 como autenticação exclusiva do gateway MCP, com autoridade
  resolvida pelos papéis e permissões do banco;
- capacidades por conta para autoria privada, submissão, revisão e publicação
  no catálogo, no mesmo assistente;
- projeção progressiva em que `Trilhas` reúne planos e cursos e `Coleções` reúne
  o catálogo oficial; listas remotas são paginadas e abertas sob demanda;
- workspaces pessoais, de turma ou equipe com seis papéis locais, convites,
  transferência, composição corrente dos planos e cursos e administração no próprio
  app; o mesmo papel governa MCP, Action, autoria e artefato privado de submissão sem
  copiar o curso; responsáveis recebem contagens e **Pontos de melhoria**
  calculados a partir das observações correntes, sem histórico ou telemetria;
- sistema visual único em claro e escuro, sem paleta paralela, glifos de
  interface ou CSS do editor e do painel de submissão já substituídos;
- trinta packages independentes: vinte e seis representações, entre elas
  `paragraph`, `code`, `table`, `flow`, `tree`, `graph`, `relation_map`,
  `matrix`, `plane`, `formula`, `chart`, `sequence`, `annotated_text`,
  `interlinear_gloss`, `software_system_context`, `software_container`,
  `system_internal_block`, `reaction`, `truth_table`,
  `packet_layout`, `algorithm_trace`, `database_schema`, `state_machine`,
  `network_topology`, `set_diagram` e `memory_layout`, e quatro respostas:
  `choice`, `gap`, `ordering` e `matching`.

## Trabalho de estabilização

As próximas verificações concentram-se no uso cotidiano: retomada sem conexão, passagem entre web e Android, atualização de cursos oficiais, acessibilidade em telas pequenas e medição de espaço no banco à medida que o catálogo cresce.

## Edição contextual durante o estudo

O conteúdo renderizado continua sendo a superfície principal. **Editar** torna
campos autorizados editáveis no próprio resource; **IA** permite selecionar por
contorno e mostra o pedido junto ao conteúdo. Não há JSON, tela duplicada nem
etapa de conferência separada.

No card, a assistência repara resources ou o conteúdo pedagógico integral. Na
microssequência, alguns cards limitam a mudança a esses cards; todos os cards
concedem também o recipiente e permitem criar cards dentro dele. Na lição, uma
microssequência autoriza trabalhar em seus cards, enquanto todas concedem o
recipiente e permitem criar no máximo uma nova microssequência. O fluxo local
não atua em módulo ou curso.

Pedido, contexto e resposta do provider não são persistidos. Depois de schema,
semântica e compare-and-swap, o resultado aparece diretamente e somente a
última mudança conserva uma inversa compacta para **Desfazer**. Curso privado
próprio mantém sua identidade; curso oficial só é editável por conta
administrativa ou editorial e mantém sua continuidade. Não há fork automático.

## Observações pedagógicas situadas

A #62 possui agora o ciclo operacional principal. A pessoa escolhe dúvida,
possível erro, confuso, sugestão ou observação, escreve até 1.000 caracteres e
pode editar ou retirar no próprio leitor. O dispositivo grava antes de
sincronizar; o backend não aceita cópia do card nem campos fora do contrato.

No workspace associado, papéis de revisão consultam e filtram a triagem,
respondem e alteram o estado. O estudante acompanha a resposta no próprio
card. Uma correção é uma operação de autoria separada e só pode ser vinculada
depois de gravada. Chatbot e Plugin usam o mesmo contrato contextual.

O registro continua sem nota, histórico de conversa, agregado comportamental
ou autorização automática para corrigir. Da triagem, o responsável abre o
card exato no modo contextual; o caminho inteiro é validado e um alvo removido
não produz fallback para outro card. Ainda falta avaliar essa interação com
pessoas reais; por isso a issue não deve ser considerada encerrada apenas pela
infraestrutura atual.

## Autoria de cursos oficiais

O fluxo editorial usa workspaces compostos por um assistente externo. A edição
corrente fica no PostgreSQL e só vira artefato integral no Storage quando há
publicação. A submissão aponta para o hash exato da composição corrente. As
partes materializadas aparecem em `Trilhas`; o catálogo oficial permanece separado.

Uma revisão privada pode ser submetida, assumida por quem revisa, corrigida em
uma cópia editorial independente e devolvida com pedido de ajustes ou rejeição.
É o mesmo assistente; as capacidades mudam conforme a conta conectada.

Os próximos passos dessa área são testar o fluxo com cursos extensos, medir a
qualidade das recombinações e avaliar o trabalho editorial com mais pessoas. A
autoria estrutural remota já usa exclusivamente o gateway MCP com OAuth 2.1.
Ela pode usar fontes recuperadas fora do AraLearn, desde que a pessoa autora
examine o resultado e registre a procedência necessária.

## Ambiente docente

Workspaces educacionais já oferecem colaboração entre proprietário,
administração, autoria, revisão, estudante e leitura. `Trilhas` mostra a
estrutura corrente e as observações qualitativas pertinentes; não mostra
tempo, tentativas, acertos, presença inferida nem ranking. Ainda faltam estudos
com pessoas reais para avaliar compreensão dos papéis, linguagem da triagem e
adequação do fluxo ao trabalho docente.

## Pesquisa

O AraLearn será avaliado em situações de estudo com pouco tempo, conexão instável e alternância entre dispositivos. Entre as perguntas de pesquisa estão:

- microssequências ajudam a retomar o estudo?
- recursos visuais ajudam a compreender conteúdos estruturados?
- o funcionamento sem conexão é previsível para quem estuda?
- o catálogo compartilhado mantém o armazenamento sustentável com muitos cursos?
- a assistência de linguagem reduz esforço de autoria sem substituir a revisão humana?

A frente fundadora separa [revisão de literatura](revisao-de-literatura.md),
[quadro teórico](quadro-teorico.md), [glossário de
construtos](glossario-construtos.md), [matriz de
rastreabilidade](matriz-rastreabilidade-pedagogica.md), [protocolo de
avaliação](protocolo-avaliacao-artefato.md) e [contribuição a
investigar](contribuicao-originalidade.md). Essa organização não encerra a
revisão da dissertação nem substitui avaliação com participantes. Analytics
permanece bloqueado até que cada indicador proposto possua pergunta,
construto, interpretação permitida, intervenção, avaliação e custo.
