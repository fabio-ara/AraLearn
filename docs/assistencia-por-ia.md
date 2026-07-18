# Assistência por IA

A assistência por IA é parte central do AraLearn atual. O app usa LLMs por API para planejar trilhas e gerar ou corrigir cards, mas a resposta do modelo não entra no projeto sem passar por contrato, composição e validação.

Para detalhes operacionais, consulte [Fluxos, prompts e contratos de geração](fluxos-prompts-e-contratos.md). Para o formato salvo, consulte [Contrato público](aralearn-contract.md).

## Onde a LLM entra

Há dois fluxos principais.

No **top-down**, a LLM recebe um escopo e propõe a estrutura da trilha: curso, módulos, lições e microssequências.

No **bottom-up**, a LLM trabalha sobre uma microssequência aberta. Ela pode gerar ou corrigir cards, propor apoio local ou continuar a próxima etapa planejada.

Essa divisão aproveita uma capacidade conhecida dos modelos de linguagem: realizar tarefas variadas a partir de instruções e exemplos, como discutem Brown et al. (2020). Ao mesmo tempo, evita pedir ao modelo uma tarefa grande demais de uma só vez.

## Serviços previstos

O repositório prevê diferentes formas de geração:

- Gemini, com integração própria;
- serviços compatíveis com a API de chat da OpenAI;
- DeepSeek por endpoint compatível;
- ponte local para Codex CLI;
- serviço falso para testes automatizados.

As documentações oficiais de Google AI for Developers, OpenAI e DeepSeek tratam de respostas estruturadas ou JSON. Isso é relevante para o AraLearn porque o app espera dados que possam ser validados. Ainda assim, a validação do provedor não substitui a validação do próprio app.

## Seleção de contexto

O AraLearn não precisa enviar o projeto inteiro para cada chamada. No fluxo local, o app monta um pacote com:

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

A LLM não recebe autorização para escrever livremente o projeto final. O AraLearn informa recursos aceitos, modos de exercício, papéis didáticos e campos esperados. Em seguida, recompõe o resultado no contrato público.

JSON Schema (2026) é uma referência importante porque mostra como regras de estrutura podem ser descritas formalmente. O AraLearn usa a mesma lógica geral: transformar expectativas de formato em condições verificáveis.

## RAG externo e conteúdo seed

Lewis et al. (2020) definem RAG como geração apoiada por recuperação de informação. No AraLearn, a preparação de conteúdo `seed` pode usar RAGs externos como prática de autoria e curadoria. Isso não deve ser apresentado como RAG interno plenamente implementado no app, a menos que o código passe a oferecer essa capacidade.

A distinção importa: hoje, a LLM por API é uma funcionalidade do AraLearn; o RAG externo é parte do processo de produção de material.

## Privacidade, custo e dependência

Quando o usuário usa uma API externa, o contexto necessário à intervenção é enviado ao serviço configurado. Custo, retenção de dados, limites e disponibilidade dependem do fornecedor. Por isso, o projeto mantém persistência local em IndexedDB e busca reduzir o contexto enviado.

Essa distinção precisa ficar explícita: a dependência externa recai sobre a assistência de autoria. O projeto salvo, os cursos embarcados e o material já aceito continuam disponíveis localmente para estudo, revisão e edição sem nova chamada à API.

A ambição de diminuir dependência de LLMs externas é coerente com o público do AraLearn: estudantes com poucos recursos, conexão instável e necessidade de continuidade. No estado atual, porém, a geração por API continua sendo a capacidade operacional principal.

## Governança da autoria

A autoria no AraLearn não é transferida à LLM. O modelo propõe; o app estrutura e verifica; o usuário revisa. Esse arranjo reduz a chance de transformar conveniência técnica em autoridade pedagógica.

## Referências citadas

Brown, T. B., Mann, B., Ryder, N., Subbiah, M., Kaplan, J., Dhariwal, P., et al. (2020). Language models are few-shot learners. *Advances in Neural Information Processing Systems*, 33, 1877-1901. <https://arxiv.org/abs/2005.14165>

DeepSeek. (2026). *JSON Output*. DeepSeek API Docs. <https://api-docs.deepseek.com/guides/json_mode>

Google AI for Developers. (2026). *Structured outputs*. Gemini API Docs. <https://ai.google.dev/gemini-api/docs/structured-output>

JSON Schema. (2026). *What is JSON Schema?* <https://json-schema.org/overview/what-is-jsonschema>

Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., et al. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. *Advances in Neural Information Processing Systems*, 33, 9459-9474. <https://arxiv.org/abs/2005.11401>

OpenAI. (2026). *Structured model outputs*. OpenAI API Documentation. <https://platform.openai.com/docs/guides/structured-outputs>
