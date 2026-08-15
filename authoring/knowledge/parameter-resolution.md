# Resolução de parâmetros de desenho

## Guia de recuperação

- `INTENT`: recupere para `create`, `extend`, `revise`, `audit` e `repair` antes de consultar ou alterar parâmetros efetivos.
- Recupere as definições e contratos pertinentes por operação; não carregue o catálogo inteiro de parâmetros.
- Não exponha nomes técnicos, ids, schemas ou JSON à pessoa quando linguagem natural ou controle estruturado bastar.

## Ordem e autoridade

A cadeia de escopos é `workspace → course → module → lesson → microsequence`. Parte não é escopo de parâmetro. Resolva primeiro pela autoridade `research_lock > manual_override > auto > default`; somente dentro da mesma classe aplique `nearest_scope_replaces`, em que o assignment aplicável mais próximo substitui integralmente o valor da mesma classe. Não componha campos de valores vindos de ancestrais diferentes.

Um lock ancestral aplicável continua sendo barreira para alterações incompatíveis em escopos descendentes, ainda que exista assignment mais próximo de autoridade menor. Um override manual persiste até ser removido ou substituído por autoridade permitida. Auto é um modo explícito: o resolvedor calcula e persiste um valor efetivo e sua proveniência; Auto não significa ausência de valor nem licença para sobrescrever manual ou lock.

## Operação segura

1. Leia o slice persistido da microssequência e as definições pertinentes.
2. Preserve locks e overrides existentes; proponha Auto quando a informação disponível for suficiente.
3. Se Auto precisar referenciar um ResourceSet inexistente, componha primeiro a disponibilidade por facetas, congele versões exatas e persista o conjunto. Esse bootstrap ainda não autoriza seleção.
4. Traduza pedido em linguagem natural para o mesmo assignment estruturado usado pela interface, usando a referência do conjunto já persistido quando aplicável.
5. Use revisão esperada e identificador idempotente na escrita.
6. Resolva todos os valores efetivos e grave um snapshot imutável antes de selecionar resources ou criar o blueprint.
7. Em conflito, releia o estado e reaplique somente a intenção ainda válida.

Remover um override restaura Auto ou herança conforme o contrato e somente quando não houver lock que proíba a mudança. Nunca peça à pessoa que edite JSON ou forneça ids técnicos.

Microssequências do mesmo curso podem resolver valores automáticos diferentes quando suas unidades, relações, evidências, fidelidade ou condições diferirem. Registre a justificativa local e não promova essa diferença a estilo global. Quando a pessoa pedir em linguagem natural uma exposição mais espaçada ou outra mudança equivalente, preserve o modo manual e materialize segundo o valor efetivo. Quando houver `research_lock`, reconheça sua autoridade e não tente adaptá-lo.

## Pesquisa

Fator, condição, locks e invariantes reutilizam os mesmos parâmetros da autoria comum. O assistente não escolhe randomização, não altera locks e não muda condição experimental. Variantes precisam referenciar snapshots e conjuntos versionados para que o desenho possa ser reproduzido e comparado.
