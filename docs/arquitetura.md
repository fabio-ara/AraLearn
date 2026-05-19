# Arquitetura do AraLearn

## Estrutura pública

```text
project
└── course
    └── module
        └── lesson
            └── microsequence
                └── card
```

Essa árvore é o centro do storage e da navegação.

## Contratos

O app trabalha com dois contratos principais:

### `aralearn.scope.v1`

Entrada pequena para o top-down:

- curso
- objetivo opcional
- evidência prioritária
- módulos
- include/exclude por módulo
- observações
- estilo de cobrança

### `aralearn.contract` v1

Projeto persistido:

- cursos com `evidencePriority`
- módulos com `include` e `exclude` normalizados
- lições com `goal`
- microssequências com `type`, `status`, `dependsOn`, `scopeRefs`
- versões explícitas por microssequência
- cards com `resourceType`

## Camadas de código

### `src/domain/`

Responsável por:

- validação do contrato de escopo
- validação do contrato público v1
- normalização de termos
- cards
- microssequência
- versão

### `src/generation/topDown/`

Pipeline permitido:

1. validar escopo
2. montar prompt curto
3. chamar provider estruturado
4. validar saída planejada
5. converter em patch simples de curso
6. aplicar ao projeto

### `src/generation/bottomUp/`

Responsável por:

- montar `ContextPacket`
- gerar cards da microssequência
- melhorar a versão atual
- acrescentar prática
- criar complemento `support`
- gerar próxima microssequência principal

### `src/generation/providers/`

Registry simples com providers:

- `fake`
- `gemini`
- `codex-cli`
- `openai-compatible`

### `src/ui/`

- `scopeBuilder/`: builder da trilha
- `courseTree/`: navegação estrutural
- `study/`: estudo e ações locais
- `providers/`: configuração de provider
- `lessonEditorApp.js`: shell principal restaurada que orquestra árvore, edição e geração

## Fluxo operacional

### Top-down

```text
scope contract -> planned course -> project patch -> project v1
```

### Bottom-up

```text
selection -> context packet -> cards/version -> project update
```

## Persistência

O projeto continua local-first.

Persistido:

- `aralearn.project`
- `aralearn.progress`
- `aralearn.provider-settings.v2`

Observação:

- o fluxo de produto não usa mais o motor multifase `CourseForge`, mas alguns wrappers internos ainda preservam o prefixo `CourseForge` em nomes de módulo por continuidade de código

## Recursos públicos de card

Recursos mínimos aceitos:

- `say`
- `table`
- `code`
- `flow`
- `tree`
- `graph`
- `block_gap_fill`

O renderer público existente foi preservado e o contrato novo adapta cards para esse runtime.
