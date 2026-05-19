# Arquitetura do AraLearn

Este documento descreve a arquitetura implementada no AraLearn: estrutura de dados, camadas de código, fluxo de geração, persistência e recursos de card.

## Estrutura pública

O projeto é organizado por uma árvore simples:

```text
project
└── course
    └── module
        └── lesson
            └── microsequence
                └── card
```

Essa árvore é usada para persistência, navegação, exportação, importação e estudo. Ela também conserva contexto: uma microssequência dentro de uma lição, de um módulo e de um curso já traz informações de escopo que ajudam a orientar a geração por IA.

## Contratos principais

### `aralearn.scope.v1`

Contrato de entrada para planejamento estrutural.

Ele contém:

- dados do curso;
- objetivo opcional;
- prioridade de evidências;
- módulos;
- termos de escopo que entram no módulo;
- termos de escopo que ficam fora;
- observações;
- estilo de avaliação ou uso.

Esse contrato reduz ambiguidade antes da chamada ao provider.

### `aralearn.contract` v1

Contrato persistido do projeto.

Ele contém:

- cursos com `evidencePriority`;
- módulos com `include`, `exclude`, `notes` e `assessmentStyle`;
- lições com `goal`;
- microssequências com `type`, `status`, `dependsOn`, `scopeRefs`, versões e versão ativa;
- cards com `resourceType`, `content` e feedback posterior opcional.

A validação local fica em `src/domain/aralearnProject.js`.

## Camadas de código

### `src/domain/`

Define e valida entidades do domínio:

- contrato de projeto;
- contrato de escopo;
- termos de escopo;
- cards;
- microssequências;
- versões;
- recursos renderizáveis.

### `src/generation/topDown/`

Responsável pelo planejamento estrutural a partir do contrato de escopo.

O resultado esperado é uma trilha com cursos, módulos, lições e microssequências planejadas. Nessa fase, a geração não precisa produzir cards.

### `src/generation/bottomUp/`

Responsável pela materialização e revisão de uma microssequência específica.

Operações previstas:

- gerar cards;
- melhorar uma explicação;
- acrescentar prática;
- criar complemento;
- gerar a próxima microssequência planejada.

Cada operação trabalha com contexto local e produz nova versão.

### `src/generation/runtime/`

Integra geração e documento do projeto. Essa camada aplica alterações validadas ao estado local.

### `src/generation/providers/`

Contém o registry e os adapters de provider:

- `fake`;
- `gemini`;
- `codex-cli`;
- `openai-compatible`.

A intenção é manter a lógica didática fora do provider. O provider executa uma operação; o contrato e a validação pertencem ao app.

### `src/ui/`

Contém a interface de autoria, navegação, estudo e configuração:

- `scopeBuilder/`: formulário de escopo por curso e módulos;
- `courseTree/`: navegação estrutural;
- `study/`: estudo da microssequência selecionada;
- `providers/`: configuração de provider;
- `lessonEditorApp.js`: composição principal da aplicação.

## Fluxo operacional

### Planejamento estrutural

```text
aralearn.scope.v1 -> provider -> plano estrutural -> validação -> aralearn.contract v1
```

O plano estrutural cria ou atualiza a árvore até microssequências.

### Materialização local

```text
microssequência selecionada -> contexto local -> provider -> cards -> validação -> nova versão
```

A materialização não precisa reenviar o projeto inteiro. O contexto vem da posição da microssequência na árvore, de seus objetivos, de suas dependências e do pedido do usuário.

## Persistência

O AraLearn mantém o projeto no dispositivo.

Chaves principais:

- `aralearn.project`;
- `aralearn.progress`;
- `aralearn.provider-settings.v2`.

Essa abordagem favorece uso local, inspeção, exportação e continuidade sem depender de servidor próprio.

## Recursos públicos de card

Recursos aceitos:

- `say`;
- `table`;
- `code`;
- `flow`;
- `tree`;
- `graph`;
- `block_gap_fill`.

A lista é definida em `src/domain/resources.js` e validada antes de o conteúdo entrar no projeto.

## Integridade

O app deve preservar o projeto anterior quando uma resposta de IA não passa pela validação. A regra arquitetural é simples: conteúdo gerado só entra no projeto depois de validado.
