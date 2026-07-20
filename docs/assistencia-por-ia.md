# Assistência por IA

O repositório conserva motores e harnesses de pesquisa para planejar estruturas e gerar ou corrigir cards com LLMs. Eles não fazem parte do runtime atual do estudante, não são expostos pela aplicação web ou pelo APK e não gravam diretamente no Supabase operacional.

Para detalhes dos harnesses de pesquisa, consulte [Fluxos, prompts e contratos de geração](fluxos-prompts-e-contratos.md). Para o formato público de intercâmbio, consulte [Contrato público](aralearn-contract.md).

## Onde a LLM pode entrar na autoria

Os experimentos locais usam dois fluxos principais.

No **top-down**, a LLM recebe um escopo e propõe a estrutura do curso: módulos, lições e microssequências.

No **bottom-up**, a LLM trabalha sobre uma microssequência aberta. Ela pode gerar ou corrigir cards, propor apoio local ou continuar a próxima etapa planejada.

Essa divisão aproveita uma capacidade conhecida dos modelos de linguagem: realizar tarefas variadas a partir de instruções e exemplos, como discutem Brown et al. (2020). Ao mesmo tempo, evita pedir ao modelo uma tarefa grande demais de uma só vez.

## Serviços de pesquisa existentes

O repositório contém adaptadores técnicos para diferentes formas de geração:

- Gemini, com integração própria;
- serviços compatíveis com a API de chat da OpenAI;
- DeepSeek por endpoint compatível;
- ponte local para Codex CLI;
- serviço falso para testes automatizados.

As documentações oficiais de Google AI for Developers, OpenAI e DeepSeek tratam de respostas estruturadas ou JSON. Isso é relevante para os harnesses porque seus resultados precisam ser validados. Ainda assim, a validação do provedor não substitui os validadores do AraLearn.

## Seleção de contexto nos harnesses

Os harnesses não precisam enviar o projeto inteiro para cada chamada. O fluxo local monta um pacote com:

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

A LLM não recebe autorização para escrever livremente o estado persistido. O harness informa recursos aceitos, modos de exercício, papéis didáticos e campos esperados. Em seguida, recompõe o resultado no contrato público em memória e o valida. A persistência administrativa futura terá uma fronteira própria e não reutilizará credenciais do estudante.

JSON Schema (2026) é uma referência importante porque mostra como regras de estrutura podem ser descritas formalmente. O AraLearn usa a mesma lógica geral: transformar expectativas de formato em condições verificáveis.

## RAG externo e conteúdo de publicação

Lewis et al. (2020) definem RAG como geração apoiada por recuperação de informação. No AraLearn, a preparação de fixtures ou de conteúdo destinado à publicação oficial pode usar RAGs externos como prática de autoria e curadoria. Isso não deve ser apresentado como RAG interno plenamente implementado no app, a menos que o código passe a oferecer essa capacidade.

A distinção importa: hoje, tanto as chamadas de LLM quanto um eventual RAG externo pertencem ao processo de pesquisa e produção de material, não ao aplicativo operacional do estudante.

## Privacidade, custo e dependência

Quando um pesquisador executa um harness com API externa, o contexto necessário à intervenção é enviado ao serviço configurado. Custo, retenção de dados, limites e disponibilidade dependem do fornecedor. Essa execução é separada do uso estudantil normal.

Essa distinção precisa ficar explícita: o app do estudante não depende de LLM para funcionar; autenticação, catálogo e sincronização dependem do Supabase. Depois da primeira sincronização, o material selecionado, o progresso, os comentários e a outbox continuam disponíveis localmente. Não existe catálogo operacional embarcado.

A futura autoria administrativa por GPT personalizado será projetada como sistema separado, com API estreita, validação e publicação atômica. Ela não deve reintroduzir chamadas pagas de LLM nem autoria provisória dentro do runtime estudantil.

## Governança da autoria futura

A autoria não será transferida à LLM. O modelo propõe; uma camada administrativa estrutura e verifica; o autor revisa. Esse arranjo reduz a chance de transformar conveniência técnica em autoridade pedagógica.

## Referências citadas

Brown, T. B., Mann, B., Ryder, N., Subbiah, M., Kaplan, J., Dhariwal, P., et al. (2020). Language models are few-shot learners. *Advances in Neural Information Processing Systems*, 33, 1877-1901. <https://arxiv.org/abs/2005.14165>

DeepSeek. (2026). *JSON Output*. DeepSeek API Docs. <https://api-docs.deepseek.com/guides/json_mode>

Google AI for Developers. (2026). *Structured outputs*. Gemini API Docs. <https://ai.google.dev/gemini-api/docs/structured-output>

JSON Schema. (2026). *What is JSON Schema?* <https://json-schema.org/overview/what-is-jsonschema>

Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., et al. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. *Advances in Neural Information Processing Systems*, 33, 9459-9474. <https://arxiv.org/abs/2005.11401>

OpenAI. (2026). *Structured model outputs*. OpenAI API Documentation. <https://platform.openai.com/docs/guides/structured-outputs>
