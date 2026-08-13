# Biblioteca e packages do AraLearn

O documento canônico usa a raiz `aralearn.library.v1` e a hierarquia:

```text
library > course > module > lesson > microsequence > card
```

Um card é um envelope fechado:

```json
{
  "id": "card-protocolo",
  "position": 1,
  "title": "O que é um protocolo",
  "role": "theory",
  "content": [
    {
      "id": "explicacao",
      "package": "aralearn.resource.paragraph",
      "version": "1.0.0",
      "data": { "text": "Um protocolo define regras compartilhadas." }
    }
  ],
  "response": null,
  "feedback": [],
  "topics": [],
  "sources": []
}
```

`role` aceita `theory` ou `practice`. Teoria tem `response: null` e ao menos uma
instância em `content`; prática usa exatamente uma instância de package no slot
`response`. Uma prática exclusivamente discriminativa pode ter `content: []`:
a pergunta pertence somente a `aralearn.response.choice` e nunca deve ser
copiada para um `paragraph`. Quando há cenário, representação ou dados além da
pergunta, `content` os materializa sem repetir o enunciado. `feedback` pode
combinar packages compatíveis. Cada instância declara id, package, versão
semântica e `data` validado pelo contrato daquele package.

Não existe contrato monolítico de resources. Primeiro planeje a operação
cognitiva, consulte o catálogo compacto, escolha os packages e só então obtenha
o contrato da versão exata de cada escolha. Nunca invente campos ou coordenadas.

Antes de escolher um package especializado, leia `academic.admission`. Use-o
somente se `preservedStructure` for necessária à operação e `onlyWhen` for
verdadeira neste card. Se alguma condição de `useSimplerRepresentationWhen`
for satisfeita, prefira `paragraph`, `table`, uma resposta independente ou
outro package já instalado. Diversidade visual não é motivo de seleção.

Microssequências sem cards continuam no planejamento. Com cards, ficam
imediatamente renderizáveis e estudáveis. Não envie status de publicação,
conclusão ou prontidão.

IDs são estáveis; `position` ordena cards. Cópias e importações remapeiam IDs.
Campos desconhecidos são erro. O backend valida o envelope, cada package, as
referências estruturais, os guides, tópicos e fontes antes de persistir.

Na assistência local, alvos são `content:<id>`, `response:<id>` e
`feedback:<id>`. Reparos textuais preservam identidade, package, versão,
estrutura e respostas formais.
