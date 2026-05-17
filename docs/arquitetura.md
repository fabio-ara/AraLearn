# Arquitetura do AraLearn

## Ideia geral

A arquitetura do AraLearn parte de uma decisão: antes de pedir texto a um modelo de IA, o app organiza a tarefa.

Essa organização passa por estrutura pública do projeto, fontes, orientação da lição, linguagem autoral, contratos, validação e aplicação controlada de mudanças. O objetivo é evitar que a IA produza conteúdo solto, difícil de revisar ou desalinhado com a trilha.

Em vez de concentrar toda a inteligência em um prompt, o AraLearn distribui responsabilidade entre produto, usuário, contrato e modelo.

## Estrutura pública

A árvore pública do projeto é:

```text
projeto -> curso -> módulo -> lição -> microssequência -> card
```

Essa estrutura serve a quatro funções ao mesmo tempo:

- persistir o material;
- orientar a navegação;
- situar a geração de conteúdo;
- preservar continuidade entre planejamento e estudo.

Quando o usuário pede uma intervenção, o app sabe onde ela ocorre. Uma edição dentro de uma microssequência pode herdar contexto da lição; uma geração estrutural pode respeitar curso e módulo; uma fonte pode ser ligada a uma etapa específica.

## Lição como ponto de governança

A lição é o ponto em que a arquitetura didática fica mais precisa. Ela pode guardar orientação sobre escopo, notação, prática, limites, erros comuns e fontes.

Isso evita que cada geração comece do zero. A IA não precisa apenas “entender o tema”; ela recebe a moldura da tarefa. O usuário também se beneficia, pois consegue ver e corrigir a orientação que governa aquela parte do percurso.

## Linguagem autoral

O AraLearn usa uma linguagem autoral simples, baseada em JSON. Ela representa conteúdo didático em estruturas legíveis e persistíveis, como:

- `say`;
- `ask`;
- `code`;
- `table`;
- `flow`;
- `tree`;
- `plane`;
- `matrix`.

A linguagem autoral é intermediária. Ela não é texto livre sem controle nem desenho visual de baixo nível. O usuário e a IA podem trabalhar sobre essa forma; o motor de estudo transforma a descrição em apresentação e prática.

## Motor didático

O motor didático reúne regras e critérios de qualidade do produto. Ele ajuda a avaliar se uma microssequência respeita progressão, prática, suficiência e coerência com a lição.

Essa camada impede que a didática dependa apenas do serviço de IA escolhido. Modelos diferentes podem variar em fluência, mas o produto precisa preservar suas próprias exigências.

## Motor de produção

O motor de produção organiza tarefas em fases. Dependendo do fluxo, ele pode:

1. receber fonte ou pedido do usuário;
2. extrair texto útil;
3. delimitar escopo;
4. propor estrutura;
5. auditar a proposta;
6. reparar inconsistências;
7. gerar alteração controlada;
8. validar o contrato público;
9. aplicar a mudança no projeto.

Essa decomposição torna o resultado mais revisável e reduz o risco de substituições cegas do material.

## Serviços de IA

O AraLearn pode conversar com diferentes serviços de IA. Essa camada cuida de envio de prompts, anexos, limites, respostas, tentativas, erros e configuração.

A decisão arquitetural importante é separar serviço de IA e didática. O serviço executa uma parte do trabalho; ele não define sozinho a estrutura, o contrato nem o critério de qualidade.

## Fontes e ancoragem

O app pode usar arquivos e textos como fontes para organizar e materializar conteúdo. Hoje o projeto já contempla extração textual de formatos como PDF e DOCX.

O objetivo não é reproduzir o documento original dentro do app. O objetivo é transformar fonte em orientação de estudo: tópicos, exemplos, definições, procedimentos, limitações e prática.

Quando possível, o conteúdo gerado deve manter vínculo com as fontes usadas. Isso facilita inspeção e correção.

## Alterações controladas

Quando o app muda o projeto, a alteração deve ser compreensível. Sempre que possível, o sistema evita substituir blocos inteiros sem necessidade.

A aplicação controlada de mudanças ajuda em três pontos:

- o usuário entende o que mudou;
- a validação consegue detectar problemas;
- versões anteriores podem continuar recuperáveis.

Isso é importante porque o AraLearn lida com material de estudo, não apenas com texto descartável.

## Persistência no dispositivo

O projeto fica salvo no dispositivo do usuário. Isso permite abrir, revisar e estudar material já existente sem conexão contínua.

A geração com IA remota depende de internet. Um provedor local depende de configuração no ambiente. A arquitetura combina autonomia para continuidade do estudo com assistência pontual para produção e reorganização.

## Critério de coerência arquitetural

A arquitetura está funcionando quando:

- a árvore pública permanece legível;
- o usuário sabe onde está intervindo;
- a IA recebe contexto situado;
- o resultado passa pelo contrato público;
- o conteúdo pode ser revisado e corrigido;
- a falha de uma operação não corrompe o projeto.
