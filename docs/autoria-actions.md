# GPT personalizado com Actions

Um GPT personalizado pode operar Cursos próprios sem falar o protocolo MCP. O
editor do GPT importa uma descrição [OpenAPI](https://spec.openapis.org/oas/v3.1.0)
e transforma seus caminhos HTTP em Actions. Ao conectar a conta, a pessoa
autoriza um cliente OAuth próprio desse GPT.

Esse canal serve à conversa dentro de um GPT personalizado compatível com
[GPT Actions](https://developers.openai.com/api/docs/actions/introduction). Ele
compartilha contratos de Curso com o MCP, mas não compartilha protocolo,
cliente, consentimento ou token.

## O que a Action oferece

| Operação | Função |
| --- | --- |
| `listarCursos` | localizar Cursos próprios e devolver links para a interface |
| `lerCurso` | ler o recorte corrente necessário à tarefa |
| `criarCurso` | criar um Curso privado com título e objetivo |
| `alterarCurso` | executar uma alteração tipada, cercada por revisão e identidade de pedido |
| `consultarComponentesDidaticos` | descobrir, inspecionar, validar e visualizar componentes progressivamente |

Planejamento, Fontes, Observações, Auditoria, Variantes e Pesquisa aparecem
como vistas de `lerCurso` ou operações fechadas de `alterarCurso`. O GPT não
recebe uma rota genérica para banco nem uma operação por tabela.

O OpenAPI é uma projeção do protocolo público
`aralearn.authoring-protocol.v1`, não uma cópia dos tipos internos do domínio.
Um adaptador explícito leva esse vocabulário ao mesmo executor usado pelo MCP,
e os validadores do servidor continuam conferindo a operação antes da escrita.
A primeira leitura da fase inclui `phaseGuidance` focal.

A projeção para Actions preserva as regras necessárias para o GPT montar uma
chamada válida. Uma regra redundante pode ser simplificada, uma orientação sem
efeito estrutural permanece na descrição e uma condição necessária vira
variantes `oneOf` explícitas, com campos obrigatórios e proibidos próprios. O
compilador precisa consumir cada condicional `allOf` estrutural; a geração falha
se alguma ficar sem tratamento. Não existe remoção global de `allOf` seguida
apenas de validação tardia no backend.

Os discriminadores públicos usam `const` no protocolo canônico. Na projeção de
Actions, cada literal vira `type` com `enum` de um único valor, porque o
importador do ChatGPT preserva essa forma e pode degradar `const` para um tipo
indeterminado. A transformação muda a representação aceita pelo importador,
não o vocabulário nem as regras do protocolo.

## Preparar um cliente OAuth

A configuração começa antes de o GPT possuir seu identificador definitivo. A
conta que prepara a integração registra um cliente; o AraLearn devolve
`client_id` e `client_secret`. O servidor guarda somente o hash do segredo, por
isso o valor devolvido precisa ser levado diretamente à configuração protegida
do GPT e não pode ser recuperado depois.

O cadastro é uma operação autenticada da própria conta AraLearn:

```http
POST https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-action/oauth/clients/register
Authorization: Bearer <sessão AraLearn da conta>
Content-Type: application/json

{}
```

A resposta informa também os endereços de autorização e token, o escopo
`openid email` e o método `client_secret_post`. Não use chave publicável,
`service_role` nem chave `sb_secret_` no cabeçalho `Authorization`. O bearer é a
sessão pessoal corrente e deve permanecer fora de histórico do shell, logs e
capturas.

Registrar outra preparação ainda não vinculada invalida a anterior da mesma
conta. Uma conta pode manter até 25 integrações vinculadas e ativas.

## Criar e vincular o GPT

A [configuração oficial de OAuth para Actions](https://developers.openai.com/api/docs/actions/authentication)
pede os mesmos campos devolvidos pelo AraLearn. No editor do GPT:

1. importe
   [`aralearn-chatgpt-action-openapi.yaml`](downloads/aralearn-chatgpt-action-openapi.yaml);
2. escolha OAuth na autenticação da Action;
3. informe `client_id`, `client_secret`, URL de autorização, URL de token e o
   escopo `openid email`;
4. salve o GPT para obter seu identificador no formato `g-...`;
5. vincule esse identificador ao cliente recém-criado;
6. conecte uma conta de teste e confira primeiro `listarCursos`.

O vínculo também usa a sessão AraLearn da conta que criou o cliente:

```http
POST https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-action/oauth/clients/<client_id>/link
Authorization: Bearer <sessão AraLearn da conta>
Content-Type: application/json

{"gptId":"g-<identificador-do-gpt-salvo>"}
```

O servidor associa ao cliente os callbacks oficiais do ChatGPT para esse GPT:

```text
https://chatgpt.com/aip/g-<identificador>/oauth/callback
https://chat.openai.com/aip/g-<identificador>/oauth/callback
```

O `client_secret` fica no armazenamento protegido da configuração do GPT. Ele
não entra em instruções, conversa, OpenAPI, site ou navegador do AraLearn. A
[introdução oficial à configuração de Actions](https://developers.openai.com/api/docs/actions/getting-started)
explica o editor e o teste da conexão.

## Autorização da conta

Ao conectar, o GPT abre o endpoint `/oauth/authorize` com código de autorização,
callback oficial, `state` e `openid email`. O AraLearn leva a pessoa à entrada
ou à tela de consentimento do próprio site. Aprovar cria um código de uso único
e duração limitada; negar devolve `access_denied` ao callback.

O endpoint `/oauth/token` confere cliente, segredo, código e callback. O access
token resultante é opaco, dura normalmente uma hora e é resolvido por hash a
cada Action. O refresh token é rotativo e o valor anterior deixa de ser aceito
depois da troca. Vincular ao mesmo GPT um novo cliente preparado pela conta
desativa o cliente anterior e revoga seus tokens. A execução corrente não
oferece uma operação separada para revogar uma concessão já vinculada.

Os escopos identificam a conexão, mas não concedem escrita geral. Depois de
resolver o token opaco, o servidor cria um principal interno com as capacidades
`authoring:read` e `authoring:write`; elas não são escopos OAuth configuráveis no
GPT. Toda operação continua limitada aos Cursos próprios desse principal, aos
argumentos admitidos e às revisões esperadas.

## Como uma conversa segura progride

Antes de alterar um Curso, o GPT localiza o alvo, lê a revisão corrente e
explica a operação proposta. Uma escrita usa um identificador de pedido estável
e a revisão esperada. Se o Curso mudar, a Action devolve conflito para que a
conversa releia o estado, em vez de sobrescrever trabalho novo.

Em parâmetros, `clear_parameter` remove a decisão local e restaura a herança.
`set_parameter` com `mode: automatic` delega a resolução ao AraLearn/GPT e
registra o valor resolvido com justificativa pública breve. `mode: explicit`
fixa uma decisão com `origin: author|research_condition`. O servidor converte
essas formas inequívocas para o mesmo domínio canônico usado pela aplicação.

Ao registrar ou verificar uma rodada de Auditoria, a Action envia ao menos um
check de qualidade factual, um de qualidade pedagógica e um de qualidade
editorial. A conformidade estrutural é calculada pelo servidor. O contexto
focal devolve a identidade corrente das parametrizações e a identidade opaca
do alvo de cada Observação para que o GPT consiga ligar decisão, pendência,
proposta e reparo sem copiar o Curso inteiro para a conversa.

Ao registrar Fontes, o GPT usa somente metadados fornecidos ou verificados. Se
autoria, data, edição, periódico ou outro dado necessário estiver ausente, ele
explica a lacuna e pergunta à pessoa em vez de inventar. A citação identifica a
Fonte; o localizador humano identifica capítulo, seção, unidade, slide, figura
ou tabela declarados pelo material; o seletor conserva a posição exata.

Para produzir uma Unidade com componentes didáticos:

```text
planejar → confirmar → descobrir → obter contratos exatos → gerar
→ validar → reparar de forma limitada → visualizar → aplicar
```

JSON bem formado pode continuar semanticamente inválido. A operação de
componentes valida o contrato e abre a prévia no renderer real antes da
aplicação.

Texto integral de Observações e URL temporária de PDF exigem declarações
explícitas no pedido porque esses dados serão enviados ao GPT conectado. A URL
assinada de download funciona como credencial por sessenta segundos; solicite-a
somente quando a tarefa precisar ler aquele PDF.

## Diferença entre Actions e MCP

| Aspecto | Actions | MCP |
| --- | --- | --- |
| transporte | chamadas HTTP descritas por OpenAPI | Model Context Protocol |
| uso típico | GPT personalizado | cliente MCP compatível |
| cliente OAuth | confidencial, ligado ao GPT | público ou conforme o cliente MCP cadastrado dinamicamente |
| escopo | `openid email` | `offline_access` |
| token | opaco, resolvido por hash | JWT ES256 minimizado e destinado ao recurso MCP |
| catálogo | cinco operações HTTP | cinco ferramentas canônicas |

Depois de autenticar seus principais, os dois canais chegam ao mesmo executor
de Curso. Essa convergência mantém revisão, idempotência, validação e histórico;
ela não torna bearers ou consentimentos intercambiáveis.

## Verificação e recuperação

O OpenAPI é gerado a partir do catálogo corrente:

```powershell
npm.cmd run actions:openapi:check
npm.cmd run test:authoring:actions
```

O arquivo gerado deve permanecer abaixo de 72 KiB. O teste também confirma que
os discriminadores chegam como enums unitários, que toda condicional canônica
foi compilada e que chamadas válidas e inválidas são distinguidas pelo próprio
esquema. O documento declara o identificador do protocolo, sua `schemaVersion`
e o fingerprint SHA-256 do catálogo.

O endpoint da Action devolve a mesma identidade no cabeçalho
`X-AraLearn-Authoring-Contract`, inclusive no preflight. Durante a implantação,
esse valor precisa coincidir com a autoridade local; divergência interrompe o
gate. Como o editor do GPT conserva uma cópia da especificação importada,
publicar outro arquivo não atualiza sozinho um GPT existente: reimporte, salve e
confira no Preview os discriminadores e argumentos efetivamente apresentados ao
modelo.

Se a importação divergir, regenere o documento com `npm run actions:openapi` e
revise o diff. Se a conexão falhar antes do consentimento, confronte
`client_id`, URLs, escopo e identificador vinculado. Se falhar na troca, gere
outra preparação em vez de reutilizar um segredo possivelmente perdido; a nova
preparação invalida somente o cadastro ainda não vinculado.

Actions opera somente Cursos próprios. Perfil, acesso direto ao Estudo, cópia
pessoal, exclusão de Curso, exclusão de conta e Manutenção permanecem na
aplicação autenticada.

Para o canal alternativo, consulte [Autoria por MCP](autoria-mcp.md). Para a
fronteira comum entre linguagem natural e escrita, consulte [Fluxos, instruções
e contratos](fluxos-prompts-e-contratos.md).
