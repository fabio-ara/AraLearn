# Contrato JSON do AraLearn

Esta página documenta o formato `aralearn.contract`, usado para representar projetos completos ou recortes estruturais do AraLearn em JSON.

O objetivo desta documentação é permitir que qualquer pessoa consiga:

- escrever cursos manualmente;
- validar a estrutura antes de importar;
- adaptar um modelo de linguagem para produzir conteúdo compatível;
- gerar cursos, módulos, lições, microssequências ou cards fora da interface;
- versionar e revisar o conteúdo como arquivo aberto.

## Visão geral

O contrato atual usa sempre:

- `contract: "aralearn.contract"`
- `version: 1`
- `kind: "project"`

O JSON declara estrutura autoral e intenção didática. A aplicação deriva internamente identificadores auxiliares, projeções de renderização, estados de prática e outros elementos operacionais.

## Estrutura raiz

Todo documento válido usa esta forma:

```json
{
  "contract": "aralearn.contract",
  "version": 1,
  "kind": "project",
  "courses": []
}
```

## Hierarquia completa

```text
project
  course
    module
      lesson
        microsequence
          card
```

A mesma raiz `project` é usada tanto para um projeto completo quanto para recortes parciais importáveis.

Exemplos:

- um arquivo com `1` curso é um projeto válido;
- um arquivo com apenas parte de um curso continua sendo um projeto válido;
- um arquivo com apenas `1` microssequência também deve vir embalado dentro da hierarquia completa até `project`.

## Estrutura mínima por nível

### Projeto

Campos:

- `contract`: obrigatório, sempre `aralearn.contract`
- `version`: obrigatório, sempre `1`
- `kind`: obrigatório, sempre `project`
- `courses`: obrigatório, array de cursos

### Curso

Campos:

- `title`: obrigatório
- `description`: opcional
- `key`: opcional
- `modules`: obrigatório, array de módulos

### Módulo

Campos:

- `title`: obrigatório
- `description`: opcional
- `key`: opcional
- `lessons`: obrigatório, array de lições

### Lição

Campos:

- `title`: obrigatório
- `description`: opcional
- `key`: opcional
- `microsequences`: obrigatório, array de microssequências

### Microssequência

Campos:

- `title`: obrigatório
- `key`: opcional
- `tags`: opcional, array de strings
- `cards`: obrigatório, array de cards; pode ser vazio

### Card

Campos comuns:

- `key`: opcional
- `title`: opcional, mas recomendado
- `say`: opcional, texto explicativo ou texto com lacunas
- `after`: opcional, comentário final exibido na continuação
- `wrong`: opcional em cards textuais e obrigatório em `ask`

Cada card define sua função principal por campos semânticos simples.

## Exemplo completo mínimo

Este é o menor documento estruturalmente útil para começar a autorar:

```json
{
  "contract": "aralearn.contract",
  "version": 1,
  "kind": "project",
  "courses": [
    {
      "title": "Curso de exemplo",
      "modules": [
        {
          "title": "Módulo 1",
          "lessons": [
            {
              "title": "Lição 1",
              "microsequences": [
                {
                  "title": "Microssequência 1",
                  "cards": [
                    {
                      "title": "Ideia central",
                      "say": "Texto inicial do card."
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Recortes estruturais válidos

Importação e exportação usam sempre o envelope `project`, inclusive quando o conteúdo representa apenas parte do material.

### Exemplo: projeto contendo um único curso

```json
{
  "contract": "aralearn.contract",
  "version": 1,
  "kind": "project",
  "courses": [
    {
      "title": "Curso isolado",
      "modules": []
    }
  ]
}
```

### Exemplo: projeto contendo uma única microssequência

```json
{
  "contract": "aralearn.contract",
  "version": 1,
  "kind": "project",
  "courses": [
    {
      "title": "Curso recortado",
      "modules": [
        {
          "title": "Módulo recortado",
          "lessons": [
            {
              "title": "Lição recortada",
              "microsequences": [
                {
                  "title": "Microssequência recortada",
                  "cards": [
                    {
                      "title": "Card 1",
                      "say": "Conteúdo do recorte."
                    }
                  ]
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}
```

## Chaves (`key`)

`key` é opcional em qualquer nível.

Quando uma chave não é enviada, o validador gera uma chave estável a partir do título. Isso facilita autoria manual, mas há casos em que vale a pena definir `key` explicitamente:

- quando o conteúdo será regenerado várias vezes por automação;
- quando o título pode mudar sem mudar a identidade do item;
- quando o projeto precisa de maior previsibilidade em versionamento;
- quando uma integração externa precisa referenciar entidades por identificador fixo.

Recomendação prática:

- para edição manual simples, pode omitir `key`;
- para geração por modelo ou pipeline externo, prefira enviar `key`.

## Cards e intenções didáticas

O contrato não depende de um campo genérico de tipo. Em vez disso, o card declara sua intenção por campos semânticos.

### Card `say`

Uso:

- explicação;
- leitura guiada;
- texto com lacunas.

Exemplo simples:

```json
{
  "title": "Ideia central",
  "say": "O AraLearn organiza estudo em microssequências."
}
```

Exemplo com comentário final:

```json
{
  "title": "Síntese",
  "say": "O conteúdo pode ser lido em etapas menores.",
  "after": "A ideia importante é reduzir a fricção de estudo."
}
```

Exemplo com lacuna textual:

```json
{
  "title": "Complete",
  "say": "Cada card pertence a uma [[microssequência]].",
  "wrong": ["lição", "módulo"]
}
```

Regra prática:

- `wrong` ajuda a aplicação a construir distratores para lacunas textuais.

### Card `ask`

Uso:

- múltipla escolha.

Campos:

- `ask`: enunciado da pergunta
- `answer`: resposta correta
- `wrong`: array com respostas incorretas

Exemplo:

```json
{
  "title": "Leitura rápida",
  "ask": "Qual estrutura agrupa cards no AraLearn?",
  "answer": "Microssequência",
  "wrong": ["Curso", "Módulo"]
}
```

Regra prática:

- sempre envie pelo menos uma resposta correta e distratores claros;
- use alternativas curtas e comparáveis entre si.

### Card `code`

Uso:

- exibição de código com apoio textual opcional.

Campos:

- `code`: obrigatório
- `language`: opcional, mas recomendado
- `say`: opcional

Exemplo:

```json
{
  "title": "Trecho de código",
  "say": "Observe o identificador do contrato.",
  "language": "json",
  "code": "{ \"contract\": \"aralearn.contract\" }"
}
```

### Card `table`

Uso:

- tabela de leitura;
- tabela com lacunas em células.

Campos:

- `table.columns`: obrigatório, array de strings
- `table.rows`: obrigatório, array de linhas
- `table.title`: opcional

Exemplo:

```json
{
  "title": "Campos principais",
  "table": {
    "columns": ["Campo", "Uso"],
    "rows": [
      ["say", "Explicação ou lacuna textual"],
      ["ask", "Pergunta de múltipla escolha"]
    ]
  }
}
```

Regra prática:

- cada linha deve ter o mesmo número de colunas declarado em `columns`.

### Card `tree`

Uso:

- leitura e inspeção estrutural de diretórios.

Campos:

- `tree.base`: opcional
- `tree.current`: opcional
- `tree.selected`: opcional
- `tree.closed`: opcional, array de caminhos fechados por padrão
- `tree.items`: obrigatório, objeto que representa a estrutura

Exemplo:

```json
{
  "title": "Árvore de diretórios",
  "say": "A árvore mostra o diretório atual.",
  "tree": {
    "base": "/",
    "current": "/home/aluno/projetos",
    "selected": "/home/aluno/projetos/README.txt",
    "closed": ["/home/aluno/downloads"],
    "items": {
      "home": {
        "aluno": {
          "downloads": {
            "pacote.zip": null
          },
          "projetos": {
            "docs": {},
            "README.txt": null
          }
        }
      }
    }
  }
}
```

Regra estrutural:

- em `tree.items`, objeto representa pasta;
- `null` representa arquivo.

### Card `flow`

Uso:

- fluxogramas;
- prática por lacunas em símbolos, textos ou rótulos.

Exemplo:

```json
{
  "title": "Fluxo básico",
  "flow": [
    { "start": "Início" },
    { "process": "Validar", "blank": true },
    {
      "if": "Está correto?",
      "blank": { "target": "label", "key": "yes", "options": ["Sim", "Não"] },
      "then": [{ "output": "Renderizar" }],
      "else": [{ "process": "Revisar" }]
    },
    { "end": "Fim" }
  ]
}
```

`flow` aceita estruturas como:

- `start`
- `end`
- `input`
- `output`
- `process`
- `if`
- `while`
- `do_while`
- `for`
- `chain`
- `switch`

O campo público `blank` ativa a prática de símbolo, texto ou rótulo.

## Como escrever um curso manualmente

Uma forma segura de autorar manualmente é seguir esta ordem:

1. comece pela estrutura mínima do `project`;
2. crie um curso com `title`;
3. adicione um módulo;
4. adicione uma lição;
5. adicione uma microssequência;
6. insira um card simples com `say`;
7. valide o arquivo;
8. só depois acrescente `ask`, `table`, `tree` ou `flow`.

Sugestão prática:

- comece pequeno;
- valide cedo;
- aumente a complexidade por camadas.

## Como orientar um modelo de linguagem a gerar JSON válido

Se você pretende usar um modelo de linguagem para produzir conteúdo do AraLearn, vale instruí-lo com regras explícitas.

Checklist recomendada:

- peça saída em JSON puro;
- informe que a raiz deve usar `contract`, `version`, `kind` e `courses`;
- explique a hierarquia completa até `cards`;
- diga quais campos são obrigatórios em cada nível;
- peça que o modelo use apenas os campos documentados;
- diga que cada card deve escolher uma intenção principal clara;
- peça arrays válidos para `modules`, `lessons`, `microsequences` e `cards`;
- se quiser estabilidade maior, peça `key` explícita em todos os níveis;
- peça que o resultado seja importável sem campos extras.

Prompt-base sugerido:

```text
Gere um JSON válido do AraLearn usando o contrato aralearn.contract.
A raiz deve conter:
- contract: "aralearn.contract"
- version: 1
- kind: "project"
- courses: []

Hierarquia obrigatória:
project -> course -> module -> lesson -> microsequence -> card

Regras:
- use apenas campos documentados;
- cada curso, módulo, lição e microssequência deve ter title;
- cada microssequência deve ter cards;
- cada card deve usar uma intenção semântica clara, como say, ask, code, table, tree ou flow;
- não inclua campos operacionais derivados;
- retorne apenas JSON válido.
```

## Regras gerais

- o JSON público usa os campos documentados nesta página para declarar estrutura, conteúdo e intenção didática;
- a aplicação deriva automaticamente projeções auxiliares, índices e identificadores operacionais;
- `tree` descreve contexto, diretório atual, seleção opcional e estrutura de arquivos e pastas;
- `flow` descreve leitura e prática por meio de `blank`;
- importação e exportação usam o mesmo envelope `project`, inclusive para recortes;
- conteúdo público deve permanecer legível para autoria humana e geração assistida por modelos de linguagem.

## Exemplo renderizável

Arquivo público de referência:

- `docs/examples/aralearn-contract.renderable.json`

Você pode validar esse exemplo com:

```powershell
npm run validate:example
```
