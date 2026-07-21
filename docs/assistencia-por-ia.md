# Assistência por IA

A assistência por IA faz parte do runtime completo do AraLearn. O app mantém as superfícies top-down e bottom-up para planejar estruturas e gerar ou corrigir cards com uma LLM configurada pelo usuário. A resposta do modelo não entra no curso sem composição, validação do contrato e persistência relacional granular.

Para detalhes dos harnesses de pesquisa, consulte [Fluxos, prompts e contratos de geração](fluxos-prompts-e-contratos.md). Para o formato público de intercâmbio, consulte [Contrato público](aralearn-contract.md).

## Onde a LLM entra na autoria

Os experimentos locais usam dois fluxos principais.

No **top-down**, a LLM recebe um escopo e propõe a estrutura do curso: módulos, lições e microssequências.

No **bottom-up**, a LLM trabalha sobre uma microssequência aberta. Ela pode gerar ou corrigir cards, propor apoio local ou continuar a próxima etapa planejada.

Essa divisão aproveita uma capacidade conhecida dos modelos de linguagem: realizar tarefas variadas a partir de instruções e exemplos, como discutem Brown et al. (2020). Ao mesmo tempo, evita pedir ao modelo uma tarefa grande demais de uma só vez.

## Serviços previstos

O repositório contém adaptadores para diferentes formas de geração:

- Gemini, com integração própria;
- serviços compatíveis com a API de chat da OpenAI;
- DeepSeek por endpoint compatível;
- ponte local para Codex CLI;
- serviço falso para testes automatizados.

As documentações oficiais de Google AI for Developers, OpenAI e DeepSeek tratam de respostas estruturadas ou JSON. Isso é relevante para os harnesses porque seus resultados precisam ser validados. Ainda assim, a validação do provedor não substitui os validadores do AraLearn.

## Seleção de contexto

O AraLearn não precisa enviar o projeto inteiro para cada chamada. O fluxo local monta um pacote com:

- caminho da etapa aberta;
- `guide` ativo;
- objetivo, papel, conteúdos cobertos e critérios da microssequência;
- dependências declaradas;
- referências escolhidas pelo usuário;
- próxima microssequência planejada, quando houver;
- cards existentes, quando a operação é de correção;
- fontes anexadas e resolvidas explicitamente.

Esse recorte melhora custo, privacidade e auditabilidade. Também ajuda a manter a intervenção dentro da etapa escolhida.

## Campos controlados

A LLM não recebe autorização para escrever livremente o estado persistido. O AraLearn informa recursos aceitos, modos de exercício, papéis didáticos e campos esperados. Em seguida, recompõe o resultado no contrato público em memória, valida-o e calcula somente as mutações relacionais necessárias. Se a base era um curso oficial compartilhado, a primeira gravação autoral prepara antes uma árvore pessoal independente.

JSON Schema (2026) é uma referência importante porque mostra como regras de estrutura podem ser descritas formalmente. O AraLearn usa a mesma lógica geral: transformar expectativas de formato em condições verificáveis.

## RAG externo e conteúdo de publicação

Lewis et al. (2020) definem RAG como geração apoiada por recuperação de informação. No AraLearn, a preparação de fixtures ou de conteúdo destinado à publicação oficial pode usar RAGs externos como prática de autoria e curadoria. Isso não deve ser apresentado como RAG interno plenamente implementado no app, a menos que o código passe a oferecer essa capacidade.

A distinção importa: a LLM configurada pelo usuário pode apoiar a autoria dentro do AraLearn; um eventual RAG externo continua pertencendo ao processo de pesquisa e preparação de material, salvo implementação explícita futura.

## Privacidade, custo e dependência

Quando o usuário aciona uma API externa, o contexto necessário à intervenção é enviado ao serviço configurado. Custo, retenção de dados, limites e disponibilidade dependem do fornecedor. Estudar conteúdo já baixado não exige uma chamada de LLM.

Essa distinção precisa ficar explícita: o estudo não depende de LLM para funcionar; autenticação, catálogo e sincronização dependem do Supabase. Depois da primeira sincronização, o material selecionado, o progresso, os comentários e a outbox continuam disponíveis localmente. Não existe catálogo operacional embarcado.

A futura autoria administrativa por GPT personalizado será projetada como sistema separado, com API estreita, validação e publicação atômica. Ela não substitui a superfície pessoal de edição do aplicativo.

## Governança da autoria futura

A autoria não será transferida à LLM. O modelo propõe; uma camada administrativa estrutura e verifica; o autor revisa. Esse arranjo reduz a chance de transformar conveniência técnica em autoridade pedagógica.

## Referências citadas

Brown, T. B., Mann, B., Ryder, N., Subbiah, M., Kaplan, J., Dhariwal, P., et al. (2020). Language models are few-shot learners. *Advances in Neural Information Processing Systems*, 33, 1877-1901. <https://arxiv.org/abs/2005.14165>

DeepSeek. (2026). *JSON Output*. DeepSeek API Docs. <https://api-docs.deepseek.com/guides/json_mode>

Google AI for Developers. (2026). *Structured outputs*. Gemini API Docs. <https://ai.google.dev/gemini-api/docs/structured-output>

JSON Schema. (2026). *What is JSON Schema?* <https://json-schema.org/overview/what-is-jsonschema>

Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., et al. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. *Advances in Neural Information Processing Systems*, 33, 9459-9474. <https://arxiv.org/abs/2005.11401>

OpenAI. (2026). *Structured model outputs*. OpenAI API Documentation. <https://platform.openai.com/docs/guides/structured-outputs>
