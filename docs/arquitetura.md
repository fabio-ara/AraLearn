# Arquitetura

A arquitetura do AraLearn foi desenhada para que uma resposta de LLM por API não altere diretamente o projeto do usuário. Entre a resposta do serviço e o material salvo há um fluxo de composição, validação, persistência e renderização. O projeto local em JSON é o registro de referência.

Para o fluxo de geração, consulte [Fluxos, prompts e contratos de geração](fluxos-prompts-e-contratos.md). Para o formato persistido, consulte [Contrato público](aralearn-contract.md).

## Visão geral

O documento raiz do projeto tem este formato:

```json
{
  "contract": "aralearn.contract",
  "version": 3,
  "kind": "project",
  "courses": []
}
```

JSON é um formato textual para representar dados estruturados; a documentação da MDN Web Docs (2026) o apresenta como forma legível de organizar objetos, listas e valores. JSON Schema, por sua vez, define regras para esses dados, como campos obrigatórios e valores aceitos (JSON Schema, 2026).

No AraLearn, essa estrutura organiza a árvore didática:

```text
project
└── course
    └── module
        └── lesson
            └── microsequence
                └── card
```

A mesma árvore serve para três fins: organizar o estudo, salvar o projeto e selecionar contexto para a geração por LLM.

## Responsabilidades

O usuário define escopo, escolhe a etapa, revisa o conteúdo e decide o que fica no projeto.

A LLM por API propõe estrutura, texto, exemplos, exercícios e correções dentro do contexto enviado.

O AraLearn mantém o projeto local, monta contratos transitórios, escolhe o contexto, compõe a saída, valida campos, persiste os cards da microssequência e os apresenta.

Essa divisão evita tratar a resposta da LLM como documento final.

## Camadas de código

A organização do código separa responsabilidades:

| Camada | Função |
|---|---|
| `src/domain/` | Entidades e validações do domínio. |
| `src/contract/` | Contrato público e validação estrutural. |
| `src/model/` | Conversões internas para execução e apresentação. |
| `src/generation/topDown/` | Planejamento de curso, módulos, lições e microssequências. |
| `src/generation/bottomUp/` | Geração e correção de cards dentro de uma microssequência. |
| `src/generation/contracts/` | Contratos transitórios enviados às LLMs. |
| `src/generation/validation/` | Validação estrutural e didática das saídas. |
| `src/generation/repair/` | Reparos mecânicos permitidos. |
| `src/generation/runtime/` | Execução, histórico e aplicação do resultado. |
| `src/render/` | Apresentação dos cards na interface. |
| `src/ui/` | Navegação, autoria e estudo. |

## Top-down

O fluxo top-down começa com escopo. O usuário informa tema, objetivo, inclusões, exclusões e orientações. A LLM propõe curso, módulos, lições e microssequências. O app valida dependências, fronteiras e coerência estrutural antes de aplicar a proposta.

Esse fluxo não precisa gerar cards. Sua função é transformar intenção ampla em trilha revisável.

## Bottom-up

O fluxo bottom-up começa em uma microssequência aberta. O app monta um contexto local e pede à LLM uma intervenção: gerar cards, corrigir cards, criar apoio ou continuar a próxima etapa.

O resultado passa por composição e validação. Um card de escolha precisa de alternativas e resposta válida. Uma matriz precisa de valores. Um grafo precisa de vértices e arestas coerentes. Um exercício de lacuna precisa ter opções. Se o resultado falha, o app pode pedir correção localizada ou rejeitar a saída.

## Saída estruturada e validação própria

APIs modernas oferecem recursos para respostas estruturadas. A OpenAI (2026) documenta *Structured Outputs*; a Gemini API documenta geração aderente a schema (Google AI for Developers, 2026); e a DeepSeek documenta *JSON Output* (DeepSeek, 2026). O AraLearn se beneficia desse tipo de recurso quando disponível, mas não depende apenas dele.

Mesmo que o serviço devolva JSON válido, o app ainda verifica se aquele JSON faz sentido dentro do contrato do AraLearn e da microssequência ativa.

## Renderização

Renderizar, aqui, significa transformar dados em card visível. O app não precisa receber uma imagem de matriz, grafo ou fluxograma. Ele recebe dados: células, vértices, arestas, nós, pontos, linhas ou blocos. Depois monta a representação na tela.

Essa decisão tem duas vantagens. Primeiro, o conteúdo continua editável e exportável. Segundo, o app consegue validar a estrutura antes de mostrá-la ao estudante.

## Persistência local

Na web e no app Android, o AraLearn abre o IndexedDB na inicialização e o usa para persistir cursos do usuário, progresso e comentários. Os cursos distribuídos com o app são lidos do catálogo embarcado definido pelo manifesto.

Os cards ficam diretamente em `microsequence.cards`. Uma geração ou correção validada atualiza atomicamente esse conjunto no projeto atual.

## Falhas

O projeto anterior deve permanecer intacto quando uma intervenção falha. Uma resposta truncada, um JSON inválido, um campo fora do contrato ou um exercício malformado não deve substituir material já salvo. A falha precisa ser visível e recuperável.

## Referências citadas

DeepSeek. (2026). *JSON Output*. DeepSeek API Docs. <https://api-docs.deepseek.com/guides/json_mode>

Google AI for Developers. (2026). *Structured outputs*. Gemini API Docs. <https://ai.google.dev/gemini-api/docs/structured-output>

JSON Schema. (2026). *What is JSON Schema?* <https://json-schema.org/overview/what-is-jsonschema>

MDN Web Docs. (2026). *Working with JSON*. <https://developer.mozilla.org/en-US/docs/Learn_web_development/Core/Scripting/JSON>

OpenAI. (2026). *Structured model outputs*. OpenAI API Documentation. <https://platform.openai.com/docs/guides/structured-outputs>
