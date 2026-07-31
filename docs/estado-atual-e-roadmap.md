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
- biblioteca organizada por coleções e trilhas;
- progresso por lição e card, comentários e estudo sem conexão depois do primeiro download;
- sincronização automática quando o aplicativo está aberto e encontra rede;
- importação e exportação no formato JSON v4;
- edição manual e assistência atômica local (`atomic-card-assistance`) para
  reparar recursos, reparar um card inteiro ou criar um card;
- seleção de `main`, `response`, `after:text`, blocos de corpo e blocos de
  apoio, com prévia e fingerprint antes da aplicação;
- rascunho local-first em curso privado ou do catálogo selecionado em
  `Trilhas`, sem outbox de conteúdo;
- importação privada de JSON e importação pública restrita por papel;
- GPT externo com gateway MCP para planejamento e autoria extensa, com leitura,
  edição estrutural, recombinação, prévia privada e submissão editorial
  (`atomic-resource-authoring`);
- OAuth 2.1 como autenticação exclusiva do gateway MCP, com autoridade
  resolvida pelos papéis e permissões do banco;
- capacidades por conta para autoria privada, submissão, revisão e publicação
  no catálogo, no mesmo assistente;
- dezoito recursos de card: `paragraph`, `choice`, `composite`, `code`,
  `table`, `flow`, `tree`, `graph`, `relation_map`, `matrix`, `plane`,
  `formula`, `chart`, `sequence`, `annotated_text`, `linguistic_example`,
  `system_map` e `reaction`.

## Trabalho de estabilização

As próximas verificações concentram-se no uso cotidiano: retomada sem conexão, passagem entre web e Android, atualização de cursos oficiais, acessibilidade em telas pequenas e medição de espaço no banco à medida que o catálogo cresce.

## Autoria de cursos oficiais

O fluxo editorial usa workspaces compostos por um assistente externo. A edição
corrente fica no PostgreSQL e só vira artefato integral no Storage quando há
publicação. A submissão aponta para o hash exato de uma revisão privada. Prévias
incompletas aparecem somente na biblioteca privada, nunca no catálogo.

Uma revisão privada pode ser submetida, assumida por quem revisa, corrigida em
uma cópia editorial independente e devolvida com pedido de ajustes ou rejeição.
Somente um curso completo pode ser aceito numa coleção. É o mesmo assistente;
as capacidades mudam conforme a conta conectada.

Os próximos passos dessa área são testar o fluxo com cursos extensos, medir a
qualidade das recombinações e avaliar o trabalho editorial com mais pessoas. A
autoria estrutural remota já usa exclusivamente o gateway MCP com OAuth 2.1.
Ela pode usar fontes recuperadas fora do AraLearn, desde que a pessoa autora
examine o resultado e registre a procedência necessária.

## Ambiente docente

Outra frente prevista é um ambiente para docentes, com turmas, acompanhamento da aprendizagem e colaboração entre autores. O desenho deverá preservar privacidade, transparência sobre serviços externos e responsabilidade humana sobre o conteúdo educacional.

## Pesquisa

O AraLearn será avaliado em situações de estudo com pouco tempo, conexão instável e alternância entre dispositivos. Entre as perguntas de pesquisa estão:

- microssequências ajudam a retomar o estudo?
- recursos visuais ajudam a compreender conteúdos estruturados?
- o funcionamento sem conexão é previsível para quem estuda?
- o catálogo compartilhado mantém o armazenamento sustentável com muitos cursos?
- a assistência de linguagem reduz esforço de autoria sem substituir a revisão humana?
