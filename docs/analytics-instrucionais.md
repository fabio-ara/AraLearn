# Dados de autoria

A área **Dados de autoria** permite inspecionar a distribuição do conteúdo e as
intervenções registradas na autoria. Por exemplo, uma concentração de ideias
novas numa unidade pode indicar um ponto a reler: a explicação pode precisar
de outra organização ou reunir relações que fazem sentido juntas. O número
localiza o trecho; a leitura permite avaliar a decisão.

Os dados descrevem o curso salvo. Quando o software usa uma declaração da
autoria, como “esta unidade introduz uma ideia”, ele conserva essa origem.
Quando conta palavras ou componentes, mede propriedades do conteúdo. Essa
distinção identifica a base de cada resultado: uma escolha registrada ou uma
característica que o sistema consegue contar.

## Como consultar

1. Abra um curso próprio em **Autoria**.
2. Entre em **Dados de autoria**.
3. A entrada mostra **Novidade declarada**, com distribuição por unidade.
4. Use **Escolher dimensão e escopo** para mudar a propriedade observada ou
   selecionar um recorte, do curso inteiro a uma unidade de estudo.
5. Abra uma faixa da distribuição para inspecionar as unidades por seus títulos.
6. **Abrir dados e definições** revela a configuração solicitada, os dados
   aplicados e as intervenções explícitas.

O seletor identifica cada recorte pelo nome. Uma **microssequência** reúne
unidades que desenvolvem um objetivo delimitado no percurso. Uma **parte**
agrupa microssequências para produção, e um **lote** pode reunir partes
sucessivas. Partes e lotes coordenam o trabalho de autoria, preservando os
níveis do [mapa curricular](modelo-didatico.md).

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

A **configuração aplicada** registra as escolhas usadas na produção de uma
unidade. A tabela usa as doze definições do catálogo 1.2.1 e mostra os valores
preservados nessa produção. O [catálogo de parâmetros](desenho-instrucional-parametrizado.md#catálogo-corrente)
explica cada decisão e seu alcance.

As escolhas sobre novidade e formas de explicação orientam o desenvolvimento
do conteúdo. As de prática registram quantas oportunidades distintas são
exigidas por requisito e em quais dimensões devem variar. Alvos de palavras
orientam a extensão da unidade e da resposta do assistente, dois objetos
diferentes. As demais escolhas tratam da posição e distribuição da prática
e da organização da produção, inclusive partes, lotes e pausas.

No modo automático, o assistente escolhe e justifica um valor diante do
conteúdo e da tarefa. Esse ajuste é chamado de **calibração contextual**.
Enquanto a intenção automática ainda não recebeu um valor, ela fica fora da
configuração aplicada. Uma condição fixada para pesquisa permanece explícita
e tem prioridade. O registro de origem distingue essas escolhas; as regras
completas estão em [Preferências e configuração aplicada](parametros-de-autoria.md).

Quando unidades do mesmo escopo usam valores diferentes, a distribuição informa
quantas receberam cada valor, sua origem e as unidades em que foram aplicados.
Para a extensão observada, apresenta total, mínimo, mediana — o valor central
da distribuição —, média e máximo de palavras por unidade. Esses dados ajudam
a comparar o alvo de extensão com o conteúdo produzido.

A **direção editorial** é uma orientação de escrita, como desenvolver exemplos
antes da notação. Ela permanece separada dos parâmetros. Orientações de níveis
diferentes podem se acumular: uma unidade pode receber uma direção do curso e
outra da microssequência. Suas contagens podem, portanto, se sobrepor; cada
linha indica o alcance de uma orientação, e a soma pode exceder o número de
unidades do recorte.

Os alvos de palavras são referências flexíveis de extensão. A diferença entre
alvo e contagem observada indica onde inspecionar a organização do material;
a adequação depende de preservar o conhecimento e a prática necessários. O alvo
de resposta de autoria caracteriza o desenho configurado, enquanto a contagem
por unidade caracteriza o conteúdo salvo. Conversas ficam fora dessa medida,
pois o AraLearn não persiste sua transcrição em **Dados de autoria**.

### Conteúdo e representações

As tabelas relacionam:

- cada ideia acompanhada e suas introduções, usos e retomadas;
- a distribuição de novidades entre unidades;
- formas explicativas aplicadas;
- componentes e representações usados.

Aqui, “retomadas” conta aplicações explicativas de ideias que não foram
introduzidas na mesma unidade. Uma continuação do desenvolvimento também pode
entrar nesse cálculo, enquanto retomadas feitas apenas na prática podem ficar de
fora. A função didática depende, portanto, da inspeção do trecho e da sequência.
O [protocolo de análise](desenho-instrucional-parametrizado.md) oferece a
codificação mais detalhada.

Para comparar tetos diferentes de novidade, conserve os critérios de recorte
dos conhecimentos. O mesmo repertório pode ser distribuído por mais ou menos
unidades de estudo; reunir ideias independentes numa única unidade de análise
mudaria o inventário que serve de base à comparação.

### Prática e fontes

Um **requisito de evidência** declara o que uma prática precisa solicitar para
examinar um objetivo, como calcular um valor e interpretar seu significado.
Uma **âncora** localiza o trecho usado numa fonte, por exemplo por página ou
seção. O [guia de fontes](fontes-e-citacoes.md) explica essa localização e sua
relação com o conteúdo. As tabelas relacionam esses registros:

- oportunidades por requisito de evidência;
- oportunidades que exercitam cada dimensão de variação;
- fontes, âncoras e unidades relacionadas, agrupadas pelo papel de cada vínculo.

O número descreve as oportunidades oferecidas pelo curso. Uma solicitação
ligada a dois requisitos entra na contagem de cada um; somar essas linhas
produz o total de relações requisito–oportunidade, e não o número de
solicitações únicas.

## Autoria

A síntese mostra:

- observações humanas ainda abertas;
- parâmetros definidos explicitamente e ainda vigentes;
- unidades cuja última edição observável foi humana;
- intervenções editoriais humanas e de IA, quando o registro está disponível.

A tabela complementar informa observações criadas e resolvidas e agrupa unidades
pela origem de sua criação e última edição. A origem da edição identifica quem
alterou o material; a [declaração de revisão autoral](explicacao-e-revisao-humana.md)
registra, separadamente, que a pessoa afirma tê-lo inspecionado.

As **intervenções observadas** contam blocos consecutivos de edição pela mesma
origem em cada unidade. Duas gravações seguidas da IA formam um bloco; se uma
pessoa editar e a IA voltar a editar, a sequência registra duas intervenções
de IA e uma humana. O total agrega as unidades do recorte. Quando os registros
começaram depois da criação do material, a tela informa que o histórico anterior
é desconhecido. Quantidade de gravações, esforço e proporção de texto produzido
por cada origem exigem dados próprios.

Quando a origem corrente não pode ser atribuída com segurança, **Dados de
autoria** registra a ausência. Zero fica reservado a uma contagem conhecida.

## De onde vêm os números

**Dados de autoria** calcula uma leitura do estado salvo. Para isso, relaciona
o planejamento e a configuração ao conteúdo efetivamente produzido e aos seus
vínculos. Uma intervenção humana entra no cálculo quando o estado corrente
conserva uma origem explícita com significado estável.

A decisão histórica de desenho e a aplicação corrente ao conteúdo são distintas.
Editar apenas o título conserva a decisão e sua aplicação, sem atualizar a data.
Alterar materialmente os componentes de uma unidade retira seus mapeamentos da
análise corrente até uma nova aplicação validada; a decisão histórica permanece.
Assim, a análise volta a relacionar ideias e conteúdo a partir da versão revista.

Alterar somente os vínculos de fontes ou reordenar unidades dentro da mesma
microssequência preserva a aplicação instrucional. Essas mudanças afetam a base
usada pela inspeção de IA: a relação com as fontes e a ordem de estudo também
participam do parecer, que precisa acompanhar o estado atual.

O contrato técnico `aralearn.course-authoring-analytics.v4` contém curso e
escopo, desenho e autoria quantitativos, dados ausentes, base observada e
distribuições. O inventário planejado abrange o curso inteiro e inclui itens
ainda não aplicados. Enunciados e descrições permanecem literais, conservando
o recorte de cada conhecimento registrado pela autoria.

## Comparar

**Comparar cursos** revela uma seleção de cursos próprios e seus escopos. A
leitura confirma a revisão dos dois cursos. Os resultados apresentam a mesma
dimensão lado a lado; cada faixa abre as unidades correspondentes. O inventário
planejado, a configuração solicitada e a aplicada podem ser consultados
separadamente na folha de comparação.

Enunciados, descrições e metadados de fontes são confrontados literalmente,
preservando repetições. Identificadores diferentes em cópias são tratados como
identidades locais; o confronto usa os textos e seus valores. Avaliar a
equivalência pedagógica dos materiais exige também examinar suas relações,
tarefas e condições de uso.

A comparação usa os registros do curso. O protocolo de uma pesquisa define
se precisará também de conversas de autoria ou de observação da navegação e
como obterá esses dados.

## Exportar

**Exportar curso e análise** salva um arquivo JSON, formato de dados organizado
em campos e listas, com o conteúdo integral do curso e a leitura quantitativa
do escopo selecionado. Sob uma revisão identificada, o arquivo relaciona o
planejamento e a configuração ao conteúdo, às fontes e às declarações de revisão
disponíveis. A [referência técnica](dicionario-metricas-datasets.md#comparação-e-exportação)
detalha os campos. Se a revisão mudar enquanto as entidades são lidas, a
exportação falha inteira.

Documentos anexados e arquivos de áudio aparecem por suas referências lógicas,
sem os bytes dos arquivos. Dados da conta, estado pessoal de estudo, conversas
e credenciais ficam fora da exportação. Textos e metadados do curso, entretanto,
podem conter informações pessoais e precisam ser conferidos antes de
compartilhar o arquivo. O curso continua editável depois que a exportação é
criada; a pesquisa conserva separadamente os materiais e as condições necessários
à reprodução de seu protocolo.

## Limites de interpretação

**Dados de autoria** caracteriza o desenho instrucional e as intervenções
observáveis. Resultados sobre pessoas — como compreensão, retenção ou esforço —
exigem participantes, instrumentos e análise definidos no protocolo da
pesquisa. O [guia do pesquisador](guia-pesquisador.md) ajuda a relacionar cada
pergunta às evidências necessárias para respondê-la.
