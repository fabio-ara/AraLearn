# Arquitetura do AraLearn

Este documento descreve a arquitetura pública do AraLearn para apoiar decisões técnicas e de produto. Ele complementa o README, o contrato JSON e a documentação específica da assistência por IA generativa.

## Visão geral

AraLearn é uma aplicação web executada no navegador. O mesmo núcleo pode ser usado em distribuição web, em GitHub Pages e em APK Android empacotado com WebView.

A aplicação trabalha com três camadas principais:

- contrato público em JSON;
- estrutura de leitura derivada do contrato;
- interface de geração, leitura, autoria, revisão e navegação estrutural.

O contrato público descreve a estrutura autoral. A estrutura de leitura derivada organiza os dados necessários para renderização, validação visual e interação. A interface apresenta geração estrutural contextual, criação de rascunhos, leitura, edição, estudo, progresso local e assistência por IA generativa.

A arquitetura foi desenhada para tornar o contexto explícito. Curso, módulo, lição e microssequência formam uma moldura pequena para pedidos de geração ou revisão. Isso reduz ambiguidade, facilita validação e permite que modelos de linguagem mais econômicos sejam usados em tarefas delimitadas.

## Estrutura do repositório

```text
public/   Entrada web, assets e estilos da interface
src/      Contrato, compilação, renderização, persistência, edição, IA e UI
tests/    Suíte automatizada
scripts/  Utilitários de desenvolvimento e publicação
docs/     Documentação pública, contrato, arquitetura e exemplos
android/  Wrapper Android em WebView e build do APK
```

Diretórios centrais em `src/`:

- `contract/`: validação e representação do contrato público;
- `model/`: compilação do contrato para estruturas internas e regras de status das microssequências;
- `core/`: leitura de cards, árvores, opções de exercício e carregamento;
- `render/`: renderização de cards e documentos;
- `flowchart/`: projeção, geometria, viewport e prática de fluxogramas;
- `storage/`: persistência, progresso, importação, exportação e backup;
- `editor/`: operações de edição no contrato;
- `assist/`: integração com provedor configurado para execução efetiva das chamadas;
- `generation/`: contratos, prompts, planejamento, recursos, tipos, validação e estado de execução da geração assistida;
- `ui/`: navegação, telas, overlays, painéis contextuais, home única de cursos, painel da microssequência e estado da interface.

## Hierarquia de domínio

A hierarquia central é:

```text
Projeto
  -> Cursos
    -> Módulos
      -> Lições
        -> Microssequências
          -> Cards
```

Essa hierarquia aparece em:

- JSON público;
- navegação da interface;
- progresso local;
- importação e exportação;
- seleção de contexto para edição;
- encaixe de rascunhos em cursos.

## Fluxo de dados

O fluxo básico é:

```text
JSON público
  -> validação
  -> compilação
  -> estrutura de leitura derivada
  -> renderização
  -> interação do usuário
  -> edição ou progresso
  -> persistência local
```

A assistência por IA generativa usa um fluxo adicional:

```text
pedido do usuário
  -> plano local
  -> chamada ao serviço de IA generativa
  -> JSON intermediário
  -> validação e normalização
  -> contrato público
  -> aplicação local no alvo estrutural
  -> revisão do usuário
```

Há dois modos complementares de entrada de conteúdo:

- geração bottom-up: uma dúvida situada em curso, módulo e lição cria rascunhos de microssequências no ponto escolhido;
- importação top-down: cursos, módulos, lições ou microssequências preparados por processos externos entram pelo contrato JSON público.

No estado atual, a geração estrutural top-down e a geração bottom-up já compartilham a mesma navegação principal. O ponto de entrada muda conforme o nível aberto, mas o fluxo continua na mesma árvore estrutural.

## Persistência

O AraLearn separa projeto e progresso.

O projeto contém a estrutura estudável: cursos, módulos, lições, microssequências e cards. O progresso registra avanço local do usuário sobre essa estrutura.

A aplicação trabalha com dois formatos de troca:

- `aralearn.contract`: contrato estrutural público;
- `aralearn.storage`: backup completo do estado local, incluindo projeto e progresso.

A ação `Importar` detecta os dois formatos. Essa separação permite compartilhar material sem carregar necessariamente o histórico de estudo de outra pessoa.

Recortes estruturais também podem ser importados quando seguem o contrato `aralearn.contract`. Isso permite que autores externos produzam cursos inteiros ou partes de cursos sem depender da interface.

Além do contrato público e do progresso, a aplicação mantém persistências auxiliares locais para iterações de microssequência e outros estados internos da interface. Esses dados não contaminam a exportação estrutural.

## Interface e navegação

A interface principal começa com uma home única de cursos.

Nessa trilha, o usuário encontra:

- lista de cursos do projeto;
- ações globais compatíveis com a home;
- botão contextual para geração estrutural;
- navegação estrutural para curso, módulo, lição e microssequência.

A navegação estrutural inclui:

- home de cursos;
- tela de curso;
- tela de módulo;
- tela de lição;
- execução de microssequência;
- painel da microssequência;
- overlays de ações, importação, edição, configuração e histórico auxiliar.

O mesmo vocabulário visual é reaproveitado entre home, curso, módulo e lição, com topbar, heading, cards estruturais e ações compactas. A geração não vive mais em uma aba separada.

## Geração, rascunhos e painel

Os painéis contextuais mudam conforme o nível aberto.

Na home, no curso e no módulo, a assistência estrutural pode propor cursos, módulos e lições dentro do escopo atual.

Na lição, o painel contextual cria rascunhos de microssequências. O usuário escreve uma dúvida, objetivo ou pedido de organização, e a resposta validada vira uma sequência de microssequências `draft` com `cards: []`.

Rascunhos aparecem na própria árvore da lição, no lugar real em que depois serão revisados. Eles não entram no modo de estudo. A leitura principal coleta apenas microssequências `ready` e incluídas.

O painel da microssequência concentra:

- `Preview`;
- `Edição`;
- navegação pelos cards da versão em uso;
- geração ou edição de cards;
- anexos temporários para o pedido atual;
- tags e metadados da microssequência;
- ações de movimentação, exclusão e edição estrutural;
- controle da iteração gerada atual quando houver uma alteração pendente de aceitação ou exclusão.

Na geração ou edição de cards, o resultado validado é aplicado diretamente à microssequência aberta. Quando essa aplicação cria uma iteração nova, a interface expõe ações externas ao card para aceitar ou excluir a iteração atual, usando o histórico local como reversão imediata.

## Renderização de cards

Os cards são declarados por intenção didática no contrato público e renderizados por um motor comum. Os formatos principais são:

- `say`;
- `ask`;
- `code`;
- `table`;
- `tree`;
- `flow`;
- `plane`;
- `matrix`.

A estrutura de leitura derivada pode montar recursos auxiliares para interação, como opções de lacunas, árvores projetadas, geometria de fluxogramas, projeção de plano cartesiano e leitura matricial. Essas estruturas derivadas não pertencem ao contrato público.

## Distribuição

A distribuição web pública usa GitHub Pages. O artefato publicado preserva `public/` e `src/`, porque a aplicação usa módulos JavaScript nativos e mantém a mesma base de código da execução local.

O APK Android usa `WebViewAssetLoader` para servir os mesmos arquivos web como assets internos. A identidade visual usa o ícone do AraLearn na aba do navegador e no launcher do Android.

## Validação

A validação automatizada cobre:

- contrato público;
- exemplo renderizável;
- compilação da estrutura de leitura;
- renderização de formatos de card;
- persistência;
- progresso;
- importação e exportação;
- rascunhos e status explícito de microssequências;
- assistência por IA generativa;
- fluxogramas, árvores, plano cartesiano e matrizes.

Há também cobertura específica para:

- geração estrutural contextual;
- geração contextual de microssequências na lição;
- abertura do painel da microssequência na versão correta;
- navegação entre mini-cards;
- aplicação direta de iterações geradas;
- controle de aceitação ou exclusão da iteração atual.

Comandos principais:

```powershell
npm test
npm run validate:example
```

## Pontos arquiteturais em aberto

As decisões futuras devem considerar:

- como aproximar ainda mais geração estrutural, criação de rascunho e revisão sem dispersar o usuário;
- como evoluir o versionamento local para percursos mais auditáveis sem contaminar o contrato público;
- quando transformar parte do histórico local em parte exportável;
- como registrar vínculo entre fonte e card gerado;
- se o reposicionamento deve continuar no nível de microssequência ou permitir cards isolados;
- como incorporar fluxogramas à geração assistida com previsibilidade suficiente;
- como avaliar qualidade didática antes de aplicar conteúdo;
- como preservar funcionamento sem conexão contínua quando houver recursos que dependem de serviços externos.
