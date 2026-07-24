# Fontes e evidências

Cada afirmação verificável deve ter origem identificável. O registro de fontes liga o que será ensinado ao material que sustenta essa escolha.

## Registro de fontes

Para cada fonte, guarde:

- identificador estável;
- título e autoria, quando disponíveis;
- tipo de material;
- URL ou nome do anexo;
- data de publicação ou versão, quando relevante;
- data de acesso para fonte externa;
- recorte utilizado;
- condições de uso;
- indicação de estabilidade ou volatilidade.

No registro JSON, use `publishedOn` para a data de publicação, `publishedVersion`
para a edição ou versão, `accessedOn` para a data de consulta e `usageTerms` para
as condições de uso. As datas seguem `YYYY-MM-DD`. Esses campos são opcionais,
mas não devem ser omitidos quando a informação estiver disponível e for relevante
para verificar a fonte.

Uma fonte marcada como `volatile` exige `accessedOn`. O card que depende de um dado mutável repete a data, a versão ou a condição decisiva entre seus `contextAnchors`; o registro da fonte não substitui o contexto visível da prática.

## Registro de afirmações

Cada afirmação informa:

- o texto preciso que precisa de apoio;
- os identificadores das fontes;
- o trecho ou a localização que sustenta a afirmação;
- o nível de confiança;
- a parte e os cards em que pode aparecer.

## Pesquisa externa

Use pesquisa apenas quando as fontes entregues não bastarem ou quando o assunto mudar com o tempo. Dê preferência a fontes primárias. O resultado da pesquisa entra no registro e passa pela mesma auditoria das demais fontes.

Não use uma fonte para afirmar algo que ela apenas sugere. Não invente página, citação, URL, data ou versão. Quando houver divergência relevante entre fontes, registre a divergência e bloqueie a decisão que dependa dela.

## Direitos e privacidade

Não copie material protegido em extensão incompatível com a finalidade didática. Prefira síntese própria e referência. Dados pessoais, sigilosos ou desnecessários não entram no curso, nos relatórios nem nos registros enviados à API.
