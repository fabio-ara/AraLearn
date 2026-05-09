# Visão do produto

Este documento apresenta o AraLearn como produto e como objeto de pesquisa. Ele foi escrito para leitores que ainda não conhecem a aplicação pelo código, mas precisam entender sua proposta antes de discutir decisões técnicas, pedagógicas ou acadêmicas.

## Síntese

AraLearn é uma aplicação open source que transforma conteúdos, dúvidas e intenções de estudo em microssequências didáticas. Essas microssequências organizam explicações, exemplos, exercícios, lacunas, tabelas, árvores de diretórios, código e fluxogramas em cards navegáveis e revisáveis.

O produto funciona como um motor de aprendizagem ativa: em vez de apenas guardar material, ele procura converter informação em percurso de estudo.

A identidade do projeto parte de uma ideia simples: aprendizagem melhora quando informação vira ação pequena, verificável e retomável.

## Problema

A informação se tornou abundante. Com a inteligência artificial generativa, explicações, exemplos, resumos e respostas podem ser produzidos em grande quantidade. Mesmo assim, disponibilidade de informação não resolve automaticamente a aprendizagem.

Um estudante pode continuar sem saber:

- por onde começar;
- qual parte praticar;
- o que revisar;
- como conferir se entendeu;
- como retomar o estudo depois de uma pausa;
- como transformar uma dúvida pontual em treino acumulável.

Esse problema é especialmente sensível para estudantes trabalhadores, pessoas em transição de carreira e estudantes em rotinas com atenção fragmentada.

Também é um problema típico da aprendizagem mediada por inteligência artificial generativa. A abundância de respostas pode diminuir o custo de obter explicação, mas aumentar o custo de escolher, ordenar, praticar e revisar.

## Proposta

O AraLearn propõe um ciclo de estudo controlado pelo usuário:

```text
conteúdo ou dúvida
  -> microssequência
  -> cards
  -> prática ativa
  -> revisão
  -> edição
  -> reorganização
  -> consolidação em curso
```

A aplicação aproxima três atividades que normalmente ficam separadas:

- autoria de material didático;
- estudo ativo;
- revisão do percurso.

O usuário pode estudar, editar, importar, exportar, revisar, criar rascunhos e reorganizar material dentro do mesmo ambiente.

Essa integração permite duas entradas complementares. Na entrada bottom-up, uma dúvida concreta gera rascunhos no contexto da lição. Na entrada top-down, materiais produzidos por pipelines externos podem entrar como cursos, módulos, lições ou microssequências em JSON.

No estado público atual, essas duas entradas ainda aparecem em superfícies diferentes da interface. O fluxo bottom-up começa na aba `Gerar`, com seleção explícita de curso, módulo e lição, e só depois leva o usuário de volta à árvore de cursos para revisar o resultado. Isso preserva contexto estrutural, mas ainda exige atenção extra para não perder a continuidade entre gerar, localizar, revisar e estudar.

## Público principal

O AraLearn foi pensado para apoiar estudo em condições reais:

- pouco tempo disponível;
- pausas frequentes;
- disciplinas simultâneas;
- deslocamentos;
- retomadas sucessivas;
- necessidade de aprender ferramentas, conceitos e procedimentos sob pressão.

O produto pode ser usado por estudantes, professores, autores de material didático, pesquisadores em educação e pessoas que desejam construir repositórios pessoais de aprendizagem.

## Princípios

O produto é guiado por alguns princípios:

- A aprendizagem precisa de prática, não apenas exposição a conteúdo.
- O estudante deve manter controle sobre seu material.
- O material deve ser portável, validável e versionável em JSON.
- A inteligência artificial generativa deve auxiliar a transformação didática, não substituir a revisão humana.
- O conteúdo deve poder ser estudado mesmo sem conexão contínua.
- A aplicação deve favorecer retomada depois de interrupções.
- O percurso de aprendizagem deve ser mais auditável do que uma conversa isolada com um modelo de linguagem.
- A eficiência deve servir à formação, não substituir leitura, reflexão e revisão crítica.

## O que já existe

No estado atual, o AraLearn reúne:

- organização em cursos, módulos, lições, microssequências e cards;
- contrato JSON público para projetos e recortes estruturais;
- backup completo do estado local;
- persistência de progresso no dispositivo;
- importação e exportação;
- renderização de diferentes formatos de card;
- aba `Gerar` para criar rascunhos de microssequências dentro da estrutura dos cursos;
- aba `Cursos` para navegação, estudo, importação, exportação, reordenação e revisão estrutural;
- status `draft` e `ready` para separar autoria em andamento e conteúdo executável;
- exclusão de microssequências do runtime por `included: false`, sem removê-las da árvore;
- painel de microssequência com `Preview`, `Edição`, versões locais e anexos temporários;
- assistência por serviços de inteligência artificial generativa acessados por API;
- validação automatizada do contrato público e dos exemplos.
- publicação web por GitHub Pages e empacotamento Android com ícone próprio.

## Estado atual da experiência

A interface pública implementada hoje combina:

- home com abas iconográficas `Gerar` e `Cursos`;
- navegação estrutural `curso -> módulo -> lição -> microssequência`;
- estudo apenas de microssequências `ready` incluídas;
- edição e geração de cards em uma tela própria da microssequência.

Esse desenho já permite autoria, estudo e revisão no mesmo ambiente, mas ainda apresenta uma tensão de UX importante: a entrada bottom-up começa fora da navegação da lição e a consolidação acontece dentro dela. Na prática, isso pode aumentar o risco de o usuário leigo se perder entre intenção de estudo, contexto estrutural e destino final do rascunho.

## Horizonte

O horizonte do AraLearn é transformar aprendizagem em percurso estruturado, revisável e controlado pelo usuário.

Isso abre espaço para pesquisa em:

- aprendizagem ativa mediada por IA generativa;
- redução de fricção em estudo autodirigido;
- rastreabilidade entre fonte, transformação e card;
- qualidade didática de lacunas, alternativas e exemplos;
- organização de conhecimento pessoal em repositórios portáveis;
- avaliação de eficiência, retenção e retomada de estudo.

O produto não precisa realizar todo esse horizonte de uma vez. A direção arquitetural deve permitir crescimento incremental sem perder clareza, portabilidade e controle do usuário.

Há uma inspiração acadêmica e cultural ampla por trás dessa direção: flashcards, aprendizagem ativa, escrita em rede, versionamento, hipertexto, documentação aberta e organização pessoal do conhecimento. O AraLearn não pretende substituir essas tradições; procura aproximá-las em uma ferramenta pequena, local, portável e aberta.
