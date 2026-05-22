# Arquitetura do AraLearn

Este documento descreve a arquitetura implementada no AraLearn: estrutura de dados, camadas de código, fluxo de geração, persistência, importação, exportação, validação e recursos de card.

A ideia geral é manter a lógica didática no app, e não no modelo de IA. O provider executa uma operação; o AraLearn valida, aplica, versiona e persiste.

## Visão geral

O projeto é organizado por uma árvore simples:

```text
project
└── course
    └── module
        └── lesson
            └── microsequence
                └── card
```

Essa árvore é usada para navegação, persistência, exportação, importação, geração por IA e estudo. Ela também conserva contexto: uma microssequência dentro de uma lição, módulo e curso já carrega informações que ajudam a orientar a geração.

## Contratos principais

### `aralearn.scope.v1`

Contrato de entrada para planejamento da trilha.

Ele contém:

- título do curso ou tema;
- objetivo opcional;
- prioridade de evidências;
- módulos;
- termos do que entra em cada módulo;
- termos do que fica fora;
- observações;
- estilo de avaliação ou uso.

Esse contrato reduz ambiguidade antes da chamada ao provider. Em vez de pedir que a IA descubra sozinha o domínio inteiro, o usuário declara o recorte.

### `aralearn.contract` v1

Contrato público persistido do projeto.

Ele contém:

- cursos com objetivo e prioridade de evidências;
- módulos com `include`, `exclude`, `notes` e `assessmentStyle`;
- lições com objetivo;
- microssequências com tipo, status, dependências, escopo, versões e versão ativa;
- cards com `resourceType`, `content` e orientação posterior opcional.

Esse contrato é o núcleo da portabilidade. O projeto não fica preso a uma conversa com IA nem a uma base de dados remota.

## Camadas de código

### `src/domain/`

Define entidades do domínio e regras de validação:

- contrato de projeto;
- contrato de escopo;
- termos de escopo;
- cards;
- microssequências;
- versões;
- recursos renderizáveis.

### `src/generation/topDown/`

Responsável pelo planejamento da trilha a partir do contrato de escopo.

A documentação técnica usa `top-down` para esse fluxo. Em linguagem comum, isso significa que o app começa pelo desenho geral do percurso: curso, módulos, lições e microssequências. Nessa fase, o app ainda não precisa gerar cards.

O resultado esperado é:

- estrutura coerente;
- progressão entre etapas;
- dependências explícitas quando necessárias;
- preservação do escopo informado;
- nenhuma materialização prematura de cards.

### `src/generation/bottomUp/`

Responsável pela materialização e revisão de uma microssequência específica.

A documentação técnica usa `bottom-up` para esse fluxo. Em linguagem comum, isso significa que o app parte da necessidade local do usuário: ele abriu uma microssequência e quer gerar, ampliar, corrigir ou continuar cards naquele ponto.

Operações previstas:

- gerar cards da microssequência planejada;
- melhorar ou corrigir cards existentes;
- acrescentar prática;
- criar microssequência de apoio;
- gerar a próxima microssequência planejada.

Cada operação trabalha com contexto local e produz nova versão.

### `src/generation/runtime/`

Integra geração e documento do projeto. Essa camada constrói o contexto enviado ao provider, recebe a resposta, valida o resultado e aplica alterações ao estado local.

### `src/generation/providers/`

Contém registry e adapters de provider:

- `fake`;
- `gemini`;
- `codex-cli`;
- `openai-compatible`;
- políticas específicas de DeepSeek.

A regra arquitetural é manter a didática fora do provider. O provider não decide o que é o AraLearn; ele apenas executa uma chamada estruturada.

### `src/ui/`

Contém a interface de autoria, navegação, estudo e configuração:

- `scopeBuilder/`: construção de escopo;
- `courseTree/`: navegação estrutural;
- `study/`: estudo da microssequência selecionada;
- `providers/`: configuração de provider;
- `lessonEditorApp.js`: composição principal da aplicação.

### `src/storage/`

Contém a persistência de projeto e progresso:

- serialização do projeto;
- leitura do projeto;
- normalização do progresso;
- exportação do backup completo;
- importação do backup completo.

## Fluxo de planejamento da trilha

```text
aralearn.scope.v1
  -> provider
  -> plano estrutural
  -> validação
  -> aralearn.contract v1
```

O planejamento cria ou atualiza a árvore até microssequências. Ele deve responder a perguntas como:

- que lições compõem este módulo;
- que microssequências tornam a lição estudável;
- que etapa depende de qual etapa anterior;
- que prática ou evidência é esperada;
- que assunto deve ficar fora do percurso.

O planejamento não deve gerar cards. Isso evita custo inicial alto e evita criar material antes de o usuário saber se a estrutura está adequada.

## Fluxo de materialização local

```text
microssequência selecionada
  -> contexto local
  -> draft didático intermediário
  -> card plan determinístico
  -> compilação do JSON final
  -> validação estrutural e didática
  -> nova versão
```

A materialização não precisa reenviar o projeto inteiro. O contexto vem da posição da microssequência na árvore, de seus objetivos, das dependências, da fonte-guia da lição, dos anexos aproveitáveis e do pedido do usuário.

Na prática, essa fase deve produzir:

- uma microssequência estudável;
- cards com função didática reconhecível;
- teoria e prática bem distribuídas;
- conteúdo suficiente para responder às práticas;
- continuidade da trilha sem deriva lateral.

## Quatro ações locais

O bottom-up preserva quatro ações importantes:

1. criar cards para a próxima microssequência planejada;
2. criar mais cards dentro da microssequência atual;
3. criar uma microssequência adicional de apoio;
4. corrigir os cards da microssequência atual.

Isso mantém o app semiaberto. O usuário pode seguir o plano ou intervir localmente quando o estudo mostra uma lacuna.

## Persistência

O AraLearn mantém dados no dispositivo. A persistência principal usa chaves locais:

```text
aralearn.project
aralearn.progress
aralearn.provider-settings.v2
```

O projeto é serializado como JSON validado. Antes de salvar, o app valida o documento. Antes de carregar, o app faz parse e valida novamente. Se o documento não respeita o contrato, a operação falha em vez de aplicar estado inválido.

O progresso é separado do conteúdo. Ele registra, por lição, cursor, cards concluídos e data de atualização. Isso permite distinguir:

- o material estudável;
- o estado de uso daquele material.

## Importação e exportação

O AraLearn reconhece dois formatos principais.

### Projeto público

Um projeto público usa:

```json
{
  "contract": "aralearn.contract",
  "version": 1,
  "kind": "project",
  "courses": []
}
```

Esse formato representa o conteúdo estruturado do projeto.

### Backup completo

Um backup completo usa:

```json
{
  "format": "aralearn.storage",
  "exportedAt": "2026-05-22T00:00:00.000Z",
  "project": {},
  "progress": {}
}
```

Esse formato inclui projeto e progresso. Ele é adequado para migração ou restauração do estado local.

Na importação, o app detecta se o JSON é projeto público ou backup completo. Conteúdo inválido é recusado.

## Recursos públicos de card

Recursos aceitos:

- `say`;
- `table`;
- `code`;
- `flow`;
- `tree`;
- `graph`;
- `block_gap_fill`.

A lista é definida no domínio e validada antes de o conteúdo entrar no projeto.

## Integridade

A regra arquitetural é simples:

```text
conteúdo gerado só entra no projeto depois de validado.
```

Isso vale para IA remota, Codex local, provider compatível com OpenAI e provider falso de testes. A validação local protege o projeto contra:

- JSON inválido;
- recurso desconhecido;
- ausência de campos obrigatórios;
- card sem conteúdo mínimo;
- resposta que desrespeita o schema esperado.

## Model-agnostic e content-agnostic

A arquitetura não depende de um conteúdo pré-embarcado nem de um modelo específico. Cursos embarcados podem existir como exemplo ou por uso real do autor, mas o app não é limitado a eles.

Da mesma forma, o app pode usar diferentes providers porque sua regra principal não está no provider. A regra principal está no contrato, no contexto enviado, na validação e na decisão do usuário.

## Justificativa técnica

A arquitetura separa planejamento e materialização para reduzir três riscos:

1. **custo e latência**: não gerar todos os cards antes do estudo;
2. **deriva de escopo**: não deixar a IA expandir o curso sem controle;
3. **fragilidade de revisão**: não aplicar resposta inválida ou irreversível.

A separação também favorece o estudante-trabalhador. O app pode carregar uma trilha, abrir uma etapa curta e permitir estudo com baixa fricção, inclusive offline depois que o material foi persistido.
