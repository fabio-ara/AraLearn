# Autoria AraLearn v4

Este diretório reúne instruções, conhecimento e contratos para duas escalas de
autoria:

- o Chatbot personalizado ou o Plugin externo planeja, lê, combina, move e
  publica estruturas extensas;
- a assistência por API no aplicativo repara recursos selecionados, repara um
  card inteiro ou cria exatamente um card.

Esses fluxos compartilham o contrato `aralearn.contract` v4, mas não são
fallbacks um do outro. Plugin MCP e Action do Chatbot usam o mesmo registro de
ferramentas e o mesmo executor. Cada conexão usa o OAuth adequado ao cliente e
as capacidades efetivas da conta AraLearn.

## Workspace composto

Um workspace pode conter vários cursos. Seu estado atual é composto no
PostgreSQL a partir de uma linha por projeto, curso, módulo, lição, tópico,
microssequência e card. Uma alteração envia somente as partes que precisam ser
criadas, atualizadas, movidas ou excluídas.

Cada comando informa a revisão que leu e um identificador estável. Se duas
edições concorrem, a base antiga é recusada; se uma resposta se perde, repetir
o mesmo pedido recupera o resultado sem duplicar conteúdo. O servidor mantém
resumos recentes e pequenos das alterações, não cópias integrais antigas nem
uma função de restauração de revisão.

O Storage fica reservado aos artefatos imutáveis materializados na publicação
privada ou no catálogo. A submissão editorial aponta para o hash exato de uma
publicação privada. Assim, corrigir um título ou um card não grava outra cópia
integral do workspace.

Copiar e mover são operações diferentes. A cópia cria identidades novas para a
subárvore e deixa a origem intacta; o movimento transfere a parte atual e
remove a origem na mesma confirmação. Não existe compartilhamento oculto entre
as duas posições.

## Conversa e revisão

O assistente começa por um contexto curto, registra a estrutura planejada em
lotes pequenos e materializa uma microssequência por vez. Antes de usar um
resource pela primeira vez, consulta o schema exato. O chat mostra por padrão
as microteorias consolidadas e a quantidade de práticas, sem despejar todos os
cards para a pessoa autora.

Quando a conta possui leitura editorial, `consultarCatalogo` com
`operation: "search_courses"` localiza referências em todas as Coleções com
uma única consulta de metadados. Todos os termos informados precisam ocorrer
no título, objetivo, chave do curso ou nos metadados da coleção. O resultado
traz ids, hash, revisão e contagens, sem abrir o JSON do curso; o assistente lê
depois somente o recorte que realmente usará.

Em correção pontual, o assistente pagina metadados curtos dos cards da
microssequência, lê integralmente só o alvo e preserva seu id na substituição.
Uma mudança semântica devolve as unidades afetadas a `needs_review`; `ready` é
marcado depois da conferência, numa chamada separada.

Instruções curtas controlam o procedimento estável. Conhecimento sob demanda é
recuperado lexicalmente conforme a intenção, o nível estrutural e os resources
do pedido, com no máximo oito unidades relevantes. Não há embedding remoto,
banco vetorial nem armazenamento da conversa nesse mecanismo. O modelo propõe;
schemas fechados, validadores e operações determinísticas decidem o que pode
ser salvo.

O guia completo para pessoas autoras está em [Criar cursos pelo
chat](../docs/criar-cursos-pelo-chat.md). Os detalhes técnicos ficam em
[Gateway MCP](../docs/autoria-mcp.md) e a fronteira com a assistência local em
[Fluxos e contratos de geração](../docs/fluxos-prompts-e-contratos.md).

## Publicação e capacidades da conta

É sempre o mesmo assistente. As ferramentas disponíveis mudam conforme a conta:

- autoria privada: criar, reorganizar e publicar para teste próprio;
- submissão: enviar uma revisão privada para avaliação;
- revisão: ler o artefato submetido, assumir a fila, abrir uma cópia editorial
  independente e solicitar ajustes ou rejeitar;
- publicação: aprovar um curso completo em uma coleção do catálogo.

Uma publicação `private + partial` é uma prévia estudável, mesmo com partes
ainda planejadas. `private + complete` exige todas as microssequências prontas.
O catálogo aceita somente `complete`. O trabalho enviado por outro autor passa
por submissão e revisão; uma conta editorial também pode publicar diretamente
um curso completo de seu próprio workspace numa coleção oficial.

## Pastas

- `core/`: fluxo, estados, qualidade, fontes e segurança;
- `knowledge/`: contrato, resources e decisões didáticas;
- `platforms/`: instruções específicas;
- `schemas/`: contratos fechados de workspace, mutação, eventos, publicação e
  revisão editorial;
- `examples/`: exemplos do contrato v4.

Execute `npm run authoring:packages` para regenerar os pacotes e
`npm run test:authoring-packages` para validá-los.
