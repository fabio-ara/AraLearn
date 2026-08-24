# GPT personalizado com Actions

Um GPT personalizado pode operar Cursos próprios sem usar o protocolo MCP. Ele
faz chamadas HTTP descritas por um documento OpenAPI e pede à pessoa que conecte
sua conta AraLearn por OAuth.

Esse canal é útil quando a conversa precisa ocorrer dentro de um GPT
personalizado que compreende Actions. Ele não substitui o MCP e não compartilha
sua conexão.

## O que o GPT pode fazer

A Action oferece cinco operações:

| Operação | Função |
| --- | --- |
| `listarCursos` | localizar Cursos próprios e devolver links para a interface |
| `lerCurso` | ler o recorte corrente necessário à tarefa |
| `criarCurso` | criar um Curso privado com título e objetivo |
| `alterarCurso` | executar uma alteração tipada, cercada por revisão e identidade de pedido |
| `consultarComponentesDidaticos` | descobrir, inspecionar, validar e visualizar componentes progressivamente |

Leituras de Planejamento, Fontes, Auditoria, Variantes e Pesquisa entram como
modos de `lerCurso`. As escritas correspondentes entram como operações fechadas
de `alterarCurso`. Isso mantém um catálogo pequeno sem transformar argumentos
livres em autoridade genérica.

## Configurar o GPT

O responsável pela implantação primeiro registra um cliente OAuth confidencial
para Actions. O segredo desse cliente fica no ambiente seguro do serviço e não
deve aparecer no GPT, na documentação pública ou no navegador.

Na configuração de Actions do GPT:

1. importe o arquivo
   [`aralearn-chatgpt-action-openapi.yaml`](downloads/aralearn-chatgpt-action-openapi.yaml);
2. configure a autenticação OAuth com os endereços de autorização e token
   declarados no próprio documento;
3. informe a identidade e o segredo do cliente cadastrados para essa Action;
4. salve a configuração e conecte uma conta AraLearn de teste;
5. peça primeiro para listar Cursos e confirme que aparecem somente Cursos
   próprios dessa conta.

O OpenAPI é gerado a partir do catálogo corrente. Edite o catálogo e regenere o
arquivo; não mantenha uma cópia manual concorrente.

## Como uma conversa segura progride

Antes de alterar um Curso, o GPT deve localizar o alvo, ler a revisão corrente e
explicar a operação proposta. Uma escrita usa um identificador de pedido estável
e a revisão esperada. Se o Curso mudar, a Action devolve conflito para que a
conversa releia o estado, em vez de sobrescrever trabalho novo.

Para produzir uma Unidade com componentes didáticos, a sequência adequada é:

```text
planejar → confirmar → descobrir → obter contratos exatos → gerar
→ validar → reparar de forma limitada → visualizar → aplicar
```

Uma resposta JSON bem formada pode continuar semanticamente inválida. A Action
de componentes valida o contrato e abre a prévia no renderer real antes da
aplicação.

## Diferença entre Actions e MCP

| Aspecto | Actions | MCP |
| --- | --- | --- |
| transporte | chamadas HTTP descritas por OpenAPI | protocolo Model Context Protocol |
| uso típico | GPT personalizado | cliente MCP compatível |
| OAuth | cliente confidencial próprio da Action | cliente e principal próprios do MCP |
| catálogo | cinco operações HTTP | cinco ferramentas canônicas |
| sessão | conexão do GPT | conexão do cliente MCP |

Os dois canais chegam ao mesmo executor de Curso e às mesmas regras de acesso.
A separação impede que um bearer, um consentimento ou uma suposição de protocolo
seja reutilizado no outro canal.

## Limites

Actions opera somente Cursos próprios. Perfil, acesso direto ao Estudo, cópia
pessoal, exclusão de Curso, exclusão de conta e Manutenção continuam na
aplicação autenticada.

URLs temporárias de PDF e texto integral de Observações só devem ser pedidos
quando a tarefa realmente exige enviar esses dados ao cliente conectado. O GPT
deve conservar os links literais devolvidos pelo AraLearn e nunca inventar
identidades, Fontes, Âncoras ou revisões.

Para o canal alternativo, consulte [Autoria por MCP](autoria-mcp.md). Para os
princípios comuns de intenção, confirmação e operação tipada, consulte [Fluxos,
instruções e contratos](fluxos-prompts-e-contratos.md).
