# Oficina de microssequências

Este documento descreve a oficina de microssequências como fluxo de criação, revisão e consolidação de material didático.

## Função da oficina

A oficina é um espaço local para rascunhos. Ela permite criar microssequências por pedido do usuário, revisar o resultado, iterar sobre o conteúdo e depois encaixar o material em um curso.

O objetivo é separar criação e consolidação:

- a criação pode ser exploratória;
- a revisão pode exigir várias versões;
- a consolidação deve acontecer apenas quando o material estiver pronto para entrar no percurso do curso.

## Navegação

Na tela inicial, a oficina aparece junto aos cursos.

Dentro da oficina, há duas ações principais:

- gerar novas microssequências;
- revisar a fila de rascunhos.

A tela `Gerar microssequência` é apenas um formulário de criação. Depois que a geração termina, o AraLearn cria uma microssequência real na fila e abre o painel de revisão.

## Fila de rascunhos

A fila de rascunhos lista microssequências que ainda não foram consolidadas em cursos.

Cada rascunho deve preservar:

- título;
- tags explícitas;
- cards;
- versões locais disponíveis;
- posição atual na oficina.

Rascunhos não devem alterar o progresso dos cursos definitivos antes do reposicionamento.

## Painel da microssequência

O painel é o centro de curadoria do rascunho.

Ele reúne:

- preview da versão ativa;
- navegação pelos cards;
- edição por pedido textual;
- tags explícitas;
- versões locais;
- ação de reposicionar em curso.

O painel também deve permitir que o usuário identifique rapidamente se a microssequência serve para estudar, precisa de revisão ou deve ser descartada.

## Edição e iteração

A edição assistida trabalha em nível de microssequência. O usuário pode pedir ajustes como:

- simplificar linguagem;
- separar ideias;
- trocar formato de card;
- melhorar exemplos;
- acrescentar prática;
- ajustar alternativas;
- reorganizar a sequência.

Cada iteração deve preservar uma versão local para comparação. A versão ativa é a que aparece no preview e a que será consolidada se o usuário reposicionar o rascunho.

## Tags explícitas

Tags explícitas servem a dois papéis:

- orientar o contexto da geração ou edição;
- ajudar a montar destinos possíveis para reposicionamento.

Na prática atual, o AraLearn usa as tags selecionadas para encontrar microssequências relacionadas em cursos definitivos e construir slots de destino.

## Reposicionamento

O reposicionamento atual move uma microssequência inteira.

Fluxo:

1. o usuário seleciona tags no painel;
2. a aplicação encontra destinos relacionados em cursos definitivos;
3. a aplicação monta slots fechados;
4. o serviço de IA generativa escolhe um slot entre os disponíveis;
5. o AraLearn valida o slot;
6. a microssequência é movida para o curso, módulo, lição e posição correspondentes.

O modelo não cria destinos livres. Ele escolhe entre opções fornecidas pela aplicação.

## Garantias de estado

A oficina deve garantir que:

- cards gerados apareçam em rascunhos revisáveis;
- o formulário de geração não retenha cards como se fosse microssequência de estudo;
- a tela inicial não conte material interno da oficina como progresso visível;
- dados locais criados pelo usuário sejam preservados quando possível;
- rascunhos permaneçam separados dos cursos até reposicionamento.

## Decisões futuras

A oficina concentra várias decisões importantes:

- se versões locais devem ser exportáveis;
- se o reposicionamento deve aceitar cards isolados;
- se o usuário deve confirmar o slot antes da aplicação;
- como mostrar rastreabilidade entre prompt, fonte e card;
- como avaliar qualidade antes de consolidar uma microssequência;
- como calibrar um curso existente a partir de dúvidas pontuais do estudante.
