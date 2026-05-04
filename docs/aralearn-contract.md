# Contrato Público do AraLearn

Este documento registra o contrato público do AraLearn.

O identificador do contrato é `aralearn.contract`.

## Estrutura geral

O contrato:

- manter a hierarquia `course -> module -> lesson -> microsequence -> card`;
- preservar `microssequência` como camada estrutural obrigatória;
- simplificar a linguagem autoral do card para consumo humano e por LLM;
- empurrar detalhes de runtime, layout e estruturas auxiliares para o motor interno;
- reduzir a dependência de campos genéricos difíceis de prever em geração assistida.

## Microssequência

Forma base:

```json
{
  "title": "Modelo cascata",
  "tags": ["Processos de software"],
  "cards": [
    {
      "type": "text",
      "title": "Ideia central",
      "text": "O modelo cascata organiza o trabalho em fases sequenciais."
    }
  ]
}
```

Campos:

- `title`: obrigatório;
- `tags`: opcional;
- `cards`: obrigatório.

O contrato usa campos rasos, previsíveis e específicos por tipo.

Exemplos de linguagem desejada:

- `type`;
- `text`;
- `ask`;
- `answer`;
- `wrong`;
- `code`;
- `flow`.

Tipos cobertos:

- `text`
- `choice`
- `complete`
- `editor`
- `table`
- `flow`
- `image`

## Regras operacionais

O contrato é validado pelo aplicativo e pelo utilitário de linha de comando.

Exemplo público:

- `docs/examples/aralearn-contract.renderable.json`

O motor continua responsável por:

- validar coerência estrutural fina;
- gerar `key` quando necessário;
- compilar ids internos e índices;
- transformar intenção pública em estruturas internas ricas;
- sustentar renderização, navegação, persistência e apoio à autoria.

## Objetivo

Com esse contrato, o AraLearn busca:

- mais simples para autoria manual;
- mais previsível para geração via API;
- menos acoplado ao runtime interno;
- mais próximo da clareza autoral buscada para o produto.
