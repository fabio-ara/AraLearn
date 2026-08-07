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

O esqueleto, a largura, a altura, a tipografia e os espaçamentos do alvo são
os mesmos nos três modos. Na edição, o texto digitável ocupa a caixa original
e rola dentro dela se ultrapassar o espaço disponível. Salvar e cancelar ficam
no rodapé da tela, nunca dentro do card ou do resource selecionado.

O modo Editar conserva o renderer canônico de cada resource: muda apenas a
editabilidade do texto que possui caminho inequívoco no contrato. Identidades,
relações, respostas, topologia e demais elementos estruturais continuam
somente leitura. Em projeções como fluxogramas, um texto só se torna editável
quando pode ser associado deterministicamente ao campo de origem.

Na edição manual, o texto autorizado torna-se editável no próprio resource. Na
assistência por API, um toque ou clique seleciona um alvo e outro toque o
retira da seleção. O botão de brilhos abre a caixa do pedido na própria
superfície; configuração do serviço e envio aparecem somente nesse momento.
Fechar a caixa não perde a seleção corrente. A caixa flutua acima do rodapé e
não reduz nem desloca o card, os resources ou a lista estrutural.

Em lições e microssequências, o próprio card HTML é a superfície de seleção:
toques sucessivos acumulam alvos, e a seleção permanece ao atualizar a tela.
O contorno é desenhado para dentro, sem cortar a borda nem alterar a largura.

A seleção concede a autoridade máxima daquela solicitação. O texto do pedido
pode escolher uma operação dentro desse limite, mas nunca ampliar o escopo.
Conteúdo não selecionado pode ajudar a interpretar o pedido, sempre como
contexto somente leitura.

Na escolha da operação, o provider recebe somente o pedido, a autoridade
calculada e a lista fechada de operações; conteúdo pedagógico, guides e cards
não participam dessa classificação. `unsupported` é uma resposta válida quando
o pedido não cabe na seleção, para que uma criação fora de escopo nunca seja
reinterpretada como atualização. Remover ou mover exige que o pedido se refira
explicitamente ao card ou à microssequência: “remova a redundância do card” é
reparo de conteúdo, não exclusão do card.

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

Ao selecionar alguns cards, somente esses cards podem ser reparados, removidos
ou reordenados. Os demais ajudam a preservar progressão e coerência, mas não
podem ser alterados. Um reparo que precise gerar novamente vários cards alcança
no máximo oito por envio.

Selecionar todos os cards concede também autoridade sobre o recipiente da
microssequência e permite criar até oito cards dentro dela no mesmo envio. A
solicitação continua sem permissão para criar outra microssequência. Uma
microssequência vazia pode ser selecionada como recipiente para receber seu
primeiro card.

### Lição

Ao selecionar uma ou mais microssequências, a assistência pode atualizar seus
metadados, removê-las ou reordená-las dentro da lição. Quando exatamente uma é
selecionada, também pode criar até oito cards dentro dela. Para reparar cards
já existentes, é preciso entrar na microssequência e selecionar esses cards.

Selecionar todas as microssequências concede autoridade sobre o recipiente da
lição e permite criar uma nova microssequência. Cada envio cria no máximo uma.
Ela pode nascer com até oito cards. Uma lição vazia pode ser selecionada para
receber sua primeira microssequência.

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
gravável. Cada envelope contextual serializado tem o limite de 64 mil
caracteres. Índices e vizinhos são compactados em torno da seleção;
`guide.exclude` e `guide.avoid` permanecem integrais dentro desse orçamento. Se
as próprias barreiras obrigatórias excederem o limite seguro, o pedido é
recusado antes de chamar o serviço. Os demais campos extensos podem ser
truncados, com marcação explícita no contexto.

No reparo de resource, o valor selecionado aparece uma única vez, em
`writableTargets`. A cópia do card em `readOnlyContext` conserva os resources
não selecionados e marca o alvo gravável como omitido; essa separação ocorre
antes de qualquer truncamento. Ao criar cards dentro da única microssequência
selecionada no nível de lição, um índice compacto readonly informa `index`,
identidade, posição, título e representação dos cards existentes, para que o
modelo escolha uma fronteira de inserção sem ganhar escrita sobre eles.

Não existe uma configuração separada de “Contexto didático”. O AraLearn monta
esse contexto automaticamente a partir do alvo, da hierarquia, dos guias e dos
vizinhos pertinentes. A pessoa escolhe apenas o provider, o modelo e a chave.

## Envio, validação e gravação

O botão de envio executa uma única intenção. O AraLearn:

1. congela a seleção, o conteúdo e a revisão lidos;
2. monta o contexto delimitado;
3. solicita uma saída estruturada ao serviço configurado;
4. converte a resposta para o contrato canônico e a valida localmente quanto a
   schema, semântica, referências e limites do escopo;
5. confirma toda a mudança em uma única transação com compare-and-swap;
6. mostra imediatamente o conteúdo resultante.

A validação e a gravação atômica são garantias internas, não etapas adicionais
impostas à pessoa. Uma resposta inválida ou uma revisão desatualizada não
produz alteração parcial.

Somente a última mudança concluída conserva um **Desfazer** local. Ele guarda
uma inversa estrutural compacta apenas dos campos, itens e ordem alterados,
nunca uma cópia da lição ou do curso, e não é enviado ao Supabase. Uma nova
mudança o substitui; uma escrita real posterior ou uma atualização remota do
mesmo curso o invalida quando já não representa o estado corrente. A fila de
sincronização não é apagada. A inversa também preserva entidades remotas novas,
como defesa adicional contra concorrência. Não se cria um histórico de cópias
do curso.

O conteúdo é salvo primeiro neste dispositivo e a atualização remota é
tentada em seguida. Se ela precisar ser adiada, o AraLearn mantém os caminhos
pendentes, mostra que a alteração ainda não chegou ao curso remoto e tenta de
novo ao recuperar a conexão. Essa fila não guarda pedido, resposta nem contexto
da conversa.

Uma saída estruturada inválida pode receber uma única tentativa orientada de
correção. A chamada inicial admite no máximo uma repetição de transporte para
falha transitória; a reconstrução usa uma única chamada HTTP. Assim, uma fase
tem teto de três chamadas HTTP mesmo quando transporte e estrutura falham em
sequência. Cota esgotada, autenticação, timeout, resposta interrompida e outros
erros determinísticos não são repetidos. A persistência só acontece depois da
resposta final válida, portanto uma repetição do serviço não duplica a escrita.

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
Gemini 3.5 Flash-Lite e o bridge local. Esses são os presets correntes do
AraLearn e acompanham os modelos documentados pelo
[DeepSeek](https://api-docs.deepseek.com/quick_start/pricing/) e pelo
[Gemini](https://ai.google.dev/gemini-api/docs/latest-model). Modelos já
encerrados não permanecem como opções.
Nenhum provider é escolhido silenciosamente: a pessoa faz uma seleção antes do
primeiro envio. Os presets DeepSeek V4 usam o adaptador compatível com a API do
DeepSeek; os presets Gemini 3.6 e 3.5 usam o adaptador oficial do Gemini. Ambos
entregam a resposta ao mesmo validador canônico local. No Gemini, o pedido
estruturado usa `responseMimeType` e `responseJsonSchema` no `generateContent`;
não há troca silenciosa para resposta livre quando o schema é recusado.

A opção **Outro modelo** aceita três protocolos:

- **Compatível com OpenAI:** requer modelo, chave e URL HTTPS completa de Chat
  Completions com saída JSON estruturada; o endpoint oficial
  `https://api.openai.com/v1/responses` usa Structured Outputs estrito;
- **Gemini:** requer modelo e chave e usa a API oficial do Gemini;
- **Bridge local:** requer modelo e endereço do bridge. HTTP só é aceito em
  `localhost`, `127.0.0.1` ou no endereço local IPv6; endereços externos
  precisam de HTTPS.

A chave fica apenas na memória da página e é limpa ao trocar de família de
provider, para que uma credencial do DeepSeek nunca seja enviada ao Gemini, ou
vice-versa.

### Escolha atual do DeepSeek

O preset recomendado para o bottom-up é `deepseek-v4-flash`, atualmente
associado pelo serviço ao DeepSeek-V4-Flash-0731. A documentação oficial lhe
atribui contexto de 1 milhão de tokens, JSON Output e desempenho próximo do
Pro em tarefas agentivas simples, com menor latência, maior concorrência e
custo substancialmente menor. O AraLearn mantém seu próprio recorte de 64 mil
caracteres: a janela maior do modelo não é justificativa para enviar o curso
inteiro.

`deepseek-v4-pro` continua disponível como escolha explícita para um reparo
atipicamente difícil. Ele nunca é acionado como fallback, porque isso tornaria
custo e comportamento imprevisíveis. `deepseek-chat`, `deepseek-reasoner` e
aliases locais antigos são recusados antes da chamada: os dois primeiros foram
[retirados da API](https://api-docs.deepseek.com/news/news260424/).

O caminho de produção usa Chat Completions, `thinking` desativado e
`response_format: {"type":"json_object"}`. O prompt contém a amostra JSON
sintática exigida pelo provider e o schema exato; em seguida, o AraLearn valida
esse schema e todas as regras de autoridade localmente. A
[Responses API](https://api-docs.deepseek.com/guides/responses_api) foi
comparada com esse caminho, mas não é fallback: no ensaio integral ela gastou
mais raciocínio, teve latência muito maior e interrompeu uma fase pelo teto de
saída, enquanto Chat Completions concluiu as dez operações. Essa escolha pode
ser reavaliada quando o comportamento documentado e os testes reais mudarem.

### Validação real econômica do DeepSeek

Desenvolvimento e manutenção dispõem de uma bateria real explícita, que nunca é
executada por `npm test` nem durante build ou publicação:

```powershell
$env:DEEPSEEK_API_KEY = "<chave temporária>"
npm run smoke:deepseek:bottom-up:real
```

Para reiterar somente o recorte que falhou, sem pagar novamente pelos demais,
defina também `DEEPSEEK_SMOKE_SCENARIO`. Os identificadores aceitos são:
`single_resource_readonly_boundary`, `multiple_resources_readonly_boundary`,
`whole_card_identity_boundary`, `multiple_cards_atomic_readonly_boundary`,
`create_one_card_in_microsequence` e
`create_one_microsequence_in_empty_lesson`.

O modelo padrão é `deepseek-v4-flash`; `DEEPSEEK_MODEL` aceita também
`deepseek-v4-pro`. A bateria usa somente fixtures sintéticas e cobre um
resource, vários resources, card inteiro, dois cards com aplicação atômica,
criação de card na única microssequência selecionada pela lição e criação de
microssequência em lição vazia.
Os cenários incluem sentinelas e instruções não confiáveis no contexto somente
leitura. Depois de cada resposta, o harness prova por diff que somente os
caminhos autorizados mudaram, confere identidade, posição e destino, valida o
contrato v4 e realiza o round-trip relacional.

Há um teto não ampliável de 24 chamadas HTTP para a execução completa. Sem
reconstruções, os seis cenários usam 19. O relatório ignorado pelo Git em
`tests/reports/deepseek-bottom-up-real.json` contém somente contagens, tokens e
fases; não registra chave, prompt, resposta nem conteúdo do curso. A chave deve
ser temporária e removida do ambiente depois do teste.

Na execução de referência de 7 de agosto de 2026, o V4 Flash concluiu os seis
cenários nas 19 chamadas iniciais, sem reconstrução: 39.712 tokens de entrada e
876 de saída. Pelos preços vigentes naquele dia e sem cache hit, o custo
estimado foi de aproximadamente US$ 0,0058.

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
