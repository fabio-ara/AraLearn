# Fontes e evidências

Cada afirmação verificável deve ter origem identificável. O registro de fontes liga o que será ensinado ao material que sustenta essa escolha.

## Registro de fontes

No contexto de autoria, identifique para cada fonte:

- identificador estável;
- título e autoria, quando disponíveis;
- tipo de material;
- URL ou nome do anexo;
- data de publicação ou versão, quando relevante;
- data de acesso para fonte externa;
- recorte utilizado;
- condições de uso;
- indicação de estabilidade ou volatilidade.

Esses dados pertencem ao catálogo de fontes ou ao contexto fornecido à autoria,
não ao objeto do card. No documento v4, `card.sources` contém somente uma lista
de identificadores textuais já autorizados. Não copie URL, título, data, trecho
ou metadados bibliográficos para propriedades inventadas do card.

No `brief` do workspace, declare cada identificador aprovado com a forma
`[source:id]` e escreva depois dela a identificação e o recorte necessários.
Exemplo: `[source:fgv-prova-2024] Prova fornecida pelo usuário, questões 50 e
52–57.` O servidor aceita em `card.sources` uma referência nova somente quando
o mesmo identificador está declarado no `brief` ou já pertence ao conteúdo
herdado pelo workspace.

Para uma fonte volátil, conserve no registro externo a data de consulta e a
versão pertinente. O card que depende de um dado mutável repete a data, a versão
ou a condição decisiva em conteúdo visível antes da resposta, como enunciado,
texto, código, tabela, rótulo ou alternativa. O identificador em `sources` não
substitui esse contexto.

## Verificação de afirmações

Ao revisar cada afirmação verificável, confira:

- o texto preciso que precisa de apoio;
- quais identificadores de fonte o sustentam;
- o trecho ou a localização que sustenta a afirmação;
- o nível de confiança;
- os cards em que a afirmação aparece.

Essa relação pode permanecer como nota de trabalho ou evidência da revisão,
mas não deve ser serializada em campos fora do contrato AraLearn.

## Pesquisa externa

Use pesquisa apenas quando as fontes entregues não bastarem ou quando o assunto
mudar com o tempo. Dê preferência a fontes primárias. Uma fonte pesquisada só
pode entrar em `card.sources` depois de receber identificador autorizado no
contexto de autoria e passar pela mesma verificação das demais.

Não use uma fonte para afirmar algo que ela apenas sugere. Não invente página, citação, URL, data ou versão. Quando houver divergência relevante entre fontes, registre a divergência e bloqueie a decisão que dependa dela.

## Direitos e privacidade

Não copie material protegido em extensão incompatível com a finalidade
didática. Prefira síntese própria e referência. Dados pessoais, sigilosos ou
desnecessários não entram no curso nem no contexto enviado à API.
