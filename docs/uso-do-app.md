# Guia de uso do app

## 1. Criar trilha

A tela inicial do fluxo estrutural agora é o builder de escopo.

Você preenche:

- título do curso
- objetivo opcional
- evidência principal
- módulos
- chips de `O que entra`
- chips de `O que não entra`
- observações
- estilo de cobrança

Você também pode importar um JSON `aralearn.scope.v1`.

## 2. Gerar trilha

Ao clicar em `Gerar trilha`, o app:

1. valida o contrato de escopo
2. chama o provider selecionado
3. valida a saída top-down
4. grava o projeto no contrato v1

Resultado:

- curso criado
- módulos e lições navegáveis
- microssequências planejadas
- nenhum card gerado ainda

## 3. Navegar pela árvore

Depois do top-down, a lateral mostra:

- curso
- módulos
- lições
- microssequências

Cada microssequência exibe status:

- `planned`
- `generated`
- `needs_review`
- `ready`

## 4. Estudar uma microssequência

Ao abrir uma microssequência, você pode:

- `Gerar cards`
- `Melhorar explicação`
- `Mais prática`
- `Criar complemento`
- `Gerar próxima`
- `Marcar pronta`

## 5. O que cada ação faz

### Gerar cards

Materializa a microssequência planejada.

### Melhorar explicação

Cria uma nova versão completa da microssequência atual.

### Mais prática

Mantém o mesmo tópico e amplia o treino.

### Criar complemento

Insere uma microssequência `support` logo depois da atual.

### Gerar próxima

Abre a próxima microssequência principal e tenta materializá-la sem exigir prompt livre.

## 6. Provider

Na lateral de provider, você escolhe:

- provider
- modelo
- densidade padrão
- API key ou token
- base URL
- endpoint local do Codex

Também é possível verificar a saúde do bridge local do Codex.
