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
| `incorporarPdfComoFonte` | manter um PDF transportado pelo ChatGPT entre as Fontes do Curso |
| `consultarComponentesDidaticos` | descobrir, inspecionar, validar e visualizar componentes progressivamente |

Planejamento, metadados e vínculos de Fontes, Observações, Auditoria, Variantes
e Pesquisa aparecem como vistas de `lerCurso` ou operações fechadas de
`alterarCurso`. A transferência do PDF fica isolada em
`incorporarPdfComoFonte`. O GPT não recebe uma rota genérica para banco nem uma
operação por tabela.

O OpenAPI apresenta ainda `add_plan_item`, `update_plan_item` e `add_part` como
projeções dedicadas de Actions. Elas continuam executando as variantes
homônimas de `planCommand` dentro de `alterarCurso`; não acrescentam comandos ao
protocolo público nem criam outro caminho no domínio. As projeções de criação
omitem a identidade técnica: a camada confiável a gera antes de chegar ao
domínio.

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

Todo `requestBody` também declara `type: object` e `properties` na raiz. O
importador descarta a operação quando um desses elementos falta e ignora
`oneOf` de raiz mesmo quando o aceita no editor. Por isso, a projeção usada para
validar Actions conserva os unions estritos, enquanto o OpenAPI entregue ao GPT
expõe uma superfície agregada, derivada dessas variantes, com todos os campos,
enums discriminadores e condições de uso nas descrições.

O importador também ignora campos obrigatórios declarados somente dentro de
uma condição aninhada. Por isso, `add_plan_item`, `update_plan_item` e
`add_part` recebem projeções dedicadas. As duas primeiras contêm um objeto
`planCommand` sem union, cujo `required` direto inclui `sourceLinks` — inclusive
`[]` quando não há Fonte a vincular. `add_part` expõe somente os dados
pedagógicos e de posição; não pede ID. A projeção genérica deixa de anunciar
essas três variantes para que o GPT não escolha a forma ambígua. O servidor
mantém o vocabulário canônico e continua aplicando a variante estrita antes de
executar a chamada.

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

1. em **Importar de URL**, use
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

Antes de alterar um Curso, o GPT localiza o alvo pelo título, lê a revisão
corrente e explica a operação proposta. Se houver uma correspondência única
plausível, pode usá-la; se houver Cursos homônimos, pede uma escolha por objetivo,
etapa ou atividade recente, sem exigir UUID como primeira opção. Uma nova sessão
pode, assim, retomar o Curso vivo por nome sem receber um prompt técnico de
restauração.

Depois de localizar o Curso, a retomada documental relê o planejamento e o
catálogo de Fontes persistido. O GPT apresenta um resumo curto por referência
humana, aprofunda somente as Fontes ligadas à tarefa e combina `citationText`
com o localizador verificável da Âncora. IDs, revisões, hashes e caminhos ficam
nos dados estruturados. O PDF de uma edição só é solicitado quando a tarefa
exige leitura focal; os demais documentos permanecem fechados.

O esquema da Action conserva um identificador de pedido estável, revisões,
versões esperadas e demais metadados necessários. A fala do GPT não é uma cópia
desse esquema: **preservar internamente != mostrar ao usuário**. Por padrão, ela
explica estado autoral, lacunas, efeito, preservações, materialização e decisão
humana. Pode acrescentar transparência leve sobre releitura ou validação; em uma
falha, passa a diagnóstico humano; IDs, CAS, payload, chamada e erro bruto ficam
para pedido técnico explícito.

Identidades têm uma regra única. O GPT preserva as identidades que releu para
alterar objetos existentes, mas omite a identidade de um objeto novo. Antes da
validação do domínio, a camada confiável comum a Actions e MCP gera um UUID a
partir do Curso, do `requestId`, da operação e da posição estrutural do objeto.
Repetir a mesma chamada produz, assim, a mesma identidade e o mesmo payload;
CAS e idempotência continuam independentes. Isso vale para novos itens formais
do plano, Partes, Fontes, Âncoras, Anotações, rodadas e achados de Auditoria,
correções, comparações, entidades da composição e etapas de materialização. Os
campos antigos continuam aceitos pelo protocolo v1 para compatibilidade, mas
um GPT não precisa nem deve fabricá-los.

Quando vários objetos novos se referem entre si no mesmo lote, o GPT usa os
índices locais publicados: pai, Unidade, verificação, ramificação e dependência
de Microssequência são resolvidos pela camada confiável. Cursos filhos de uma
comparação recebem identidade do banco. `opportunityId` é uma chave semântica da
oportunidade pedagógica, não um UUID de entidade a ser inventado.

As respostas HTTP mantêm `requestId`, `data` ou `error` e acrescentam
`conversation` como projeção separada. Assim, os controles continuam
recuperáveis pelo GPT, enquanto a mensagem padrão permanece humana. A certeza
de escrita distingue estado nenhum, parcial, concluído ou desconhecido; uma
falha de entrega posterior à gravação não pode ser descrita como “nada foi
salvo”.

Quando uma decisão ainda estiver aberta ou o domínio exigir confirmação, uma
forma adequada seria “Vou acrescentar 9 resultados de aprendizagem,
30 elementos fundamentais e 12 formas de evidência. As 12 Partes permanecem
como estão e nenhuma aula será criada. Confirmo?”. “Vou chamar
`update_instructional_plan` com `expectedRevision` e este payload. Confirmo?” é
inadequado: descreve o mecanismo, não o efeito pedagógico. O primeiro texto é um
exemplo, não um template rígido. Somente a incorporação de PDF dispensa uma
segunda pergunta quando o próprio pedido já declara inequivocamente que o
documento deve integrar as Fontes do Curso.

Se o Curso mudar, a Action devolve conflito para que a conversa releia o estado
e reconcilie a intenção, em vez de sobrescrever trabalho novo. Falha, tempo
esgotado ou resposta perdida não autorizam falso sucesso: o GPT informa o que foi ou não
confirmado e segue o próximo passo seguro indicado pelo resultado estruturado.
Quando a pessoa pedir “Mostre os IDs, as revisões e a chamada que falhou”, o GPT
apresenta os dados disponíveis literalmente e não inventa os ausentes. Links
para a interface permanecem no resultado e são oferecidos como ação útil, por
exemplo **Abrir planejamento no AraLearn**, sem serem despejados em toda
retomada.

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

Uma edição nova, errata ou norma substituta recebe Âncoras próprias. Aposentar
uma Fonte ou Âncora bloqueia novos vínculos, mas preserva a proveniência do
planejamento e do conteúdo históricos; a conversa não troca silenciosamente a
edição atribuída.

Para manter um PDF no Curso, a Action `incorporarPdfComoFonte` recebe os
controles do Curso, um `sourceIntent` e a referência de arquivo oficial do
ChatGPT. `sourceIntent` contém exatamente uma propriedade: `existingSource`
para uma Fonte já registrada, `newSource` para criar uma Fonte ou
`revisedSource` para revisar uma Fonte junto com a incorporação. O limite de
uma propriedade elimina a combinação entre um modo e dados de outro modo no
OpenAPI achatado pelo importador.

Ao criar uma Fonte, o título é o único metadado bibliográfico obrigatório. Os
campos bibliográficos conhecidos podem ser enviados em `newSource`, mas
lacunas permanecem desconhecidas, não verificadas e ocultas no Estudo até
revisão posterior. A criação não recebe ID nem revisão da Fonte. O backend gera
a identidade e determina tipo, origem, disponibilidade, verificação e
visibilidade. `revisedSource` reúne a identidade, a revisão esperada e o estado
completo lido da Fonte para impedir que uma chamada parcial apague dados já
registrados.

O runtime continua aceitando a forma 1.x `mode: save` com `source` para retries
de clientes antigos conservarem o mesmo payload e a mesma idempotência. Essa
forma de compatibilidade não aparece no OpenAPI novo apresentado ao modelo.

No OpenAPI importado e na superfície apresentada ao modelo,
`openaiFileIdRefs` é uma lista de strings com exatamente um elemento. O modelo
seleciona a referência lógica do PDF anexado; não monta nome, URL nem objeto de
arquivo. Ao executar a Action, o próprio ChatGPT substitui essa referência pelo
descritor de transporte `{name, id, mime_type, download_link}`. O adaptador
valida esse descritor e o converte no objeto `pdf` canônico. As duas formas
pertencem, portanto, a momentos diferentes da mesma chamada: a lista de string
é o contrato que orienta o modelo, e o descritor rico é o payload entregue em
runtime ao backend.

O anexo fica vinculado à mensagem em que foi enviado. A primeira chamada e um
retry ainda associado àquela mensagem podem reutilizá-lo; se a tentativa partir
de uma mensagem posterior, anexe novamente o mesmo PDF. A pessoa nunca informa
hash, tamanho nem caminho técnico. O backend baixa o arquivo, calcula tamanho e
hash, escolhe o caminho privado e confirma a associação com a Fonte.

A política de egress corrente aceita HTTPS somente em subdomínios de
`oaiusercontent.com`, inclusive os regionais já observados. Essa allowlist é
uma regra de segurança do AraLearn, não uma promessa de hostname do contrato da
OpenAI. Alterá-la exige evidência do canal e nova análise de SSRF; o backend não
aceita HTTPS arbitrário. Domínio nu, hosts apenas parecidos, credenciais na URL,
fragmentos, portas não padrão e redirecionamentos continuam recusados. A URL
assinada, a identidade do arquivo, o hash e o caminho de Storage não aparecem
na conversa nem em logs permanentes.

O comando legado `attach_pdf`, que pressupõe um objeto já gravado no Storage,
continua aceito pelo protocolo canônico para clientes anteriores, mas fica fora
da descoberta de Actions. Para um GPT, `incorporarPdfComoFonte` é o único
caminho anunciado de ingestão.

Pedidos como “use este edital para fundamentar o Curso”, “considere este PPC e
esta prova no planejamento” ou “incorpore esta nova norma e revise a Parte” já
autorizam manter os respectivos documentos, sem exigir “salve este arquivo” ou
outra frase mágica. Diante de “O que você acha deste PDF?”, o GPT pergunta
exatamente: “Você quer usar este documento só nesta análise ou mantê-lo entre as
Fontes do Curso?”. Se a resposta ou o pedido inicial limitar o uso à conversa,
a Action não é chamada. Essa política vale em qualquer fase da autoria.

Sucesso só é anunciado depois de o resultado confirmar `stored: true`. Arquivo
repetido é reutilizado; falha de transferência, tamanho ou cota é comunicada em
linguagem humana sem inventar sucesso. Os detalhes técnicos disponíveis só são
mostrados quando a pessoa os pedir explicitamente.

Um retry consulta primeiro um recibo vinculado à identidade estável do arquivo,
sem conservar a URL temporária. Se o recibo for compatível, o backend reverifica
o objeto privado e devolve o resultado confirmado sem novo download. Trocar o
arquivo e reutilizar o mesmo `requestId` é conflito, não sucesso idempotente.

Falhas de arquivo não são tratadas como um único “anexe novamente”. Referência
ausente ou malformada pede correção da chamada com o anexo corrente; mais de um
arquivo pede a escolha de um único PDF; tipo incompatível pede um PDF válido;
acesso temporário expirado pede que o mesmo arquivo seja anexado de novo. Falha
transitória de download ou timeout repete a mesma chamada e o mesmo `requestId`.
Se a persistência não puder ser confirmada, o mesmo `requestId` recupera o
recibo antes de qualquer nova escrita. A resposta comum traduz cada caso para a
tarefa e não expõe o descritor técnico.

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
| catálogo | seis operações canônicas e três projeções dedicadas | seis ferramentas canônicas |

Depois de autenticar seus principais, os dois canais chegam ao mesmo executor
de Curso. Essa convergência mantém revisão, idempotência, validação e histórico;
ela não torna bearers ou consentimentos intercambiáveis.

## Verificação e recuperação

O OpenAPI é gerado a partir do catálogo corrente:

```powershell
npm.cmd run actions:openapi:check
npm.cmd run test:authoring:actions
```

O próprio `info.description` do artefato inclui as instruções compartilhadas de
autoria e divulgação progressiva. A reimportação continua necessária para um
GPT já salvo, pois sua configuração externa conserva a cópia anterior; esse ato
não pode ser realizado pelo repositório.

O arquivo gerado deve permanecer abaixo de 136 KiB. O teste também confirma que
os discriminadores chegam como enums unitários, que toda condicional canônica
foi compilada e que os casos condicionais cobertos pelo contrato são
distinguidos pelo próprio esquema. A criação bibliográfica mínima e a revisão
completa são formas estruturalmente distintas, e o backend revalida suas
invariantes de forma autoritativa. O documento declara o identificador do
protocolo, sua `schemaVersion` e o fingerprint SHA-256 do runtime canônico do
qual deriva.

O endpoint da Action devolve a mesma identidade no cabeçalho
`X-AraLearn-Authoring-Contract`, inclusive no preflight. Durante a implantação,
esse valor precisa coincidir com a autoridade local; divergência interrompe o
gate. Como o editor do GPT conserva uma cópia da especificação importada,
publicar outro arquivo não atualiza sozinho um GPT existente: reimporte, salve e
confira no Preview os discriminadores e argumentos efetivamente apresentados ao
modelo.

O OpenAPI também declara `x-aralearn-conversational-projection`, sua versão e
seu fingerprint; as respostas repetem essa identidade em
`X-AraLearn-Authoring-Projection`. Ela identifica a forma conversacional
compartilhada com MCP, enquanto o fingerprint do contrato identifica o runtime
canônico que continua aceitando retries 1.x.

Depois de publicar uma mudança de contrato, importe novamente o OpenAPI no GPT,
salve a configuração e abra uma conversa nova. Antes do smoke, confirme na
discovery que `incorporarPdfComoFonte` contém `openaiFileIdRefs`, que `add_part`
não contém `id` e que `attach_pdf` não é oferecido. A regressão automatizada
`npm.cmd run test:authoring:supabase:e2e` combina duas provas: um probe HTTP usa
o OpenAPI e a rota local realmente servidos para validar o binding na borda; o
caso de sucesso usa o mesmo handler público, com apenas o fetch temporário da
OpenAI injetado, e atravessa executor, RLS, PostgreSQL e Storage antes de reabrir
o Curso por título em outro cliente. O smoke no GPT continua necessário para
comprovar a configuração externa salva, a discovery apresentada ao modelo e a
referência temporária emitida pelo ChatGPT.

Faça o smoke real somente com um Curso privado descartável e um título único;
nunca use um Curso de trabalho como fixture. O caso mínimo é:

1. em uma conversa nova, crie `TESTE ACTIONS PDF — <data-hora>`;
2. anexe, na mesma mensagem do pedido de incorporação, uma fixture sintética de
   PDF com conteúdo reconhecível na página 44;
3. peça para mantê-lo como Fonte “Edital de exemplo 2026” e criar a Âncora
   “Edital de exemplo 2026, p. 44” para “Perfil 13 — Gestão de Servidores”;
4. confirme pela releitura que a Fonte possui um PDF mantido, a Âncora existe e
   a revisão do Curso avançou, sem IDs, hash, URL ou caminho de Storage na
   resposta comum;
5. encerre a conversa, abra outra e peça “Continue a autoria do Curso
   `TESTE ACTIONS PDF — <data-hora>`”; a nova conversa deve localizar o Curso
   pelo título e reencontrar Fonte, PDF e Âncora.

Se for necessário repetir a incorporação em outra mensagem, anexe nela o mesmo
arquivo. Limpe o Curso descartável pela aplicação somente depois de concluir a
prova entre as duas conversas.

O editor expande o documento importado antes de salvá-lo e limita o campo de
schema. Por isso, a geração também valida o tamanho da representação formatada,
não apenas o arquivo minificado. Depois da importação, a tabela **Ações
disponíveis** precisa mostrar as seis operações canônicas e as três projeções
dedicadas, terminando em `add_part`; ausência de uma operação indica importação
incompleta e impede o smoke.

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
