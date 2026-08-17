# Biblioteca e packages do AraLearn

O envelope operacional usa o identificador `aralearn.library.v1` e a
hierarquia:

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

Não existe contrato monolítico de resources. Primeiro planeje a operação-alvo
da tarefa e a estrutura que precisa permanecer visível. Em
`consultarBibliotecaDeResources`, use `explore` para conhecer famílias e
facetas, `search` para receber candidatos classificados, `inspect` para
conferir os perfis e `contracts` para carregar exatamente uma versão escolhida
por chamada. Antes de persistir, use `validate_card` e
`audit_representation`. `preview_card` apenas descreve a composição: a prévia
visual fiel pertence ao renderer do aplicativo. Nunca invente campos ou
coordenadas. Toda resposta dessa ferramenta segue
`aralearn.resource-library.v1`.

Os valores a seguir são tokens do protocolo, não certificações acadêmicas.
`canonical` indica ajuste específico; `versatile`, uma representação
transversal que preserva a estrutura; `substitute`, uma aproximação instalada.
A policy e o ResourceSet determinam quais ajustes são admitidos. Toda admissão
não canônica conserva sua limitação e o `chatDisclosure`; bloqueio interrompe a
seleção, sem autorizar package externo ou equivalência artificial.

`validate_card` confere o envelope, schemas, referências e compatibilidades.
`audit_representation` acrescenta a análise de `semantic_fit` para conteúdo,
`response_affordance` para resposta e `feedback_legibility` para feedback.
`preview_card` sempre devolve `rendered: false`: é um descritor estrutural, não
screenshot nem substituto para a prévia no renderer do aplicativo.

Antes de escolher um package especializado, aplique uma vez a policy devolvida
por `explore`. Depois leia, no perfil do candidato, `conventions`, `useWhen` e
`avoidWhen`. A forma só é admitida quando preserva estrutura necessária à
operação, torna a relação mais previsível e não acrescenta gramática visual a
ser decifrada. Diversidade visual não é motivo de seleção. Na teoria, avance
sem condensar assuntos; na prática, mantenha no card o caso completo e somente
a complexidade necessária à operação-alvo da tarefa.

Microssequências sem cards continuam no planejamento. Com cards, ficam
imediatamente renderizáveis e estudáveis. Não envie status de publicação,
conclusão ou prontidão.

IDs são estáveis; `position` ordena cards. Cópias e importações remapeiam IDs.
Campos desconhecidos são erro. O backend valida o envelope, cada package, as
referências estruturais, os guides, tópicos e fontes antes de persistir.

Na assistência local, alvos são `content:<id>`, `response:<id>` e
`feedback:<id>`. Selecionar alvos preserva identidade, package, versão,
estrutura e respostas formais e autoriza somente a edição de seus textos
visíveis. Selecionar o card inteiro também pode recompor a representação e a
prática, mantendo apenas `card.id` e `position`. A conversa recebe o resultado
corrente e pode iterar ou restaurar uma versão anterior sem pedir ao modelo que
recrie o texto perdido.
