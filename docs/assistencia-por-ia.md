# Assistência de linguagem

O AraLearn oferece duas formas complementares de autoria:

- Chatbot ou Plugin, conectados por MCP, para planejar e transformar cursos e
  suas partes;
- assistência por API no próprio conteúdo, para intervenções delimitadas em
  cards, microssequências e lições.

A assistência por API é bottom-up: parte do trecho que a pessoa está vendo e
da seleção feita nessa tela. Ela não substitui a autoria estrutural ampla do
Chatbot ou Plugin.

## Autoria estrutural pelo Chatbot ou Plugin

Planejar cursos, organizar módulos, lições e microssequências, complementar
árvores existentes e recombinar partes entre cursos são responsabilidades do
Chatbot personalizado com Action ou do Plugin com MCP. O painel **Chatbot**
fornece os materiais e endereços necessários para configurar essas duas
formas de acesso.

O mesmo MCP calcula as capacidades da conta conectada. A passagem de um curso
privado para o catálogo ocorre somente por esse fluxo, nunca por um botão da
assistência bottom-up.

## Autoria integrada ao conteúdo

Visualização, edição manual e assistência por API usam a mesma árvore e o
mesmo card renderizado. Ao ativar a edição, o conteúdo selecionável recebe
apenas uma indicação visual de foco; os resources não mudam de tamanho nem são
copiados para outro painel.

Na edição manual, o texto autorizado torna-se editável no próprio resource. Na
assistência por API, um toque ou clique seleciona um alvo e outro toque o
retira da seleção. O botão de brilhos abre a caixa do pedido na própria
superfície; configuração do serviço e envio aparecem somente nesse momento.
Fechar a caixa não perde a seleção corrente.

A seleção concede a autoridade máxima daquela solicitação. O texto do pedido
pode escolher uma operação dentro desse limite, mas nunca ampliar o escopo.
Conteúdo não selecionado pode ajudar a interpretar o pedido, sempre como
contexto somente leitura.

## Escopos autorizados

### Card

Ao selecionar um ou mais resources, somente esses alvos podem mudar. Os
identificadores de alvo são fechados:

- `main` para os campos do resource principal;
- `response` para a prática contextual por escolha de um resource que não seja
  `choice`;
- `after:text` para o texto posterior canônico;
- `body:<id>` para um bloco do corpo de `composite`;
- `after:<id>` para um bloco de apoio.

Selecionar o card inteiro autoriza reparar seu conteúdo pedagógico. Identidade,
caminho e posição permanecem fixos. O nível de card não cria outro card nem
uma microssequência.

### Microssequência

Ao selecionar alguns cards, somente esses cards podem ser reparados,
removidos ou reordenados. Os demais cards ajudam a preservar progressão e
coerência, mas não podem ser alterados.

Selecionar todos os cards concede também autoridade sobre o recipiente da
microssequência e permite criar cards dentro dela. A solicitação continua sem
permissão para criar outra microssequência. Uma microssequência vazia pode ser
selecionada como recipiente para receber seu primeiro card.

### Lição

Ao selecionar uma microssequência, a assistência pode trabalhar nos cards
dessa microssequência e criar cards dentro dela. Selecionar várias, mas não
todas, autoriza apenas mudanças nas subárvores selecionadas.

Selecionar todas as microssequências concede autoridade sobre o recipiente da
lição e permite criar uma nova microssequência. Cada envio cria no máximo uma.
Uma lição vazia pode ser selecionada para receber sua primeira
microssequência.

Quando a lição contém uma única microssequência, selecioná-la representa ao
mesmo tempo uma unidade e o conjunto completo. O pedido define se a operação
cria cards nela ou uma nova microssequência irmã.

Não existe assistência por API nos níveis de módulo ou curso. Mudanças nessa
escala pertencem ao Chatbot ou Plugin.

## Contexto compacto e somente leitura

O contexto é montado a partir da autoridade selecionada. Ele inclui, conforme
necessário:

- caminho hierárquico, objetivos e guias;
- `topics`, `covers`, `checks`, `errors` e `dependsOn` relevantes;
- `guide.exclude` e `guide.avoid` completos;
- índices locais e a ordem dos elementos;
- vizinhos anteriores e posteriores em quantidade limitada;
- um índice compacto da lição.

O curso inteiro não é enviado por padrão. Essa composição ajuda modelos mais
leves a manter coerência sem confundir contexto informativo com conteúdo
gravável. Se as próprias barreiras obrigatórias excederem o orçamento seguro,
o pedido é recusado antes de chamar o serviço. Os demais campos extensos podem
ser truncados, com marcação explícita no contexto.

Não existe uma configuração separada de “Contexto didático”. O AraLearn monta
esse contexto automaticamente a partir do alvo, da hierarquia, dos guias e dos
vizinhos pertinentes. A pessoa escolhe apenas o provider, o modelo e a chave.

## Envio, validação e gravação

O botão de envio executa uma única intenção. O AraLearn:

1. congela a seleção, o conteúdo e a revisão lidos;
2. monta o contexto delimitado;
3. solicita uma saída estruturada ao serviço configurado;
4. valida schema, semântica, referências e limites do escopo;
5. confirma toda a mudança em uma única transação com compare-and-swap;
6. mostra imediatamente o conteúdo resultante.

A validação e a gravação atômica são garantias internas, não etapas adicionais
impostas à pessoa. Uma resposta inválida ou uma revisão desatualizada não
produz alteração parcial.

Somente a última mudança concluída conserva uma reversão compacta. Um único
botão **Desfazer** restaura o recorte anterior quando ele ainda corresponde à
revisão corrente; outra escrita torna essa reversão obsoleta. Não se cria um
histórico de cópias do curso.

O AraLearn verifica, entre outros pontos:

- campos obrigatórios e combinações de `resource`, `kind` e `exercise`;
- identidades, posições, dependências e referências internas;
- `answerIds`, opções e regras de lacunas;
- dados necessários a resources visuais;
- origem de referências declaradas;
- termos excluídos ou desaconselhados pelos guias;
- ausência de alterações fora da seleção;
- ausência de novas pistas indevidas para respostas.

Em reparo de resources, um problema semântico preexistente fora do alvo não
impede uma correção pontual, mas nenhum achado novo ou agravado é aceito. Em
reparo de card inteiro e nas criações autorizadas pela microssequência ou pela
lição, o resultado precisa passar integralmente pela validação aplicável.
Essas verificações não comprovam verdade factual nem suficiência pedagógica; a
responsabilidade autoral permanece humana.

## Permissões

As permissões derivam da sessão autenticada e falham fechadas quando o estado
é desconhecido ou vem apenas do cache.

| Conteúdo | Pessoa comum | Conta administrativa ou editorial |
| --- | --- | --- |
| Curso privado próprio | Edição manual e assistência por API | Edição manual e assistência por API |
| Curso oficial de Coleções | Somente estudo | Edição manual e assistência por API no curso oficial |
| Curso privado de outra pessoa | Sem edição | Sem edição neste recorte |

Uma edição de curso privado permanece no mesmo curso privado. Uma conta
autorizada que edita um curso oficial atualiza sua continuidade oficial. O
AraLearn não cria automaticamente uma cópia privada de curso do catálogo.
Promover um curso privado para Coleções continua sendo uma operação explícita
do Chatbot ou Plugin com MCP.

## Dados e disponibilidade

Ao pedir assistência, o contexto delimitado é enviado ao serviço escolhido.
Custos, limites, retenção de dados e disponibilidade dependem desse serviço.

O seletor inclui DeepSeek V4 Flash, DeepSeek V4 Pro, Gemini 3.6 Flash,
Gemini 3.5 Flash-Lite e o bridge local. Esses identificadores acompanham os
modelos de produção correntes documentados pelo
[DeepSeek](https://api-docs.deepseek.com/updates/) e pelo
[Gemini](https://ai.google.dev/gemini-api/docs/latest-model). Modelos já
encerrados não permanecem como opções.
Nenhum provider é escolhido silenciosamente: a pessoa faz uma seleção antes do
primeiro envio. A opção
**Outro modelo** aceita três protocolos:

A chave fica apenas na memória da página e é limpa ao trocar de família de
provider, para que uma credencial do DeepSeek nunca seja enviada ao Gemini, ou
vice-versa.

- **Compatível com OpenAI:** requer modelo, chave e URL HTTPS completa de Chat
  Completions com saída JSON estruturada; o endpoint oficial
  `https://api.openai.com/v1/responses` usa Structured Outputs estrito;
- **Gemini:** requer modelo e chave e usa a API oficial do Gemini;
- **Bridge local:** requer modelo e endereço do bridge. HTTP só é aceito em
  `localhost`, `127.0.0.1` ou no endereço local IPv6; endereços externos
  precisam de HTTPS.

O AraLearn verifica modelo, protocolo e endereço antes do envio. Uma
configuração inválida interrompe a operação, sem trocar silenciosamente de
serviço. A chave permanece somente na memória da página: não é gravada no
IndexedDB, no armazenamento do navegador nem em endereços. Ao recarregar ou
fechar o aplicativo, é preciso informá-la novamente.

A política de conteúdo da instalação precisa autorizar a origem usada pelo
serviço. DeepSeek e Gemini entram na lista padrão. O Android admite o bridge do
próprio dispositivo em `http://127.0.0.1:4183`; no servidor local, também é
aceito `http://localhost:4183`. Para **Outro modelo**, informe somente a origem
HTTPS necessária em `ARALEARN_ASSIST_ALLOWED_ORIGINS` durante o build.

Pedido, resposta e contexto montado não são anexados ao curso. O envio por IA
exige rede; a edição manual e o estudo do conteúdo já baixado continuam
disponíveis sem conexão.

O formato de intercâmbio está em [Contrato público](aralearn-contract.md). A
fronteira entre assistência local e MCP está em [Fluxos e contratos de
geração](fluxos-prompts-e-contratos.md). A autoria estrutural está em [Gateway
MCP de autoria](autoria-mcp.md), e o roteiro de uso está em [Criar cursos pelo
chat](criar-cursos-pelo-chat.md).
