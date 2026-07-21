# Registro de termos

O registro de termos impede que uma parte exija vocabulário ainda não ensinado. Ele acompanha o curso inteiro e é atualizado após cada parte aprovada.

Cada termo informa:

- `termId`: identidade estável;
- `form`: expressão mostrada ao estudante;
- `language`: idioma da expressão;
- `explanation`: explicação compatível com o público;
- `gloss`: tradução ou glosa, quando necessária;
- `firstTeachingCardId`: primeiro card que ensina o termo;
- `requiredByCardIds`: cards que dependem dele;
- `sourceIds`: fontes que sustentam a definição.

## Regras

1. O primeiro uso exigido não pode anteceder `firstTeachingCardId`.
2. Mencionar uma palavra não equivale a ensiná-la.
3. Uma explicação deve permitir o uso esperado na prática seguinte.
4. Termos quase equivalentes precisam de distinção quando a diferença interfere na resposta.
5. Uma sigla aparece depois do nome por extenso, salvo se o público e o plano autorizarem outra forma.
6. A nova parte não redefine silenciosamente um termo aprovado.

O auditor compara `introducedTermIds` e `requiredTermIds` de cada card com o registro acumulado. Uma violação localizada pode gerar reparo. Se o fragmento contrariar a ordem correta já prevista, ele deve ser reconstruído sob a mesma especificação. Se a inversão estiver no próprio plano, a execução deve ser bloqueada até que uma decisão externa autorize a correção.
