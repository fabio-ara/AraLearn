# Autoria remota por modelos de linguagem

O AraLearn permite que uma pessoa descreva, em linguagem natural, o curso que
pretende criar e conduza a produção com um modelo de linguagem. O modelo não
recebe acesso direto ao banco de dados. Ele atua por operações pequenas,
tipadas e autorizadas, oferecidas por um serviço intermediário. Essa separação
é importante porque gerar texto e alterar um sistema persistente são tarefas
diferentes: a primeira admite interpretação; a segunda precisa de limites,
validação, controle de concorrência e rastreabilidade.

Este documento explica o serviço de autoria remota, o protocolo usado para
conectá-lo a assistentes e as decisões de segurança e arquitetura que sustentam
o fluxo. Para conhecer primeiro a experiência de autoria, leia
[Criar cursos pelo chat](criar-cursos-pelo-chat.md). Para os conceitos gerais de
curso, workspace, artefato e publicação, consulte
[Autoria do catálogo](autoria-do-catalogo.md).

Três conceitos técnicos aparecem ao longo do capítulo:

- **JSON** é um formato textual que organiza dados em objetos, listas e valores identificados por nomes;
- **schema** é o conjunto de regras que declara quais campos, tipos e combinações uma entrada ou saída aceita;
- **kernel** é o núcleo estável do AraLearn que verifica a estrutura comum das partes de um card e coordena sua execução sem incorporar os detalhes de cada representação.

## O problema que o serviço resolve

Uma conversa sobre um curso pode conter pedidos de naturezas muito diferentes:

- planejar uma sequência de ensino;
- consultar o que já existe;
- produzir ou corrigir cards;
- escolher uma representação visual;
- reorganizar módulos e lições;
- registrar uma decisão editorial;
- submeter um curso a revisão ou publicá-lo.

Se todo pedido fosse convertido em uma escrita genérica de JSON, um erro de
interpretação poderia substituir conteúdo fora do escopo, ignorar uma revisão
mais recente ou produzir uma estrutura que o aplicativo não consegue abrir. O
AraLearn, por isso, expõe operações com entradas e resultados definidos. O
modelo escolhe uma operação; o servidor confere identidade, autorização,
versão e contrato; apenas então a alteração é aplicada.

Esse desenho segue uma regra de engenharia simples: quanto maior a
imprevisibilidade de um componente, menor deve ser sua autoridade direta. O
modelo propõe e compõe; o kernel valida; a camada de persistência decide se a
gravação ainda é válida.

## O que é MCP

O *Model Context Protocol* (MCP) é um protocolo aberto para conectar modelos de
linguagem a capacidades e informações externas. Em vez de embutir no prompt
toda a documentação de um sistema, um servidor pode anunciar ferramentas com
schemas de entrada e saída e disponibilizar recursos de consulta. O cliente
apresenta essas capacidades ao modelo e encaminha as chamadas autorizadas,
conforme as [primitivas definidas pela especificação do MCP](https://modelcontextprotocol.io/specification/2025-11-25/server).

No AraLearn, os termos têm os seguintes sentidos:

- **cliente MCP**: o aplicativo que hospeda a conversa com o modelo;
- **servidor MCP**: a Edge Function que recebe chamadas autenticadas;
- **ferramenta MCP**: uma operação que lê ou altera dados do AraLearn;
- **MCP Resource**: um texto de conhecimento lido sob demanda pelo modelo;
- **resource de card**: um package que materializa conteúdo ou resposta em um
  card, como fórmula, grafo ou lacuna.

As duas acepções de *resource* são distintas. Um MCP Resource fornece contexto
ao modelo; um resource de card faz parte do material que o estudante vê.

O servidor usa Streamable HTTP sem estado de sessão e implementa a versão
`2025-11-25` do protocolo. Cada requisição carrega tudo o que o servidor
precisa para processar aquela chamada; não há `MCP-Session-Id`. Essa opção
facilita a execução distribuída em Edge Functions e evita depender da memória
de uma instância que pode ser encerrada entre duas mensagens.

## Componentes e fluxo de uma alteração

```text
pessoa
  │ pedido em linguagem natural
  ▼
assistente com modelo de linguagem
  │ chamada tipada e token individual
  ▼
gateway de autoria
  ├─ autentica a conta
  ├─ deriva capacidades e escopo
  ├─ valida o schema
  ├─ confere a revisão esperada
  └─ executa a operação fechada
  ▼
workspace e persistência do AraLearn
  │ resultado estruturado
  ▼
assistente explica o que ocorreu
```

O gateway não é um segundo editor de cursos. Ele é uma fronteira de confiança:
traduz chamadas externas para o mesmo executor e as mesmas regras usados pelo
produto. O MCP e a integração por Action compartilham o registro de operações;
assim, uma plataforma não ganha uma forma privilegiada de escrever dados.

## Autenticação e autorização

### Por que autenticar cada pessoa

Uma chave administrativa compartilhada não permite distinguir quem criou uma
alteração, revogar apenas um participante nem aplicar permissões de workspace.
Ela também ampliaria o efeito de um vazamento. O AraLearn usa, portanto, um
access token OAuth 2.1 emitido pelo Supabase Auth para a conta que conduz a
autoria, seguindo o modelo do
[servidor OAuth do Supabase](https://supabase.com/docs/guides/auth/oauth-server)
e as práticas atuais de segurança consolidadas na
[RFC 9700](https://www.rfc-editor.org/rfc/rfc9700).

O backend valida emissor, audiência, cliente, titular e tempo de validade do
token. O token identifica a sessão, mas não decide sozinho o que ela pode
fazer. Depois da autenticação, o servidor consulta o papel da conta e deriva
suas capacidades no workspace. Essa separação evita confundir três conceitos:

- **autenticação** confirma quem é a pessoa;
- **capacidade** descreve uma ação que o sistema conhece;
- **autorização** decide se aquela pessoa pode exercer a capacidade naquele
  objeto e naquele momento.

O fluxo interativo usa Authorization Code com PKCE S256. PKCE vincula o código
temporário ao cliente que iniciou a autenticação e reduz o risco de interceptá-
lo durante o redirecionamento, conforme a
[RFC 7636](https://www.rfc-editor.org/rfc/rfc7636).

### MCP e Action

Algumas plataformas conectam-se diretamente por MCP. Outras consomem uma
especificação OpenAPI chamada Action. No AraLearn, a Action é uma fachada de
transporte: ela converte a chamada HTTP para o mesmo registro interno usado
pelo MCP. Como a interface de configuração da plataforma não expõe todas as
exigências de PKCE do servidor OAuth do Supabase, a Edge Function oferece a
fachada confidencial necessária a esse cliente. Essa diferença não cria dois
modelos de autorização nem duas implementações da autoria.

Corpos e respostas da Action são limitados a 96 KiB. O limite obriga a usar
leituras progressivas e resultados compactos, o que reduz truncamentos e torna
o custo de contexto mais previsível. O MCP aceita corpos JSON de até 32 MiB,
mas as ferramentas continuam desenhadas para lotes pequenos; capacidade de
transporte não é justificativa para enviar um curso inteiro em toda chamada.

## Workspace, revisão e concorrência

O **workspace** é a área de trabalho em que um curso está sendo planejado e
modificado. Ele possui identidade própria, participantes, estado editorial e
uma revisão crescente. A revisão funciona como um marcador de concorrência:

1. o cliente lê o workspace e recebe a revisão `r`;
2. prepara uma alteração com `expectedRevision: r`;
3. o servidor grava somente se `r` ainda for a revisão corrente;
4. em caso de sucesso, devolve uma revisão posterior;
5. se outra sessão tiver alterado o workspace, a operação falha sem escrita
   parcial e o cliente precisa reler o alvo.

Esse mecanismo é *compare-and-swap* (CAS). Ele evita a situação em que duas
conversas leem a mesma versão, escrevem respostas incompatíveis e a última
silenciosamente apaga a primeira.

Toda mutação também recebe um `requestId`. Repetir a mesma requisição após uma
falha de rede devolve o resultado anterior, em vez de executar a mudança duas
vezes. Essa propriedade é chamada **idempotência**. Ela é especialmente útil
em celulares e redes móveis, nas quais o cliente pode não saber se a resposta
se perdeu antes ou depois da gravação.

O workspace é composto por partes versionadas. O servidor recompõe o documento
somente quando precisa lê-lo como unidade e valida relações entre as partes
antes do commit. O objetivo é não transferir nem reescrever a árvore inteira
para alterar um card, sem abrir mão da verificação global quando ela é
necessária.

## Ferramentas fechadas e agrupadas

Uma ferramenta é fechada quando seu schema determina o que pode ser lido ou
alterado. O servidor não oferece uma operação universal de “substituir qualquer
JSON”. Em vez disso, separa ações como criar estrutura, materializar uma
microssequência, corrigir um card, mover uma entidade e publicar um artefato.

Operações próximas são agrupadas por finalidade para que a lista permaneça
compreensível e estável. O valor `operation` escolhe uma variante fechada; ele
não transforma a ferramenta em mutação genérica. Entre os grupos principais
estão:

| Grupo | Finalidade |
| --- | --- |
| `consultarBibliotecaDeResources` | descobrir, inspecionar, validar e auditar representações de cards |
| `consultarCatalogo` | listar coleções e localizar cursos publicados |
| `editarCatalogo` | criar ou atualizar coleções e mover cursos |
| `retirarDoCatalogo` | retirar coleções ou cursos de circulação |
| `reorganizarWorkspace` | copiar, renomear, mover, juntar, separar, promover ou rebaixar entidades |
| `excluirDoWorkspace` | excluir uma entidade ou o workspace |
| `gerirContinuidadeDaAutoria` | manter planejamento, Partes, decisões, mandatos e achados |
| `gerirWorkspaceEducacional` | administrar membros, convites, observações e comentários de estudo |

O registro público contém trinta ferramentas. Esse número descreve a versão
atual, não um princípio arquitetural. Novos packages de representação não
acrescentam uma ferramenta: entram no catálogo consultado pela ferramenta da
biblioteca.

Leituras que podem crescer são paginadas. Exclusões e retiradas permanecem
separadas das edições usuais para que sua consequência seja visível ao cliente.
Uma operação inequívoca não pede confirmação redundante; uma ambiguidade que
altera escopo, identidade ou efeito destrutivo precisa ser resolvida antes da
execução.

## Descoberta progressiva de resources

O catálogo pode crescer para dezenas ou centenas de representações. Enviar
todos os contratos ao modelo em toda conversa consumiria contexto, reduziria a
atenção disponível para o conteúdo e exigiria mudar o schema público a cada
package. A biblioteca adota uma consulta progressiva:

1. `explore` apresenta famílias e vocabulários, sem schemas extensos;
2. `search` procura uma lista curta pela intenção, disciplina, estrutura,
   operação cognitiva e modalidade de prática;
3. `inspect` compara até oito perfis completos;
4. `contracts` entrega os contratos de até quatro escolhas;
5. `validate_card` verifica schema, referências e compatibilidade;
6. `audit_representation` compara a composição com a intenção declarada;
7. `preview_card` devolve um descritor estrutural.

O último passo não produz screenshot. Graphviz, Vega, dimensões de viewport,
fontes e interações são materializados no navegador. Por isso,
`preview_card` informa `rendered: false`; a inspeção visual fiel precisa ocorrer
no renderer real do aplicativo.

### Adequação e substituição

A busca classifica candidatos com três tokens do contrato:

- `canonical`: o perfil especializado corresponde às facetas pedidas;
- `versatile`: uma representação transversal preserva a estrutura necessária;
- `substitute`: é a melhor aproximação disponível, mas falta uma representação
  mais apropriada.

Esses termos descrevem o resultado do algoritmo de catálogo; `canonical` não é
uma certificação externa de consenso acadêmico. Quando o ajuste é
`substitute`, a autoria não é bloqueada. O modelo usa a melhor alternativa,
informa brevemente a limitação no chat e registra a representação desejada na
continuidade. Quando um package especializado for instalado, o ranking poderá
preferi-lo sem mudar o kernel.

A decisão estruturada guarda intenção, package e versão escolhidos, ajuste,
catálogo consultado e limitações. Ela pertence à proveniência da autoria e não
é inserida no card exibido ao estudante.

## Conhecimento sob demanda

Além de ferramentas, o serviço oferece documentos curtos sobre fluxo,
qualidade, fontes, segurança, continuidade e semântica dos resources. O modelo
consulta apenas os trechos pertinentes ao trabalho atual. Essa recuperação
seletiva é uma forma simples e determinística de *retrieval-augmented
generation* (RAG): a consulta lexical ranqueia trechos versionados, limita o
resultado e preserva a identificação da fonte ([Lewis et al. (2020)](referencias.md#ref-lewis2020rag)).

A recuperação não substitui a validação do kernel. Ela ajuda o modelo a tomar
decisões; schemas e regras continuam decidindo o que pode ser persistido. Essa
divisão evita tratar texto de orientação como se fosse uma restrição executável
e evita sobrecarregar o prompt-base com todo o conhecimento do produto.

Antes de iniciar uma autoria, `prepararAutoriaAraLearn` recebe a intenção, o
nível estrutural e um resumo do contexto relevante. O resultado oferece um
brief compacto e fontes identificadas. Uma fonte só pode ser citada no card
depois de declarada nesse contexto. Conteúdo importado conserva as referências
que já possuía.

## Continuidade entre sessões

Conversas podem terminar antes do curso. Guardar o transcript completo seria
caro, repetitivo e pouco confiável como estado operacional. O AraLearn mantém
uma continuidade estruturada:

- **brief estável**: finalidade, público, escopo e fontes;
- **Parte**: lote ordenado de microssequências planejadas;
- **decisão**: escolha editorial que precisa sobreviver à conversa;
- **mandato**: autorização temporária e delimitada para construir, auditar,
  reparar ou reorganizar;
- **achado**: problema verificável, seu estado e eventual correção vinculada.

Ao retomar, o modelo lê essa projeção e os alvos atuais, em vez de confiar na
memória textual de uma conversa anterior. Auditoria e reparo são etapas
separadas: a auditoria registra achados; uma autorização posterior define quais
podem ser corrigidos; a nova auditoria verifica o resultado. Essa separação
reduz o risco de um diagnóstico ampliar sozinho a autoridade de escrita.

Comentários feitos durante o estudo e achados formais de auditoria também são
distintos. Um comentário pode orientar uma correção, mas não modifica o curso.
Depois de uma escrita confirmada, a operação de vínculo registra qual revisão
incorporou o comentário ou resolveu o achado.

## Artefato e publicação

Durante a autoria, o curso é renderizável mesmo incompleto. Não existe uma
categoria intermediária de “rascunho invisível” necessária para estudá-lo. A
publicação é outro ato: o servidor valida a composição, produz um artefato
imutável, calcula seu hash e atualiza a referência oficial do catálogo por
CAS.

O Storage conserva artefatos de publicação, não uma cópia integral para cada
pequena modificação. Estado relacional, eventos compactos e objetos imutáveis
têm funções diferentes; essa distribuição é explicada em
[Persistência relacional](persistencia-relacional.md).

A revisão editorial usa submissões privadas. O autor envia um artefato, o
revisor lê aquela versão fixa e registra uma decisão. Se o curso mudar depois,
uma nova submissão gera outro artefato. Assim, a avaliação não se desloca sob o
revisor e a publicação pode apontar exatamente para o conteúdo aprovado.

## Respostas, erros e limites

As ferramentas devolvem envelopes com resultado estruturado. O texto humano é
uma síntese; o objeto tipado é a fonte para automação. Erros distinguem, entre
outros casos:

- argumento incompatível com o schema;
- autenticação ausente ou inválida;
- capacidade insuficiente;
- entidade inexistente;
- revisão divergente;
- contrato de card inválido;
- limite de lote ou de payload excedido.

Um erro de revisão não deve ser contornado repetindo a escrita com a nova
revisão sem leitura. O procedimento correto é reler, comparar a intenção com o
estado atual e reconstruir a operação. Da mesma forma, um erro de contrato não
autoriza gravar parcialmente o card.

Recibos e estados auxiliares possuem retenções próprias, proporcionais à sua
função. Não existe uma retenção universal de quatorze dias para toda mutação:
observações de workspace e estados de governança educacional, por exemplo,
seguem políticas distintas. Os prazos implementados e suas migrations estão
documentados em [Supabase e banco de dados](supabase.md).

## Configuração

O endpoint tem a forma:

```text
https://<project-ref>.supabase.co/functions/v1/aralearn-authoring-mcp
```

Para conectar um cliente MCP:

1. confirme que as migrations e as Edge Functions da mesma versão estão
   implantadas;
2. cadastre o cliente OAuth e seus endereços de redirecionamento;
3. configure no cliente o endpoint acima;
4. autentique-se com uma conta individual do AraLearn;
5. confira se o cliente descobriu ferramentas e recursos;
6. faça primeiro uma leitura sem mutação;
7. execute uma jornada descartável de criação, leitura, alteração e limpeza.

Os pacotes prontos para plataformas específicas ficam em
[`authoring/platforms`](../authoring/platforms/). O guia principal de instalação
é [`authoring/README.md`](../authoring/README.md). Nunca use uma chave
administrativa do Supabase como token do cliente.

## Verificação

Uma verificação local adequada cobre três camadas:

```powershell
npm run test:authoring-packages
npm run test:authoring:mcp:local
npm run lint
```

O primeiro comando compara instruções, schemas e pacotes gerados. O segundo
exercita o protocolo e o executor em ambiente local. O lint detecta erros
estáticos. Quando houver um ambiente hospedado autorizado, o smoke test deve
usar uma conta descartável, criar um workspace próprio e removê-lo ao final;
descoberta pública e CORS, sozinhos, não comprovam uma mutação autenticada.

## Referências normativas e técnicas

- [Model Context Protocol — especificação 2025-11-25](https://modelcontextprotocol.io/specification/2025-11-25)
- [Supabase Auth como servidor OAuth 2.1](https://supabase.com/docs/guides/auth/oauth-server)
- [OAuth 2.0 Security Best Current Practice — RFC 9700](https://www.rfc-editor.org/rfc/rfc9700)
- [Proof Key for Code Exchange — RFC 7636](https://www.rfc-editor.org/rfc/rfc7636)
- [OpenAI — autenticação de GPT Actions](https://developers.openai.com/api/docs/actions/authentication)
- [OpenAI — notas de produção para GPT Actions](https://developers.openai.com/api/docs/actions/production)

As referências bibliográficas usadas na fundamentação acadêmica estão em
[`referencias.bib`](referencias.bib).
