# Rascunhos e microssequências

## Regra atual

AraLearn separa duas coisas:

- criação de microssequências na lição;
- geração ou edição de cards dentro de uma microssequência.

## Rascunhos na lição

Quando a ação acontece no nível da lição, a IA cria microssequências `draft`.

Esses rascunhos:

- entram direto na árvore real da lição;
- nascem com `cards: []`;
- ficam fora do estudo;
- não abrem workbench automaticamente.

## Cards na microssequência

Quando a ação acontece no workbench da microssequência, o fluxo oficial é direto:

1. a IA gera ou edita cards;
2. o app valida;
3. o app aplica o resultado diretamente na microssequência-alvo;
4. a UI marca a iteração gerada como ativa;
5. o usuário pode aceitar ou excluir.

Não existe mais etapa de prévia privada.

## Reversão local

Excluir a iteração ativa restaura a versão anterior pelo histórico local.

Aceitar a iteração ativa remove o estado pendente e consolida essa versão como atual.

## Estudo

O modo de estudo ignora:

- `draft`;
- `included: false`.

Ou seja, existir na árvore não significa entrar automaticamente no percurso de estudo.

## Leitura correta do fluxo

Fluxo de lição:

```text
pedido
  -> microssequências draft
  -> revisão humana
  -> futura geração de cards
```

Fluxo de cards:

```text
pedido
  -> planejamento pequeno
  -> cardPlan determinístico
  -> geração/edição
  -> validação
  -> aplicação direta
  -> aceitar ou excluir
```
