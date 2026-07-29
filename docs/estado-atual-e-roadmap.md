# Estado do projeto

## Aplicativo disponível

O AraLearn está disponível na web e no Android, com a mesma aplicação JavaScript. A conta dá acesso ao catálogo oficial, às coleções, às trilhas pessoais, ao estudo, aos comentários e ao progresso.

Os cursos oficiais ficam uma única vez no banco compartilhado. Selecionar um curso não cria uma cópia para a conta. O dispositivo baixa apenas a árvore necessária para estudo sem conexão; progresso, comentários, seleções e trilhas são gravados como dados pessoais.

Uma alteração de conteúdo cria uma nova execução e uma revisão imutável; a
revisão oficial anterior continua preservada.

Também estão disponíveis:

- cadastro, confirmação por e-mail, recuperação de senha, sessão persistida e saída;
- biblioteca organizada por coleções e trilhas;
- progresso por lição e card, comentários e estudo sem conexão depois do primeiro download;
- sincronização automática quando o aplicativo está aberto e encontra rede;
- importação e exportação no formato JSON v4;
- edição manual, planejamento da estrutura e revisão localizada com assistência de linguagem;
- importação privada de JSON e importação pública restrita por papel;
- API de autoria pessoal e editorial com planejamento, produção, auditoria, reparo e validação retomável;
- integrações pessoais emitidas e revogadas pela própria conta, restritas a cursos privados;
- publicação no catálogo separada por permissão editorial;
- cards de texto, escolha, código, tabela, fluxograma, árvore, grafo, mapa de relações, matriz e plano cartesiano.

## Trabalho de estabilização

As próximas verificações concentram-se no uso cotidiano: retomada sem conexão, passagem entre web e Android, atualização de cursos oficiais, acessibilidade em telas pequenas e medição de espaço no banco à medida que o catálogo cresce.

## Autoria de cursos oficiais

O fluxo editorial usa workspaces versionados por um assistente externo.
Snapshots ficam isolados da árvore de estudo; prévias incompletas aparecem
somente na biblioteca privada, nunca no catálogo. A operação pode usar fontes
recuperadas fora do AraLearn, desde que o autor examine o resultado e registre
a procedência necessária.

Os próximos passos dessa área são testar o fluxo com cursos extensos, ampliar a gestão editorial para mais pessoas e acrescentar OAuth ou outras formas de identidade quando uma plataforma não aceitar a chave pessoal já disponível.

## Ambiente docente

Outra frente prevista é um ambiente para docentes, com turmas, acompanhamento da aprendizagem e colaboração entre autores. O desenho deverá preservar privacidade, transparência sobre serviços externos e responsabilidade humana sobre o conteúdo educacional.

## Pesquisa

O AraLearn será avaliado em situações de estudo com pouco tempo, conexão instável e alternância entre dispositivos. Entre as perguntas de pesquisa estão:

- microssequências ajudam a retomar o estudo?
- recursos visuais ajudam a compreender conteúdos estruturados?
- o funcionamento sem conexão é previsível para quem estuda?
- o catálogo compartilhado mantém o armazenamento sustentável com muitos cursos?
- a assistência de linguagem reduz esforço de autoria sem substituir a revisão humana?
