# Arquitetura do AraLearn

Este documento descreve a arquitetura pública do AraLearn para apoiar decisões técnicas e de produto. Ele complementa o README, o contrato JSON e a documentação específica da assistência por IA generativa.

## Visão geral

AraLearn é uma aplicação web executada no navegador. O mesmo núcleo pode ser usado em distribuição web e em APK Android empacotado com WebView.

A aplicação trabalha com três camadas principais:

- contrato público em JSON;
- runtime interno derivado do contrato;
- interface de geração, leitura, autoria e revisão.

O contrato público descreve a estrutura autoral. O runtime interno deriva dados necessários para renderização, validação visual e interação. A interface apresenta geração de rascunhos, cursos, lições, microssequências, cards, progresso, edição e assistência por IA generativa.

## Estrutura do repositório

```text
public/   Entrada web, assets e estilos da interface
src/      Contrato, compilação, renderização, persistência, edição, IA e UI
tests/    Suíte automatizada
scripts/  Utilitários de desenvolvimento
docs/     Documentação pública, contrato, arquitetura e exemplos
```

Diretórios centrais em `src/`:

- `contract/`: validação e representação do contrato público;
- `model/`: compilação do contrato para estruturas internas;
- `core/`: runtime de cards, árvores, opções de exercício e carregamento;
- `render/`: renderização de cards e documentos;
- `flowchart/`: projeção, geometria, viewport e prática de fluxogramas;
- `storage/`: persistência, progresso, importação, exportação e backup;
- `editor/`: operações de edição no contrato;
- `assist/`: planejamento, prompts, chamadas e normalização da assistência por IA generativa;
- `ui/`: navegação, telas, overlays, aba `Gerar`, aba `Cursos`, painel de microssequência e estado da interface.

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
  -> runtime interno
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
  -> rascunho ou versão ativa
```

## Persistência

O AraLearn separa projeto e progresso.

O projeto contém a estrutura estudável: cursos, módulos, lições, microssequências e cards. O progresso registra avanço local do usuário sobre essa estrutura.

A aplicação trabalha com dois formatos de troca:

- `aralearn.contract`: contrato estrutural público;
- `aralearn.storage`: backup completo do estado local, incluindo projeto e progresso.

A ação `Importar` detecta os dois formatos. Essa separação permite compartilhar material sem carregar necessariamente o histórico de estudo de outra pessoa.

## Interface e navegação

A interface principal começa com duas abas:

- `Gerar`: seleção de curso, módulo e lição, pedido do usuário, modelo e criação de rascunhos;
- `Cursos`: estrutura de cursos, módulos, lições, microssequências e execução de cards.

A navegação estrutural inclui:

- tela de curso;
- tela de lição;
- execução de microssequência;
- painel da microssequência;
- overlays de ações, importação, edição, configuração e histórico.

## Geração, rascunhos e painel

A aba `Gerar` cria rascunhos diretamente dentro da lição selecionada. O usuário escolhe o contexto na hierarquia, escreve uma dúvida ou comentário e recebe uma escada de microssequências planejada por IA generativa.

Cada item validado dessa escada vira uma microssequência com `status: "draft"` e `cards` vazio.

Rascunhos aparecem na aba `Cursos`, no lugar real da estrutura, mas não entram no runtime de estudo. O runtime coleta apenas microssequências `ready`.

O painel da microssequência concentra:

- preview;
- edição por novo pedido;
- tags explícitas;
- versões locais;
- navegação pelos cards da versão ativa.

Esse painel é o ponto de curadoria do material gerado ou editado.

## Renderização de cards

Os cards são declarados por intenção didática no contrato público e renderizados por um motor comum. Os formatos principais são:

- `say`;
- `ask`;
- `code`;
- `table`;
- `tree`;
- `flow`.

O runtime interno pode derivar estruturas auxiliares para interação, como opções de lacunas, árvores projetadas e geometria de fluxogramas. Essas estruturas derivadas não pertencem ao contrato público.

## Validação

A validação automatizada cobre:

- contrato público;
- exemplo renderizável;
- compilação para runtime;
- renderização de formatos de card;
- persistência;
- progresso;
- importação e exportação;
- rascunhos e status explícito de microssequências;
- assistência por IA generativa;
- fluxogramas e árvores.

Comandos principais:

```powershell
npm test
npm run validate:example
```

## Pontos arquiteturais em aberto

As decisões futuras devem considerar:

- como evoluir o versionamento local para percursos auditáveis;
- quando transformar versões locais em parte exportável;
- como registrar vínculo entre fonte e card gerado;
- se o reposicionamento deve continuar no nível de microssequência ou permitir cards isolados;
- como incorporar fluxogramas à geração assistida;
- como avaliar qualidade didática antes de aplicar conteúdo;
- como preservar funcionamento sem conexão contínua quando houver recursos que dependem de serviços externos.
