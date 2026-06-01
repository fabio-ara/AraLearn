# Arquitetura

A arquitetura do AraLearn existe para preservar uma tese operacional simples: a resposta de um serviço textual só pode alterar o projeto do usuário depois de passar por contrato, recompilação, validação e versionamento. Essa exigência é o que torna o produto auditável, exportável e resistente a saídas convincentes, porém malformadas.

Os envelopes enviados aos serviços estão em [Fluxos, prompts e contratos de geração](fluxos-prompts-e-contratos.md). O formato persistido final está em [Contrato público](aralearn-contract.md). O enquadramento pedagógico e crítico dessas escolhas está em [Fundamentos, pesquisa e governança](fundamentos-pesquisa-e-governanca.md).

## Visão geral

O sistema trabalha sobre um documento raiz persistido localmente:

```json
{
  "contract": "aralearn.contract",
  "version": 3,
  "kind": "project",
  "courses": []
}
```

O projeto é composto por:

```text
project
└── course
    └── module
        └── lesson
            └── microsequence
                └── version
                    └── card
```

Essa árvore é simultaneamente estrutura didática, estrutura persistida e base de contexto para geração local.

## Responsabilidades principais

O desenho separa três responsabilidades.

### 1. O usuário

- define o escopo;
- revisa a trilha;
- escolhe a microssequência aberta;
- decide o pedido local;
- aprova, corrige ou rejeita o material.

### 2. O serviço textual

- interpreta o escopo ou o contexto local;
- propõe trilha ou forma didática;
- preenche campos de conteúdo nas etapas em que é chamado.

### 3. O app

- mantém o projeto persistido;
- monta contratos transitórios de geração;
- seleciona contexto;
- recompila o card ou a estrutura final;
- valida coerência estrutural e didática;
- preserva versões e histórico;
- renderiza o material estudável.

Essa separação impede que uma resposta textual seja confundida com projeto válido antes da verificação local.

## Entidades do projeto

### `course`

Delimita o campo geral de estudo.

### `module`

Organiza uma região do curso e possui `guide` próprio, isto é, um recorte didático local com objetivo, inclusões, exclusões, notação e desvios a evitar.

### `lesson`

Concentra uma etapa de aprendizagem dentro do módulo, também com `guide`, tópicos e microssequências.

### `microsequence`

É a unidade principal de progressão. Guarda objetivo, papel, dependências, cobertura, critérios de verificação, versões e a versão ativa.

### `version`

Preserva uma materialização específica da microssequência, com histórico de origem, pedido, resumo, cards e validação.

### `card`

Materializa explicação, prática ou representação num recurso específico.

## O papel de `guide`

`guide` é o objeto que define o recorte local de módulo e lição:

```json
{
  "goal": "Explicar a regra local.",
  "include": ["conjunção"],
  "exclude": ["predicados"],
  "notation": ["Use P e Q."],
  "avoid": ["Não abrir outro tópico."]
}
```

Em termos arquiteturais, `guide` cumpre duas funções:

- orienta a composição da trilha;
- limita o que a geração local pode introduzir naquele ponto.

`exclude` é tratado como fronteira rígida. O validador rejeita uso relevante de itens excluídos em títulos, objetivos, perguntas, exemplos e alternativas.

## Dependências e ordem local

`dependsOn` liga microssequências da mesma lição. O validador rejeita:

- referência inexistente;
- auto-dependência;
- dependência futura;
- ciclo.

Essa regra é simples, mas importante: ela mantém a trilha auditável e permite que o contexto local seja montado sem recorrer ao curso inteiro.

## Versões

Cada geração ou correção cria uma nova entrada em `versions`.

```json
{
  "id": "version-1",
  "createdAt": "2026-05-24T12:00:00.000Z",
  "source": "llm",
  "action": "generate",
  "request": "Gerar explicação e prática.",
  "summary": "Primeira versão da etapa.",
  "cards": [],
  "validation": {
    "ok": true,
    "issues": []
  }
}
```

`activeVersion` aponta para a versão usada no estudo. Isso permite experimentar nova materialização sem destruir automaticamente a anterior.

## Recursos e geometria local

O contrato aceita recursos como `matrix`, `plane`, `graph`, `relation_map`, `flow` e `tree`. Em vários deles, o app persiste principalmente a estrutura e resolve a geometria localmente no runtime de renderização.

Exemplos:

- em `graph`, o contrato prioriza vértices e arestas; a geometria é resolvida pelo motor do app;
- em `relation_map`, o contrato explicita conjuntos e relações; a disposição visual é calculada localmente;
- em `flow`, o contrato persiste uma `structure` semântica; o motor deriva fluxograma, portas, ramos e layout.

Essa decisão arquitetural reduz dependência de coordenadas produzidas pelo serviço textual e concentra a coerência visual no runtime do app.

## Camadas do código

O repositório organiza responsabilidades técnicas em camadas relativamente estáveis.

- `src/domain/`
  Define e valida o domínio persistido.

- `src/contract/`
  Concentra o contrato público e a validação estrutural principal.

- `src/model/`
  Compila estruturas internas e contratos persistidos em formas úteis para execução e renderização.

- `src/generation/topDown/`
  Planeja curso, módulos, lições e microssequências a partir do escopo.

- `src/generation/bottomUp/`
  Materializa ou corrige cards dentro de uma microssequência.

- `src/generation/contracts/`
  Monta os envelopes transitórios enviados aos serviços textuais.

- `src/generation/validation/`
  Aplica validação estrutural e didática nas saídas intermediárias e finais.

- `src/generation/repair/`
  Executa reparos mecânicos permitidos, sem inventar conteúdo disciplinar.

- `src/generation/runtime/`
  Coordena execução, histórico, retomada e aplicação do resultado.

- `src/render/`
  Renderiza cards válidos na interface de estudo.

- `src/ui/`
  Organiza a experiência de autoria, navegação e estudo.

## O motor estruturado de geração

No código e em parte da documentação técnica, a expressão `Structured Engine` designa o **motor estruturado de geração**. Ele é o caminho principal de produção textual do app.

Seu princípio é simples:

- dividir a geração em etapas menores;
- trabalhar com catálogos fechados de recursos e operações;
- pedir ao serviço textual apenas o conteúdo necessário em cada fase;
- recompilar o objeto final localmente antes de validar e persistir.

Em vez de pedir ao serviço textual que escreva o JSON público completo do card final de uma vez, o app monta um percurso de trabalho com campos controlados e valores canônicos. Isso reduz erro de forma sem empobrecer a liberdade didática local.

## Planejamento estrutural

O planejamento estrutural parte de um escopo informado pelo usuário e produz curso, módulos, lições e microssequências. Esse fluxo não gera cards.

Arquiteturalmente, ele serve para:

- transformar intenção ampla em trilha explícita;
- registrar fronteiras por `guide`;
- tornar o percurso inspeccionável antes da materialização local.

## Geração local

A geração local parte de uma microssequência aberta. Ela pode:

- gerar cards;
- corrigir a versão atual;
- criar uma microssequência de apoio;
- materializar a próxima microssequência planejada.

No runtime atual, esse caminho é dividido em três etapas principais:

1. planejamento fino da intervenção;
2. preenchimento dos campos do template ativo;
3. auditoria local com correções pontuais.

O serviço textual não devolve diretamente o projeto persistido final. O app recompila, verifica coerência e só então cria a nova versão.

## Montagem de contexto

No fluxo local, o contexto não é reunido de forma opaca. O app monta explicitamente um pacote com:

- caminho da etapa aberta;
- `guide` ativo;
- objetivo, papel, cobertura e verificações da microssequência;
- dependências declaradas;
- referências escolhidas pelo usuário;
- próxima microssequência planejada;
- versão atual e cards existentes, quando a operação é de correção;
- fontes anexadas e resolvidas.

Essa escolha melhora a auditabilidade do que efetivamente entrou em cada intervenção.

## Histórico e retomada

Cada execução registra estado, etapa e artefatos validados. Um fluxo típico passa por momentos como:

```text
prepare -> plan -> draft -> compile -> validate -> complete
```

Se uma etapa falha, o projeto anterior permanece intacto. A retomada reaproveita artefatos já aceitos e refaz apenas o trecho pendente.

## Regras de integridade

O projeto só muda quando a resposta passa por validação. Entre as situações rejeitadas pelo sistema estão:

- campos fora do contrato esperado;
- dependência incoerente;
- prática aberta onde o produto exige exercício fechado;
- recurso visual sem dados suficientes;
- uso relevante de itens excluídos;
- contexto insuficiente para resolver a questão no próprio card;
- repetição indevida de caso em papéis que exigem variação.

## Síntese

A arquitetura do AraLearn não foi desenhada para “embrulhar” respostas de IA. Ela foi desenhada para transformar geração assistida em material estudável, versionado e exportável. O serviço textual interpreta e propõe; o app delimita, recompila, valida e preserva; o usuário mantém o controle editorial do projeto.
