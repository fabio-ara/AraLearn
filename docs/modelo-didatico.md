# Modelo didático

## Unidade principal

A unidade didática central do AraLearn é a microssequência.

Ela precisa ser:

- pequena o bastante para retomada;
- clara o bastante para revisão;
- concreta o bastante para prática;
- enxuta o bastante para caber em modelo fraco sem perder governança.

O AraLearn não é um app de resumo.

Ele não deve condensar um tópico em texto genérico. Ele deve decompor o conteúdo em passos estudáveis, cada um com função didática verificável.

## Meticulosidade

No AraLearn, meticulosidade não significa card longo.

Meticulosidade significa:

- decomposição didática;
- progressão pequena e verificável;
- cobertura funcional do domínio;
- prática suficiente com variação útil;
- diagnóstico de superficialidade;
- correção de lacunas sem inflar texto.

Cobertura não é repetição.

Cobertura pergunta quais capacidades precisam aparecer no percurso.

Consolidação pergunta quantas vezes e de quantas formas o aluno precisa praticar.

Repetição ruim é refazer a mesma operação sem novo contraste, nova representação, nova dificuldade, novo erro-alvo ou novo formato avaliativo.

## Sequência mínima

O desenho preferido continua sendo:

1. contexto mínimo;
2. microteoria;
3. exemplo ou leitura guiada;
4. prática autossuficiente;
5. consolidação.

Nem toda microssequência precisa ter cinco cards, mas a prática não deve aparecer antes da base necessária.

Quando fizer sentido, a microssequência também precisa:

- preparar notação;
- distinguir conceitos próximos;
- mostrar erro comum;
- conectar com formato esperado de exercício ou prova;
- deixar evidência de domínio.

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

## Mapa de domínio

Internamente, a lição pode carregar um `domainMap` com dois eixos:

- `domainItem`: capacidade real a cobrir;
- `practiceVariant`: variação de prática usada para consolidar sem redundância.

Exemplos de `domainItem`:

- distinguir `∧` de `∨` em frases parecidas;
- somar matrizes entrada por entrada;
- identificar erro de usar `git commit` antes de `git add`.

Exemplos de `practiceVariant`:

- fluência;
- contraste;
- erro comum;
- caso-limite;
- formato de prova;
- integração.

O usuário comum não precisa conhecer esse vocabulário. Ele existe para dar governança ao app, não para virar carga de interface.

## Regras didáticas mínimas

Um card bom no AraLearn:

- evita bastidor;
- não depende de “como vimos”;
- não depende de figura ou trecho acima;
- traz o contexto crítico no próprio card;
- não revela a resposta antes da prática;
- evita lacuna longa;
- mantém uma função principal clara;
- evita resumo genérico;
- não empilha muitos tópicos no mesmo card.

## Auditoria de superficialidade

O app agora trata superficialidade como defeito didático detectável.

Entre os sinais bloqueados ou marcados:

- definição sem exemplo mínimo;
- prática sem contexto local;
- notação sem preparação;
- prática sem feedback quando o formato exige correção explícita;
- salto de teoria para exercício sem mediação suficiente;
- ausência de contraste quando o ponto pede distinção;
- linguagem de bastidor;
- conteúdo genérico que serviria para qualquer disciplina;
- microssequência redundante sem função nova.

Quando a falha é acionável por regra local, o resultado da checagem não deve ficar passivo. O app pode:

- reescrever card específico;
- inserir exemplo mínimo;
- inserir preparação de notação;
- inserir prática pequena;
- segurar a entrega até uma nova iteração curta.

Se isso aumentar a quantidade final de cards, não é defeito por si só. O defeito é aumentar sem função didática nova.

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
