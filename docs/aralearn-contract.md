# Contrato JSON do AraLearn

## Envelope raiz

Todo documento público válido usa:

```json
{
  "contract": "aralearn.contract",
  "version": 1,
  "kind": "project",
  "courses": []
}
```

## Hierarquia

```text
project
  -> course
    -> module
      -> lesson
        -> microsequence
          -> card
```

## Lição

Campos principais de lição:

- `title`
- `description`
- `sourceGuideStructured`
- `sourceGuide`
- `presetId`
- `resourceTags`
- `contentTypeTags`
- `learningActionTags`
- `supportLevel`
- `microsequences`

`sourceGuideStructured` é a fonte de verdade. `sourceGuide` é texto derivado.

## Presets humanos

O contrato público da lição agora aceita `presetId` com ids simples:

- `guided`
- `practice`
- `visual`
- `code`
- `review`
- `source`

O preset não substitui os arrays explícitos. Ele registra o caminho humano simples usado na lição.

## Microssequência

Campos:

- `title`
- `key`
- `tags`
- `status`
- `included`
- `cards`

`status` aceita:

- `draft`
- `ready`

## Card

Campos comuns:

- `key`
- `title`
- `say`
- `after`
- `sourceRefs`

`sourceRefs` é opcional e registra grounding mínimo quando a geração usou fontes.

## Recursos públicos

O contrato público continua aceitando:

- `say`
- `ask`
- `code`
- `table`
- `tree`
- `flow`
- `plane`
- `matrix`

O contrato público continua legível. O pipeline interno pode usar aliases de geração, mas a persistência final respeita esse conjunto.

## Observações

- `description` não substitui `sourceGuideStructured`;
- `sourceRefs` não transformam o contrato em sistema de RAG avançado;
- estados de iteração local e histórico auxiliar continuam fora do contrato público;
- o contrato continua sendo o formato de importação e exportação estrutural.
