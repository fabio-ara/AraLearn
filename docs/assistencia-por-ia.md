# Assistência por modelo de linguagem

O AraLearn usa modelos de linguagem para apoiar decisões de Autoria sem tratar
uma resposta provável como comando autorizado. A pessoa conversa, discute uma
proposta concreta e autoriza sua aplicação ao rascunho; gravar o resultado no
Curso continua sendo uma decisão separada.

Um documento JSON bem formado ainda pode apontar para o alvo errado, violar um
contrato de componente ou produzir uma composição impossível de apresentar.
Por isso, forma, autorização, revisão, renderização e decisão humana fazem parte
do mesmo percurso.

## Três formas de assistência

O AraLearn oferece três integrações relacionadas, mas distintas:

- **Assistência por IA** aparece dentro da Unidade, da Microssequência e da
  Lição e usa OpenAI, Gemini ou DeepSeek, escolhidos pela pessoa;
- **Model Context Protocol (MCP)** conecta um cliente compatível às ferramentas
  canônicas de Curso;
- **Actions/OpenAPI** conecta um GPT personalizado a seis operações canônicas
  e duas projeções HTTP dedicadas a itens do plano.

Os três caminhos chegam às mesmas regras de Curso. Eles não compartilham
credencial, sessão ou protocolo. Perfil, acesso, cópia pessoal, ciclo de vida do
Curso e Manutenção continuam ações do aplicativo autenticado.

## A sessão de Assistência por IA

Assistência por IA é uma sessão contextual, não uma chamada isolada para
substituir texto. O alvo é fixado ao abrir o modo, e a conversa progride assim:

1. a pessoa descreve o problema ou objetivo;
2. o modelo responde e sempre mantém uma proposta concreta de mudanças;
3. a pessoa discute, corrige, discorda ou acrescenta condições;
4. cada novo turno substitui a proposta corrente por outra que incorpora a
   conversa;
5. **Aceitar e aplicar** autoriza a geração tipada dessa proposta;
6. o AraLearn valida e renderiza o resultado antes de colocá-lo no rascunho;
7. uma ação separada salva o rascunho com a revisão esperada.

Fechar a sessão apaga mensagens, configuração e qualquer proposta ainda não
aplicada. Um resultado já aceito permanece no rascunho; a conversa não entra no
conteúdo do Curso, no PostgreSQL, no IndexedDB nem nos recibos de escrita.

### Escopos de escrita

A sessão pode trabalhar com:

- composição e conteúdo da **Unidade de estudo**;
- estrutura e conteúdo da **Microssequência didática**;
- criação, remoção e reordenação de Microssequências no escopo da **Lição**.

O alvo corrente permanece visível durante edição e prévia. Uma proposta para
Microssequência não recebe autoridade sobre outra Microssequência; uma proposta
para Lição não altera Módulos, outras Lições ou dados pessoais.

Para um Curso compartilhado, a edição focal de Unidade pode ser salva numa
cópia pessoal privada. O original, as Fontes, PDFs, Planejamento, progresso e
Observações não são copiados. Escritas estruturais de Microssequência e Lição
permanecem exclusivas do proprietário.

## Contexto enviado

O envelope inclui a instrução da pessoa, as mensagens da sessão, a proposta
corrente, o caminho didático, a revisão corrente e a composição necessária para
compreender o alvo.
Para a Unidade, inclui os componentes e campos editáveis. Para a
Microssequência, inclui sua ordem e suas Unidades. Para a Lição, inclui as
Microssequências e o contexto curricular suficiente para criar, remover ou
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
conversar e propor → aceitar → descobrir → obter contratos exatos → gerar
→ validar → reparar de forma limitada → aplicar ao rascunho
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

Antes de alterar o rascunho, o AraLearn exige o aceite explícito da proposta,
gera a candidata e a verifica com o mesmo renderer da Unidade estudável. Falha
de geração, validação ou renderização preserva o conteúdo corrente. Uma
candidata aceita e válida substitui somente o rascunho do alvo; a gravação é
uma operação separada.

Cada escrita informa a revisão esperada do Curso e as versões focais
necessárias. Se outra sessão alterar o alvo entre leitura e gravação, o servidor
recusa a proposta. A interface relê o estado e não reaplica silenciosamente uma
candidata antiga.

Um `requestId` estável permite recuperar o recibo de uma escrita quando a
resposta da rede se perde. Repetir a mesma identidade com conteúdo diferente é
conflito. Essa repetição segura não amplia o escopo confirmado.

## Provider remoto e credencial efêmera

A pessoa escolhe OpenAI, Gemini ou DeepSeek, informa o modelo quando necessário
e fornece a própria chave. A chave permanece apenas em memória durante a sessão,
segue somente no cabeçalho da chamada ao provider escolhido e não entra no
Curso, PostgreSQL, IndexedDB, Storage, logs ou artefatos.

Sair, recarregar ou encerrar a superfície cancela a chamada pendente e apaga
provider, modelo, chave, conversa e qualquer candidata ainda não aplicada. Uma
alteração já aceita permanece no rascunho. Uma resposta tardia não pode reabrir
a sessão nem aplicar conteúdo. A interface normal não pede endpoint nem expõe
relay ou instruções de arquitetura.

Chaves duradouras não devem ser usadas num cliente público. A pessoa precisa
revisar o recorte e os termos do provider a cada sessão; testes automatizados e
ensaios de desenvolvimento usam stubs determinísticos, nunca uma chamada paga.

## MCP e Actions

O MCP e Actions oferecem as mesmas seis funções de alto nível:

- localizar Cursos próprios;
- ler um recorte corrente;
- criar a raiz privada de um Curso;
- executar alterações autorais tipadas;
- manter um PDF entre as Fontes do Curso;
- descobrir, validar e visualizar componentes didáticos.

No MCP, essas funções aparecem como `listarCursos`, `lerCurso`, `criarCurso`,
`alterarCurso`, `incorporarPdfComoFonte` e `consultarComponentesDidaticos`.
Leituras especializadas usam vistas, como Planejamento, Fontes, Observações,
Auditoria, Variantes e Pesquisa. Escritas especializadas usam comandos fechados
de `alterarCurso`.

Actions publica as seis operações canônicas e duas projeções HTTP dedicadas a
itens do plano em uma descrição OpenAPI. Seu cliente OAuth é confidencial e
separado do principal OAuth do MCP.
A [Autoria por MCP](autoria-mcp.md) documenta o primeiro canal; [GPT
personalizado com Actions](autoria-actions.md) documenta o segundo.

## Planejamento, Fontes e revisão

Planejamento por Partes é persistido e editável. Cada etapa de materialização
confirma composição, aplicação de parâmetros e proveniência numa operação
retomável. A conversa não pode declarar uma etapa concluída sem o recibo do
servidor.

Fontes possuem revisões e Âncoras exatas. URLs temporárias de PDF e o texto
integral de Observações só são enviados ao cliente conectado depois de uma
solicitação explícita. Uma citação torna a origem localizável; não garante a
verdade da afirmação nem a qualidade da Fonte.

Um arquivo anexado à conversa só se torna Fonte persistente quando sua função
no Curso é clara ou confirmada. Uma vez incorporado, ele pertence ao Curso vivo
e não depende da sessão anterior; uso declarado como temporário permanece fora
das Fontes.

Em outra sessão, a assistência retoma essas Fontes a partir do Curso vivo,
resume referências e localizadores humanos e abre somente o PDF necessário à
verificação focal. A memória da conversa e um novo upload não substituem essa
base persistente.

Na Auditoria, contexto, achado, proposta, aplicação, verificação e reversão são
estados distintos. Uma correção focal preserva o restante da estrutura e exige
confirmação. Pesquisa e Variantes apresentam fatos e diferenças, sem converter
contagens em conclusão causal.

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

Consulte [Criar Cursos pelo chat](criar-cursos-pelo-chat.md) para o percurso
conversacional e [Fluxos, instruções e contratos](fluxos-prompts-e-contratos.md)
para a relação entre intenção, confirmação e escrita tipada.

<!-- referências locais: início -->

## Referências

- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance): Zana Buçinca; Maja Barbara Malaya; Krzysztof Z. Gajos (2021). **To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-Assisted Decision-Making.** *Proceedings of the ACM on Human-Computer Interaction*, 5(CSCW1), p. 1–21.
- [UNESCO (2023)](referencias.md#ref-unesco2023genai): UNESCO (2023). **Guidance for Generative AI in Education and Research.** UNESCO.

<!-- referências locais: fim -->
