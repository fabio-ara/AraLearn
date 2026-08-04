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
- painel integrado com `Trilhas`, `Coleções` e configuração do Chatbot/Plugin;
- retomada por lição, conclusão estrutural, marca **Rever**, observações e estudo sem conexão depois do primeiro download, sem telemetria de abertura, tempo, tentativa ou resultado;
- sincronização automática quando o aplicativo está aberto e encontra rede;
- modos contextuais **Ler** e **Editar** na mesma superfície do card, sem aba
  autoral concorrente;
- edição manual simples e assistência atômica local
  (`atomic-card-assistance`) para reparar recursos, reparar um ou vários cards
  da mesma microssequência ou criar exatamente um card;
- seleção direta de `main`, `response`, `after:text`, blocos de corpo e blocos
  de apoio, com prévia, fingerprint, descarte e uma reversão compacta;
- fila offline de até oito pedidos textuais, sem anexos, documentos, contexto
  montado ou respostas de provider persistidos;
- observação situada no card, com cinco categorias, texto curto, sincronização
  offline e retorno do responsável; `Trilhas` permite acompanhar o workspace
  sem copiar o card ou guardar histórico da conversa;
- rascunho local-first em curso privado ou do catálogo selecionado em
  `Trilhas`, sem outbox de conteúdo;
- GPT externo com gateway MCP para planejamento e autoria extensa, com leitura,
  edição estrutural, recombinação, prévia privada e submissão editorial
  (`atomic-resource-authoring`);
- OAuth 2.1 como autenticação exclusiva do gateway MCP, com autoridade
  resolvida pelos papéis e permissões do banco;
- capacidades por conta para autoria privada, submissão, revisão e publicação
  no catálogo, no mesmo assistente;
- painel progressivo em que `Trilhas` reúne planos e cursos e `Coleções` reúne
  o catálogo oficial; listas remotas são paginadas e abertas sob demanda;
- workspaces pessoais, de turma ou equipe com seis papéis locais, convites,
  transferência, composição corrente dos planos e cursos e administração no próprio
  app; o mesmo papel governa MCP, Action, autoria e publicação privada sem
  copiar o curso; responsáveis recebem contagens e **Pontos de melhoria**
  calculados a partir das observações correntes, sem histórico ou telemetria;
- sistema visual único em claro e escuro, sem paleta paralela, glifos de
  interface ou CSS do editor e do painel de submissão já substituídos;
- dezoito recursos de card: `paragraph`, `choice`, `composite`, `code`,
  `table`, `flow`, `tree`, `graph`, `relation_map`, `matrix`, `plane`,
  `formula`, `chart`, `sequence`, `annotated_text`, `linguistic_example`,
  `system_map` e `reaction`.

## Trabalho de estabilização

As próximas verificações concentram-se no uso cotidiano: retomada sem conexão, passagem entre web e Android, atualização de cursos oficiais, acessibilidade em telas pequenas e medição de espaço no banco à medida que o catálogo cresce.

## Edição contextual durante o estudo

O card continua sendo a superfície principal. **Editar** acrescenta seletores
no próprio card e uma caixa inferior; **Ler** os retira. Um reparo de vários
cards produz propostas independentes, valida todas contra a mesma base e grava
a microssequência uma única vez. A edição manual expõe somente título, texto,
enunciado, alternativas, resposta, feedback, lacunas e células compatíveis com
o recurso selecionado; não há JSON nem editor estrutural.

Pedido, resposta do provider e prévia permanecem efêmeros. O dispositivo
sobrescreve uma única entrada auxiliar por curso: no máximo oito pedidos, 4.000
caracteres e doze cards por pedido, além de uma única reversão. A reversão de
uma microssequência recém-criada guarda somente a identidade criada e as
posições anteriores das irmãs. Não existe histórico de edições nem outbox de
conteúdo.

Depois da confirmação local, até doze caminhos de microssequência ficam
sincronizáveis sem copiar o curso. Com rede, o aplicativo usa sua sessão atual
para abrir o workspace contextual determinístico, substituir ou retirar apenas
as unidades tocadas e publicar uma prévia privada. Curso privado conserva sua
identidade; curso do catálogo gera um fork privado e troca a seleção em Trilhas
somente depois da publicação. Falha de rede mantém a pendência compacta.

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
