# Assistência por modelo de linguagem

O AraLearn usa modelos de linguagem para apoiar decisões de autoria sem tratar
uma resposta provável como comando autorizado. A pessoa conversa, discute uma
proposta concreta e autoriza sua aplicação ao rascunho; gravar o resultado no
curso continua sendo uma decisão separada.

Um documento JSON bem formado ainda pode apontar para o alvo errado, violar um
contrato de componente ou produzir uma composição impossível de apresentar.
Por isso, forma, autorização, revisão, renderização e decisão humana fazem parte
do mesmo percurso.

## Três formas de assistência

O AraLearn oferece três integrações relacionadas, mas distintas:

- **Assistência por IA** aparece dentro da unidade, da microssequência e da
  lição e usa OpenAI, Gemini ou DeepSeek, escolhidos pela pessoa;
- **Model Context Protocol (MCP)** conecta um cliente compatível às ferramentas
  canônicas de curso;
- **Actions/OpenAPI** conecta um GPT personalizado às mesmas tarefas
  humanas projetadas como caminhos HTTP.

Os três caminhos chegam às mesmas regras de curso. Eles não compartilham
credencial, sessão ou protocolo. Perfil, acesso, ciclo de vida do
curso e manutenção continuam ações do aplicativo autenticado.

## A sessão de assistência por IA

Assistência por IA é uma sessão contextual, não uma chamada isolada para
substituir texto. O alvo é fixado ao abrir o modo, e a conversa progride assim:

1. a pessoa descreve o problema ou objetivo;
2. o modelo responde à discussão; uma explicação pode vir sem proposta de mudança;
3. a pessoa discute, corrige, discorda ou acrescenta condições;
4. quando houver uma mudança solicitada, a proposta incorpora as condições da conversa;
5. **Preparar prévia** gera e valida o resultado, sem alterar o rascunho;
6. **Original** e **Prévia** permitem conferir o conteúdo com o renderer de Estudo;
7. **Aplicar ao rascunho** aceita o resultado conferido; **Descartar prévia** o remove;
8. **Salvar proposta** grava o rascunho com a revisão original; **Descartar rascunho** restaura o original.

Fechar a sessão apaga mensagens, configuração e qualquer proposta ainda não
aplicada. Um resultado já aceito permanece no rascunho; a conversa não entra no
conteúdo do curso, no PostgreSQL, no IndexedDB nem nos recibos de escrita.

### Escopos de escrita

A sessão pode trabalhar com:

- composição e conteúdo da unidade de estudo;
- estrutura e conteúdo da microssequência didática;
- criação, remoção e reordenação de microssequências no escopo da lição.

O alvo corrente permanece visível durante edição e prévia. Uma proposta para
microssequência não recebe autoridade sobre outra microssequência; uma proposta
para lição não altera módulos, outras lições ou dados pessoais.

Edição focal, assistência e alterações estruturais são exclusivas do
proprietário, também quando ele estuda seu próprio curso. Receber acesso privado
ou abrir um curso público permite estudar e, com conta, registrar observações;
isso não concede edição nem cria uma cópia automaticamente. Cópias próprias
existentes continuam cursos independentes sob a autoridade de seu proprietário.

## Contexto enviado

O envelope inclui a instrução da pessoa, as mensagens da sessão, a proposta
corrente, o caminho didático e a composição necessária para
compreender o alvo.
Para a unidade, inclui os componentes e campos editáveis. Para a
microssequência, inclui sua ordem e suas unidades. Para a lição, inclui as
microssequências e o contexto curricular suficiente para criar, remover ou
reordenar sem perder relações.

O contexto é somente leitura. Identificadores de autorização, credenciais,
objetos de Storage e dados pessoais laterais não são enviados. O tamanho possui
orçamento explícito; se o recorte não couber com segurança, a interface explica
o limite em vez de truncar silenciosamente uma estrutura que seria necessária
à decisão.

O AraLearn envia o envelope diretamente ao provedor escolhido, que pode aplicar
seus próprios termos de tratamento. A revisão humana continua necessária mesmo
com a lista fechada, pois o próprio conteúdo educacional pode conter dado
pessoal ou informação sensível.

## Descoberta e geração de componentes

Quando a proposta usa componentes didáticos, o AraLearn reutiliza
`consultarComponentesDidaticos`. A sequência é obrigatória:

```text
conversar e propor → preparar prévia → descobrir → obter contratos exatos → gerar
→ validar → reparar de forma limitada → conferir → aplicar ao rascunho → salvar
```

A descoberta começa por famílias e intenção. O modelo recebe somente os
contratos dos componentes escolhidos, um por chamada, em vez de carregar o
catálogo inteiro. A composição gerada passa pela validação do pacote, pelas
relações internas e pelo renderer usado em Estudo.

Reparos são limitados a duas tentativas e recebem os erros estruturados da
validação anterior. Se a proposta continuar inválida, a sessão preserva o
conteúdo corrente e explica a falha. JSON válido ou uma reparação textual sem
prévia renderizável nunca constitui aceite.

## Aplicação ao rascunho e concorrência

Antes de alterar o rascunho, o AraLearn prepara a candidata, verifica-a com o
mesmo renderer da unidade estudável e aguarda **Aplicar ao rascunho**. Falha
de geração, validação ou renderização preserva o conteúdo corrente. Uma
candidata aceita e válida substitui somente o rascunho do alvo; a gravação é
uma operação separada.

Cada escrita informa a revisão esperada do curso e as versões focais
necessárias. Se outra sessão alterar o alvo entre leitura e gravação, o servidor
recusa a proposta. A candidata continua no rascunho para conferência ou descarte;
a revisão mais nova não substitui a revisão original do pedido. Atualizações de
fundo ficam suspensas durante a conversa e enquanto houver rascunho, evitando
substituir o trabalho local por conteúdo externo.

Um `requestId` estável permite recuperar o recibo de uma escrita quando a
resposta da rede se perde. Repetir a mesma identidade com conteúdo diferente é
conflito. Essa repetição segura não amplia o escopo confirmado.

Se a resposta da gravação se perder, salvar novamente confere o mesmo pedido.
Descartar nessa situação exige confirmação focal: remove o rascunho local,
mas não desfaz uma gravação que já possa ter sido concluída no curso.

## Provider remoto e credencial efêmera

A pessoa escolhe OpenAI, Gemini ou DeepSeek, informa o modelo quando necessário
e fornece a própria chave. A chave permanece apenas em memória durante a sessão,
segue somente no cabeçalho da chamada ao provider escolhido e não entra no
curso, PostgreSQL, IndexedDB, Storage, logs ou artefatos.

Sair, recarregar ou encerrar a superfície cancela a chamada pendente e apaga
provider, modelo, chave, conversa e qualquer candidata ainda não aplicada. Uma
alteração já aceita permanece no rascunho. Uma resposta tardia não pode reabrir
a sessão nem aplicar conteúdo. A interface normal não pede endpoint nem expõe
relay ou instruções de arquitetura.

A pessoa precisa revisar o recorte e os termos do provider. A permanência da
chave somente em memória não altera sua validade no serviço. Testes automatizados
usam respostas simuladas, sem custo; uma prova real exige credencial autorizada
e limite de consumo definido. Testes simulados não demonstram interoperabilidade
com a conta e o modelo de um serviço real.

## MCP e Actions

MCP e Actions expõem as mesmas tarefas humanas do catálogo compartilhado. Ele separa
leituras de escritas e distingue mapa curricular, produção em lotes,
materialização, configuração, observações, revisão, fontes e componentes.

O GPT localiza objetos por título, posição ou referência humana. A camada
confiável resolve identidades e concorrência. Assim, a conversa pode coordenar
uma mudança e um próximo passo sem transformar detalhes do banco em trabalho da
pessoa autora.

MCP usa OAuth 2.1 e descoberta de ferramentas. Actions projeta o mesmo catálogo
num OpenAPI com OAuth próprio. Os dois canais chegam ao mesmo curso e obedecem à
mesma autorização. A [Autoria por MCP](autoria-mcp.md) e o guia de [Autoria por
Actions](autoria-actions.md) desenvolvem as diferenças de transporte.

## Planejamento, fontes e revisão

O planejamento começa por um mapa curricular global de módulos, lições e
microssequências. O chat apresenta uma síntese, e o mapa inteiro permanece
inspecionável no AraLearn. A aprovação confirma apenas cobertura, organização,
ordem e ênfases que estavam visíveis; não confirma silenciosamente conteúdo
futuro.

Partes são lotes operacionais definidos depois do mapa. Para cada lote, o GPT
apresenta a progressão local, recebe eventuais correções substantivas e só então
materializa as unidades de estudo. Mudar a fronteira de uma parte não muda, por
si só, o currículo.

Antes de produzir, o GPT reúne configuração, fontes e repertório acumulado do
recorte. Ele diferencia ideias introduzidas, ideias estabelecidas apenas usadas
e retomadas deliberadas. A resposta coordenadora informa o resultado, abre o
destino pertinente e formula no máximo uma decisão seguinte.

A configuração vem do [catálogo de parâmetros](../src/domain/courseDesignParameters.js),
que define significado, unidade, limites e escopos de cada ajuste. Ela reúne
conteúdo, prática, conversa e cadência de produção. Os alvos de palavras e de
produção orientam o trabalho; não são licença para omitir conteúdo necessário.

Automático é uma intenção sem valor numérico implícito. Antes de materializar,
o GPT escolhe os valores ainda pendentes e registra o motivo conforme conteúdo,
função, público e planejamento. Fixações da autoria e condições de pesquisa
prevalecem; conflitos entre escopos precisam ser resolvidos antes da produção.
A aplicação conserva os valores e motivos daquela decisão. Alterar a
configuração corrente não reescreve essa evidência histórica.

Ao abrir o minichat, o aplicativo lê a configuração efetiva do foco pela mesma
revisão do conteúdo original. Ele não calcula herança nem preenche valores
pendentes. Se a revisão divergir, pede sincronização e reabertura; a leitura não
promove a revisão original do rascunho. A conversa recebe fixações, delegações,
motivos e conflitos. Uma proposta de edição não segue enquanto houver conflito
de configuração.

Os alvos de palavras por resposta de autoria e por unidade de estudo orientam a
extensão, mas não são limites e não autorizam esconder decisões ou comprimir
conteúdo necessário.

Fontes e âncoras ficam no curso vivo. Um arquivo anexado à conversa só se torna
fonte persistente quando essa intenção está clara. Em outra sessão, a
assistência pode localizar a fonte pelo título e reler suas âncoras; memória da
conversa e novo upload não substituem esse estado.

Uma revisão começa pelas observações abertas e inclui outras unidades quando a
mudança afeta progressão, pré-requisitos, exemplos, prática ou transições. O GPT
propõe um conjunto coerente, a pessoa decide, as correções são aplicadas e o
resultado volta a ser inspecionado.

## Limites de interpretação

Contratos podem demonstrar integridade técnica, autorização e correspondência
entre referências. Eles não demonstram verdade científica, qualidade global ou
aprendizagem. Recomendações de interação humano-IA ressaltam visibilidade,
controle e possibilidade de correção
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). Num estudo de
decisão assistida por IA, intervenções que forçavam reflexão reduziram
dependência excessiva, mas acrescentaram custo; esse resultado é situado e não
garante o mesmo efeito na autoria educacional
([Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)). No uso
educacional de modelos generativos, a responsabilidade factual e pedagógica permanece humana
([UNESCO (2023)](referencias.md#ref-unesco2023genai)).

Consulte [Criar cursos pelo chat](criar-cursos-pelo-chat.md) para o percurso
conversacional e [Fluxos, instruções e contratos](fluxos-prompts-e-contratos.md)
para a relação entre intenção, confirmação e escrita tipada.

<!-- referências locais: início -->

## Referências

- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance): Zana Buçinca; Maja Barbara Malaya; Krzysztof Z. Gajos (2021). **To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-Assisted Decision-Making.** *Proceedings of the ACM on Human-Computer Interaction*, 5(CSCW1), p. 1–21.
- [UNESCO (2023)](referencias.md#ref-unesco2023genai): UNESCO (2023). **Guidance for Generative AI in Education and Research.** UNESCO.

<!-- referências locais: fim -->
