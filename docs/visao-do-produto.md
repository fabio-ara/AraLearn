# Visao do produto

Este documento apresenta o AraLearn como produto. Ele foi escrito para quem precisa entender o que o app e, por que ele existe e como sua identidade mudou.

## Problema

O problema que o AraLearn enfrenta nao e apenas falta de informacao. O problema contemporaneo e excesso de material sem percurso.

Hoje uma pessoa pode ter:

- ementa;
- bibliografia;
- slides;
- listas de exercicios;
- artigo cientifico;
- documentacao tecnica;
- respostas prontas de LLM.

Mesmo assim, ela continua sem saber:

- por onde comecar;
- o que entra antes do que;
- que ponto merece explicacao;
- que ponto merece pratica;
- como retomar depois de uma interrupcao;
- como transformar abundancia em estudo real.

## Resposta do produto

O AraLearn tenta resolver isso combinando:

- estrutura externa forte;
- autoria local;
- estudo ativo;
- intervencao assistida por LLM.

O app organiza o percurso em:

```text
curso -> modulo -> licao -> microssequencia -> card
```

A unidade didatica central nao e o card isolado. E a `microssequencia`.

## Mudanca recente de missao

O produto deixou de perseguir a ideia de top-down como pre-geracao massiva de cards.

A direcao atual e outra:

- o `top-down` organiza a trilha e planeja microssequencias;
- o `bottom-up` materializa a trilha durante o estudo;
- o usuario participa como autor do curso no proprio runtime;
- a LLM entra como apoio de planejamento e preenchimento, nao como autora soberana.

Isso muda a identidade do AraLearn de modo importante. Ele continua sendo um motor de geracao didatica, mas agora com uma divisao de trabalho mais nítida:

- estrutura ampla no top-down;
- autoria situada e pratica no bottom-up.

## Dois modos de uso

### 1. Top-down estrutural

Aqui o usuario parte de material amplo e pede ao app que o organize.

Exemplos:

- uma disciplina universitaria com ementa, bibliografia e slides;
- um artigo cientifico que precisa virar sequencia estudavel;
- um manual tecnico;
- uma trilha de onboarding;
- um conjunto de documentos de trabalho.

O top-down produz:

- cursos;
- modulos;
- licoes;
- microssequencias planejadas;
- governanca didatica inicial.

Ele nao precisa materializar cards por padrao para ser util. Sua funcao principal e dar forma estudavel ao material.

### 2. Bottom-up no runtime

Aqui o usuario ja esta estudando. O problema nao e organizar a disciplina inteira, mas destravar um ponto local.

Exemplos:

- "nao entendi este contraste";
- "essa microssequencia ficou ruim";
- "quero mais pratica aqui";
- "gere o conteudo da proxima microssequencia";
- "reformule este card".

Esse fluxo faz o estudo ganhar um carater dialogico: o usuario interroga o proprio percurso e a IA responde dentro da estrutura ja criada.

## O papel do usuario

O AraLearn nao tenta eliminar autoria humana. Ao contrario: ele recoloca a autoria dentro do uso.

O usuario:

- declara objetivo;
- fornece ou escolhe fonte;
- revisa a trilha;
- abre microssequencias planejadas;
- materializa, corrige e expande localmente;
- decide o que entra no estudo;
- preserva ou descarta iteracoes.

Essa participacao e parte essencial da proposta.

## O papel da LLM

A LLM nao decide o curso sozinha. Ela trabalha sob restricao.

O app define:

- contexto;
- escopo;
- governanca da licao;
- tipos didaticos;
- formatos de recurso;
- validacoes;
- limites de aplicacao.

A LLM ajuda a:

- organizar material em trilha;
- sugerir microssequencias;
- preencher conteudo local;
- reparar ou reformular o que nao ficou bom.

## O valor do produto

O valor do AraLearn nao esta em "gerar texto". Esta em aproximar quatro coisas:

- organizacao;
- estudo;
- revisao;
- autoria.

Essas quatro atividades normalmente ficam espalhadas por varias ferramentas. O AraLearn tenta reuni-las num unico ambiente.

## Experiencia desejada

A experiencia desejada e a de um estudante ou autor que:

1. sobe material;
2. recebe uma trilha organizada;
3. navega pela trilha antes de materializar tudo;
4. abre o ponto que deseja estudar;
5. conversa localmente com a estrutura por meio da IA;
6. vai construindo o curso enquanto o percorre.

## Horizonte

O horizonte do produto hoje e claro:

- transformar informacao em percurso;
- deslocar a IA para um papel auditavel;
- manter os dados e a autoria do lado do usuario;
- aproximar a pratica de estudo de uma construcao guiada, progressiva e revisavel.

Em resumo: o AraLearn nao quer ser mais um gerador de texto. Quer ser um motor de percurso didatico.
