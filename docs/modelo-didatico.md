# Modelo didático

## Unidade principal

A unidade didática central do AraLearn é a microssequência.

Ela precisa ser:

- pequena o bastante para retomada;
- clara o bastante para revisão;
- concreta o bastante para prática;
- curta o bastante para caber em modelo fraco sem perder governança.

## Sequência mínima

O desenho preferido continua sendo:

1. contexto mínimo;
2. microteoria;
3. exemplo ou leitura guiada;
4. prática autossuficiente;
5. consolidação.

Nem toda microssequência precisa ter cinco cards, mas a prática não deve aparecer antes da base necessária.

## Papel da LLM

A LLM não decide a didática do percurso.

Ela preenche cards planejados pelo app.

Isso vale especialmente para:

- tipo didático;
- tamanho;
- posição do card;
- recurso por posição;
- regras de validação.

## Recursos por prioridade

Prioridade operacional:

- `paragraph`
- `block_gap_fill`
- `multiple_choice`

Recursos como `table` e `code_editor` entram quando ajudam a reduzir salto cognitivo.

Recursos como `flowchart`, `tree`, `matrix` e `plane` não entram por enfeite. Eles exigem justificativa didática e liberação da lição.

## Regras didáticas mínimas

Um card bom no AraLearn:

- evita bastidor;
- não depende de “como vimos”;
- não depende de figura ou trecho acima;
- traz o contexto crítico no próprio card;
- não revela a resposta antes da prática;
- evita lacuna longa;
- mantém uma função principal clara.

## Fonte e grounding mínimo

Quando houver fonte externa na operação:

- a lição continua governada por `sourceGuideStructured`;
- `sourceRefs` ajudam a registrar vínculo mínimo entre card e fonte;
- ausência de fonte precisa ser explícita no contrato intermediário.

Isso não transforma o AraLearn em sistema de RAG avançado. É grounding mínimo e validável.

## Estados didáticos

Microssequências podem estar em:

- `draft`
- `ready`

Além disso, `included: false` mantém a microssequência fora do estudo mesmo que ela exista na árvore.

## Aplicação direta

No fluxo atual de cards:

- o resultado validado é aplicado diretamente;
- a iteração ativa fica visível;
- o usuário pode aceitar ou excluir;
- excluir restaura a versão anterior.

Não existe mais prévia privada entre geração e microssequência persistida.
