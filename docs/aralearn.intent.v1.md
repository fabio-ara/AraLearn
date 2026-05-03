# aralearn.intent.v1

## Objetivo

`aralearn.intent.v1` é o contrato público inicial de autoria estrutural do AraLearn.

Ele descreve intenção autoral, não detalhes de renderização, layout, persistência ou progresso.

## Hierarquia obrigatória

Todo documento válido segue esta estrutura:

```text
curso
  módulo
    lição
      microssequência
        card
```

Regras centrais:

- microssequência é obrigatória;
- todo card pertence a uma microssequência;
- card solto é inválido;
- o documento precisa declarar `contract: "aralearn.intent.v1"`.

## Forma geral

```json
{
  "contract": "aralearn.intent.v1",
  "course": {
    "key": "curso-exemplo",
    "title": "Curso de exemplo",
    "modules": [
      {
        "key": "fundamentos",
        "title": "Fundamentos",
        "lessons": [
          {
            "key": "primeira-licao",
            "title": "Primeira lição",
            "microsequences": [
              {
                "key": "introducao",
                "objective": "Apresentar o primeiro conceito",
                "cards": [
                  {
                    "key": "conceito-inicial",
                    "intent": "text",
                    "title": "Conceito inicial",
                    "data": {
                      "text": "Conteúdo inicial."
                    }
                  }
                ]
              }
            ]
          }
        ]
      }
    ]
  }
}
```

## Modelo conceitual

### Curso

Campos:

- `key`: identificador estável do curso;
- `title`: título público do curso;
- `description`: opcional;
- `modules`: lista obrigatória de módulos.

### Módulo

Campos:

- `key`;
- `title`;
- `description`: opcional;
- `lessons`: lista obrigatória de lições.

### Lição

Campos:

- `key`;
- `title`;
- `description`: opcional;
- `microsequences`: lista obrigatória de microssequências.

### Microssequência

Campos:

- `key`;
- `title`: opcional;
- `objective`: obrigatório;
- `cards`: lista obrigatória de cards.

### Card

Campos:

- `key`;
- `intent`;
- `title`: opcional;
- `data`: opcional, objeto livre para a intenção correspondente.

Nesta fase, `data` permanece aberto. A forma detalhada por intenção será refinada depois.

## Regras de `key`

`key` é o identificador público exportável do contrato.

Regras:

- deve ser estável no escopo adequado;
- deve ser legível;
- não precisa ser digitada manualmente pelo usuário;
- o validador pode gerar `key` quando ela estiver ausente;
- deve ser única dentro do escopo de irmãos do mesmo tipo.

Escopos:

- curso;
- módulos do curso;
- lições do módulo;
- microssequências da lição;
- cards da microssequência.

### Geração inicial de `key`

Quando `key` estiver ausente, a validação inicial gera uma `key` a partir:

- do tipo estrutural;
- do título, objetivo ou intenção disponível;
- de um sufixo numérico quando necessário para evitar colisão.

Exemplo:

- `course-curso-de-exemplo`
- `module-fundamentos`
- `lesson-primeira-licao`
- `microsequence-apresentar-o-primeiro-conceito`
- `card-text`

## Intenções de card previstas

O contrato inicial reconhece as seguintes intenções:

- `text`
- `ask`
- `complete`
- `code`
- `table`
- `compare`
- `scene`
- `map`
- `flow`
- `simulate`
- `image`

Nesta fase, a validação confirma apenas se a intenção informada pertence a essa lista.

## Exemplo válido

Veja [docs/examples/aralearn-intent-v1.valid.json](/C:/Users/008031/Documents/AraLearn/docs/examples/aralearn-intent-v1.valid.json:1).

## Exemplo inválido

Veja [docs/examples/aralearn-intent-v1.invalid.json](/C:/Users/008031/Documents/AraLearn/docs/examples/aralearn-intent-v1.invalid.json:1).

O exemplo inválido falha porque tenta declarar `cards` diretamente na lição, sem microssequência.

## Validação inicial

O validador desta fase:

- verifica o valor do campo `contract`;
- exige a hierarquia completa;
- rejeita card fora de microssequência;
- exige campos textuais obrigatórios;
- valida unicidade de `key` por escopo;
- gera `key` quando necessário;
- rejeita intenção desconhecida;
- retorna erros claros com caminho estrutural.

## Pipeline mínima do motor

Na fase atual, o AraLearn já estabelece a pipeline mínima:

```text
carregar
validar
normalizar
compilar
```

Responsabilidades:

- `carregar`: receber string JSON ou objeto em memória;
- `validar`: confirmar contrato, hierarquia e regras estruturais;
- `normalizar`: devolver o documento autoral com `key` gerada quando necessário;
- `compilar`: produzir um modelo interno com ids internos determinísticos e índices auxiliares.

Nesta fase, a pipeline ainda não inclui renderização, interação ou persistência.

## Modelo compilado inicial

O modelo compilado:

- preserva a hierarquia estrutural do documento;
- cria ids internos derivados das `key` normalizadas;
- separa o documento autoral normalizado do modelo interno;
- expõe índices iniciais de microssequências e cards para uso futuro do motor.

O documento autoral normalizado continua sem ids internos.
