# Analytics da autoria

A área **Dados de autoria** permite inspecionar a distribuição do conteúdo e as
intervenções registradas na autoria. Por exemplo, uma concentração de ideias
novas numa unidade pode indicar um ponto a reler: a explicação pode precisar
de outra organização ou reunir relações que fazem sentido juntas. O número
localiza o trecho; a leitura permite avaliar a decisão.

Os dados descrevem o curso salvo. Quando o software usa uma declaração da
autoria, como “esta unidade introduz uma ideia”, ele conserva essa origem.
Quando conta palavras ou componentes, mede propriedades do conteúdo. Essa
diferença é necessária para interpretar os resultados sem atribuir ao estudante
um conhecimento ou comportamento que não foi observado.

## Como consultar

1. Abra um curso próprio em **Autoria**.
2. Entre em **Dados de autoria**.
3. A entrada mostra **Novidade declarada**, com distribuição por unidade.
4. Use **Escolher dimensão e escopo** para mudar a propriedade observada ou
   selecionar curso, parte, microssequência ou unidade de estudo.
5. Abra uma faixa da distribuição para inspecionar as unidades por seus títulos.
6. **Abrir dados e definições** revela a configuração solicitada, os dados
   aplicados e as intervenções explícitas.

O seletor identifica cada recorte pelo nome. Uma parte agrupa trabalho de
produção; um lote pode reunir partes sucessivas. Esses recortes de autoria não
acrescentam níveis ao [mapa curricular](modelo-didatico.md).

## Desenho

A síntese apresenta:

- unidades de estudo no escopo;
- unidades de análise, recortes de conhecimento como ideias ou relações
  acompanhadas no planejamento;
- oportunidades de prática;
- fontes relacionadas.

Uma relação pode ser desenvolvida ao longo de várias unidades de estudo.
Ela é introduzida uma vez e utilizada ou retomada depois. O
[protocolo de análise instrucional](desenho-instrucional-parametrizado.md#protocolo-de-unidade-de-análise)
explica como esses recortes são identificados.

### Configuração aplicada

A configuração aplicada registra as escolhas usadas na produção de uma unidade.
A tabela usa as doze definições do catálogo 1.2.1 e mostra os valores preservados
nessa produção. O [catálogo de parâmetros](desenho-instrucional-parametrizado.md#catálogo-corrente)
explica cada decisão e seu alcance. As primeiras quatro organizam o desenvolvimento da explicação e a prática:

- teto de ideias novas por unidade expositiva;
- formas de explicação requeridas;
- mínimo de oportunidades distintas de prática por requisito;
- dimensões de variação requeridas para a prática.

Duas definições são alvos editoriais quantitativos flexíveis:

- palavras por resposta de autoria;
- palavras por unidade de estudo.

As demais orientam distribuição e posição das práticas, granularidade de parte
e lote, frequência de pausa e preferência da conversa. Parte, lote e pausa têm
escopo de curso. Os grupos seguem o catálogo canônico: explicações, prática,
leitura e estilo, produção e conversa. Uma intenção automática ainda sem valor
não é tratada como escolha aplicada.

Quando unidades do mesmo escopo usam valores diferentes, a distribuição informa
quantas receberam cada valor, sua origem — calibração contextual, decisão da
pessoa autora ou condição de pesquisa —, o escopo e as unidades em que foram
aplicados. Direção editorial permanece separada. Para o conteúdo, a extensão
observada informa total, mínimo, mediana, média e máximo de palavras por
unidade, o que permite comparar alvo e resultado sem tratar a diferença como
erro automático.

A **direção editorial** é uma orientação de escrita, como desenvolver exemplos
antes da notação. Orientações de níveis diferentes podem se acumular. Uma mesma
unidade pode receber, por exemplo, uma direção do curso e outra da
microssequência. Portanto, suas contagens podem se sobrepor e não formam uma
partição das unidades do recorte.

No modo automático, a autoria escolhe e justifica um valor diante da tarefa.
Uma condição fixada para pesquisa permanece explícita e tem prioridade. O
registro de origem permite distinguir essas escolhas; as regras completas
estão em [Preferências e configuração aplicada](parametros-de-autoria.md).

Os alvos de palavras não são mínimos ou máximos, não medem qualidade e não
autorizam comprimir conhecimento, ocultar decisões ou fragmentar unidades. A
distribuição observada descreve o artefato produzido; não julga sua adequação.
O alvo de resposta de autoria caracteriza o desenho configurado. Ele não é
tratado como medida de uma conversa observada: o AraLearn não persiste
transcrição para Analytics.

### Conteúdo e representações

As tabelas relacionam:

- cada ideia acompanhada e suas introduções, usos e retomadas;
- a distribuição de novidades entre unidades;
- formas explicativas aplicadas;
- componentes e representações usados.

“Retomadas” tem aqui um cálculo restrito: aplicações explicativas de ideias não
introduzidas na mesma unidade. A contagem pode incluir continuação do
desenvolvimento, sem demonstrar reativação intencional; também não detecta toda
retomada realizada em uma prática. Para interpretar a função didática, é preciso
inspecionar o trecho e a sequência. Esse agregado não substitui a codificação
mais detalhada do [protocolo de análise](desenho-instrucional-parametrizado.md).

Comparar tetos diferentes não autoriza agrupar ideias independentes numa unidade
de análise maior. O repertório pode permanecer igual enquanto sua distribuição
entre unidades muda.

### Prática e fontes

Um **requisito de evidência** declara o que uma prática precisa solicitar para
examinar um objetivo, como calcular um valor e justificar sua interpretação.
A **âncora** de uma fonte localiza o trecho usado, por exemplo por página ou
seção. As tabelas relacionam esses registros ao conteúdo:

- oportunidades por requisito de evidência;
- oportunidades que exercitam cada dimensão de variação;
- fontes, âncoras e unidades relacionadas, agrupadas pelo papel de cada vínculo.

Contar uma oportunidade não demonstra que alguém aprendeu. O número informa
apenas que o artefato oferece aquela prática.
Uma solicitação ligada a dois requisitos entra na contagem de cada um; somar
essas linhas não produz o número de solicitações únicas do curso.

## Autoria

A síntese mostra:

- observações humanas ainda abertas;
- parâmetros definidos explicitamente e ainda vigentes;
- unidades cuja última revisão observável foi manual.

A tabela complementar informa observações criadas e resolvidas e agrupa unidades
pela origem de sua criação e última revisão. Essas contagens não formam
percentual de autoria nem pontuação de colaboração. Ausência de intervenção
registrada não significa concordância.

Quando a origem corrente não pode ser atribuída com segurança, Analytics a
mantém ausente; não converte desconhecimento em zero nem reconstrói uma história
por inferência.

## De onde vêm os números

Analytics calcula uma leitura do estado salvo a partir da estrutura, do
planejamento, da configuração, das unidades e de seus vínculos com componentes,
fontes, âncoras e observações. Intervenções humanas entram apenas quando o estado
corrente conserva origem explícita com significado estável.

A decisão histórica de desenho e a aplicação semântica corrente são distintas.
Editar apenas o título conserva ambas sem atualizar a data da decisão. Alterar
o conteúdo ou a posição na estrutura conserva a decisão histórica, mas retira
os mapeamentos anteriores da análise corrente até uma nova aplicação validada.
Essa ausência é informada; não se deduz que o conteúdo novo conserva as mesmas
ideias somente porque usa os mesmos componentes.

O contrato técnico `aralearn.course-authoring-analytics.v4` contém curso e
escopo, desenho e autoria quantitativos, dados ausentes, base observada e
distribuições. O inventário planejado abrange o curso inteiro e inclui itens
ainda não aplicados. Enunciados e descrições permanecem literais; a leitura não
reinterpreta uma ideia para fazê-la caber em um limite numérico.

## Comparar

**Comparar cursos** revela uma seleção de cursos próprios e seus escopos. A
leitura confirma a revisão dos dois cursos. Os resultados apresentam a mesma
dimensão lado a lado; cada faixa abre as unidades correspondentes. O inventário
planejado, a configuração solicitada e a aplicada podem ser consultados
separadamente na folha de comparação.

Enunciados, descrições e metadados de fontes são confrontados literalmente,
preservando repetições. Identidades diferentes em cópias não bastam para
caracterizar mudança de conteúdo. Textos iguais tampouco comprovam equivalência
semântica ou qualidade: a decisão pedagógica continua exigindo inspeção.

A comparação usa os registros do curso; conversas e eventos de navegação não
integram essa base.

## Exportar

**Exportar curso e análise** salva um arquivo JSON, formato de dados organizado
em campos e listas, com o
conteúdo integral do curso e a leitura quantitativa do escopo selecionado.
Inclui configuração solicitada e aplicada, inventário planejado, declarações e
contagens, sempre com curso e revisão identificados. Conserva também as
explicações, os vínculos com suas fontes, a base aplicada às unidades e as
declarações de revisão disponíveis. A
[referência técnica](dicionario-metricas-datasets.md#comparação-e-exportação)
detalha esses registros. A exportação falha inteira
se a revisão mudar enquanto as entidades são lidas.

Os arquivos PDF e áudio não são incorporados: permanecem suas referências
lógicas. O arquivo também não inclui pessoas, progresso pessoal, credenciais
ou conversas. Guardar esse artefato não cria uma versão imutável dentro do
curso; uma investigação deve conservar separadamente os materiais e as
condições necessários à reprodução de seu protocolo.

## Limites de interpretação

Analytics caracteriza o desenho instrucional e intervenções observáveis. Não
mede compreensão, retenção, transferência, atenção, esforço, dificuldade ou
qualidade global. Esses resultados exigem pergunta, população, instrumento,
tratamento de dados ausentes e análise definidos no protocolo da pesquisa.

Consulte o [Guia do pesquisador](guia-pesquisador.md) para formular perguntas e
registrar limites de inferência.
