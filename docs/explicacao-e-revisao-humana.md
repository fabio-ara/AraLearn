# Explicação e revisão humana

## Estatuto e problema

Este documento reúne o contrato pedagógico e funcional e o estado de sua
implementação. A candidata local já estende conteúdo, fontes, materialização,
correção, exportação e cliente de revisão. O armazenamento e a autorização são
verificados no PostgreSQL local. Um ensaio com o executor de autoria e HTTP
PostgREST confirmou duas Explicações, materialização, rematerialização, fontes,
exportação e correção focal. Ele usa dados sintéticos e não é prova dos clientes
ChatGPT MCP/Actions. A interface de Explicação já integra a candidata local:
ícone no Estudo, leitura compartilhada, fontes no mesmo overlay e ferramentas
do catálogo existente. A decisão humana na Autoria pertence à etapa seguinte;
o serviço publicado conserva a versão anterior. Testes sintéticos não certificam aprendizagem nem transformam
um rascunho real em conteúdo aprovado.

Uma unidade pode ficar longa ao tentar explicar todos os pressupostos de uma
tarefa. Encurtá-la sem preservar essas relações pode deixá-la incompreensível.
A decisão é manter no percurso unidades substantivas e práticas, com acesso
imediato a uma **Explicação** previamente autorada por microssequência.
Quem precisa encontra o desenvolvimento; quem já compreende pode continuar.

“Explicação instrucional sob demanda” é a denominação operacional provisória
para pesquisa. Não se afirma que seja um construto canônico nem que corresponda
integralmente a uma intervenção descrita na literatura. Microssequência e unidade
de análise conservam os limites operacionais do [modelo didático](modelo-didatico.md).

## Responsabilidades pedagógicas

| Objeto | Responsabilidade |
| --- | --- |
| Mapa e microssequência | Objetivo, dependências, escopo e proposta da Explicação: propósito, pressupostos a desenvolver, relações e fontes previstas. |
| Unidade de estudo | Uma ação didática inteligível; introduções, usos e retomadas de ideias; cobertura; tarefa e feedback quando cabíveis. |
| Explicação | Desenvolver os conceitos, pressupostos, exemplos, relações e limites necessários ao objetivo, com leitura seletiva e fontes recuperáveis. |
| Pessoa autora | Inspecionar conteúdo e fontes, corrigir e aprovar explicitamente o conjunto que examinou. |
| Estudante | Consultar, praticar e retomar. Abrir ou ler o apoio não demonstra domínio nem conclui uma unidade. |

Há uma instância corrente de Explicação por microssequência, acessada por todas
as suas unidades, inclusive práticas. Ela não acrescenta nível curricular,
versão fácil/difícil nem percurso paralelo. Produzir a parte entrega unidades e
apoio real coerentes; abrir o apoio apenas lê o conteúdo salvo, sem geração por IA.

O card precisa conter uma relação, explicação ou tarefa que faça sentido. “Leia
a Explicação” não substitui ensino. A relação que será cobrada permanece no
percurso; o apoio pode desenvolvê-la e explicitar seus pressupostos com maior
profundidade. A suficiência para novatos é examinada no conjunto unidades +
Explicação acessível: termos e símbolos da tarefa precisam ter um caminho
compreensível até definição, exemplo e aplicação. Para o experiente, consultar
o apoio é opcional e não altera a exigência da prática.

Compactação significa reduzir informação simultânea e metadiscurso, preservando
relações necessárias. Não autoriza truncamento, fonte menor, siglas sem contexto,
texto telegráfico ou manipulação da granularidade das ideias. “Compare os dois
pontos de conexão” é orientação sobre o conhecimento; “usaremos isso em outra
parte do curso” é informação de organização que não precisa ocupar o corpo.

### Parâmetros e declarações de aplicação

Os parâmetros existentes e seus escopos continuam regulando o percurso. O catálogo
versionado contém doze definições: as seis de conteúdo, prática e extensão
inicialmente descritas, mais distribuição e posição da prática, três preferências
de cadência e interação na conversa. A contagem de seis no contrato inicial era
incompleta; a Explicação não acrescenta parâmetros nem remove essas preferências.
Não há novo alvo de palavras, teto de ideias ou nível de dificuldade para o
overlay. O alvo editorial da unidade continua flexível e se refere à unidade,
não à soma oculta de unidade e apoio.

**Explicação**, objeto compartilhado, é diferente das **formas de explicação**
declaradas nas aplicações pedagógicas. Uma forma só é declarada como desenvolvida
numa unidade se há conteúdo correspondente nela. A presença da forma apenas no
apoio não pode satisfazer silenciosamente a declaração dessa unidade. Se a
configuração exige formas adicionais no percurso, elas podem ser distribuídas
em unidades coerentes; a cardinalidade técnica não obriga condensá-las num card.

Introdução continua sendo a primeira apresentação instrucional registrada de
uma ideia no percurso; uso mobiliza uma ideia estabelecida; retomada é derivada
do desenvolvimento explicativo de uma ideia já introduzida. Elaborar um
pressuposto no apoio não cria nova introdução, cobertura cumprida, oportunidade
de prática ou aprendizagem creditada. Uma lacuna curricular descoberta nessa
elaboração exige decisão autoral no mapa e nas unidades, não contabilidade
paralela. Declarações validadas pelo schema continuam sendo declarações, não
auditoria semântica automática.

### Composição e fontes

O conteúdo pode ter seções como definição, mecanismo, exemplo e contraste,
conforme a tarefa. Elas são possibilidades de composição, não formulário
universal. Reutiliza os componentes e o renderer comuns: tabela para comparar,
diagrama para mostrar relações, código para um procedimento e prosa para
explicar significados. A representação precisa de descrição acessível e deve
servir à operação. Ferramentas interativas já existentes continuam no sistema
atual; a Explicação não ganha um segundo catálogo de ferramentas.

Chamadas numeradas ligam a afirmação à referência e à localização pertinente.
O sistema existente de fontes, âncoras, atribuições, bibliografia e acesso é
estendido ao apoio. O estudante consegue consultar fontes do card mesmo sem
abrir a Explicação; não é necessário repetir a bibliografia inteira no card.
Ao sair de uma referência, retorna ao trecho que a acionou.

O papel da fonte deve estar claro: delimitação de escopo, fundamento técnico,
evidência, adaptação ou citação. Interpretação autoral e hipótese não recebem o
estatuto da fonte por proximidade. Cadastrar URL não significa ler, conferir ou
aprovar. Fonte fechada ou indisponível conserva referência e limite de acesso;
o conteúdo necessário à tarefa precisa ser explicado sem exigir acesso que o
estudante não tem. Não persistir endereços assinados nem reproduzir obras além
dos direitos disponíveis. Ver [Fontes e citações](fontes-e-citacoes.md).

## Dados, produção e revisão

A menor extensão usa a microssequência corrente já existente como proprietária
do apoio. A unidade o resolve pela relação com sua microssequência; não recebe
uma cópia do texto. O contrato lógico é o seguinte; nomes físicos e migrações
serão definidos na implementação correspondente.

| Informação | Local e regra |
| --- | --- |
| Proposta | Na microssequência do mapa: propósito, pressupostos, relações e referências previstas. Pode existir antes do texto. |
| Conteúdo | Na microssequência corrente: título e blocos do catálogo comum, com identidades estáveis para localização. Ausência é representada explicitamente. |
| Fontes | No sistema de atribuições atual, acrescentando um alvo do apoio identificado pela microssequência e, quando necessário, pelo bloco. Sem catálogo bibliográfico duplicado. |
| Revisão | Metadados protegidos do conjunto da microssequência: situação, pessoa revisora, data e impressão do conteúdo inspecionado. Não ficam no JSON de conteúdo livre. |
| Consistência | Revisão/CAS, recibos e identidade interna de escrita existentes; validação de autorização e releitura antes de repetir escrita incerta. |

O apoio é conteúdo, sem resposta própria, conclusão ou progresso. Na produção,
unidades, apoio, aplicações e vínculos da parte são validados antes de um commit
coerente. Produção incompleta não pode deixar uma Explicação nova associada
silenciosamente a unidades antigas. A projeção de revisão ao estudante informa
situação e data pertinentes, sem identificadores privados da pessoa revisora.

A impressão de revisão abrange objetivo e proposta relevantes, unidades ordenadas,
apoio, respostas/feedback, aplicações pedagógicas e as versões materiais das
fontes/âncoras/atribuições usadas. Não é uma nova árvore de versões. O curso
corrente continua a autoridade; o metadado de aprovação não guarda um segundo
curso nem o histórico integral de texto.

### Ciclo autoral

Na representação corrente, a microssequência pode conter `explanationPlan`
(propósito, pressupostos, relações e referências das fontes previstas) e
`explanation` (título e componentes de conteúdo do catálogo). Ambos permanecem
distintos das unidades. A materialização exige uma Explicação por microssequência
da parte e grava apoio, unidades, aplicações e fontes na mesma transação.
Uma correção focal pode alterar apenas o apoio ou incluí-lo junto às unidades;
omitir as fontes na correção conserva os vínculos existentes.

A situação protegida `contentReview` acompanha a leitura da entidade, fora de
seu conteúdo editável. A composição de um documento de curso conserva o apoio,
mas não transfere essa situação para uma importação. A exportação autoral inclui
uma leitura de proveniência por Explicação em `artifact.explanationSources`,
na mesma revisão do artefato; não duplica o apoio nas unidades nem concede
aprovação. As fontes previstas no mapa orientam a produção e não equivalem às
citações do conteúdo efetivamente produzido.

Em **Conteúdo**, a inspeção de uma unidade abre **Explicação e revisão do
conteúdo** para a microssequência inteira. A superfície reúne objetivo e proposta,
apoio, todas as unidades com respostas e feedback, bibliografia, localizações e
ocorrências citadas. A configuração solicitada e aplicada reutiliza os detalhes
da análise autoral. Atalhos de fontes abrem o painel existente para a Explicação
ou para uma unidade determinada; ali continuam a conferência das obras, âncoras,
ocorrências e o acesso autorizado aos anexos. Abrir a inspeção não registra
aprovação, resposta, progresso nem leitura efetiva pela pessoa.

**Editar Explicação** permite alterar os campos textuais editáveis dos componentes
já existentes, com prévia local, cancelamento e gravação manual. Não é geração
por IA nem um editor de JSON ou de novos componentes. Salvar preserva os demais
campos da microssequência e suas atribuições de fontes, registra a origem manual
e exige nova inspeção do conjunto alterado. A presença de um vínculo não garante
que ele continue adequado ao texto editado: a pessoa deve conferir a ocorrência
e seu fundamento. Ausência de apoio continua explícita.

A aprovação requer uma confirmação da pessoa proprietária após a apresentação
do recorte completo. A leitura remota é cercada por duas consultas à impressão
protegida; exportação e proveniência precisam pertencer à revisão solicitada.
Antes de enviar a decisão, a UI relê a impressão e o servidor verifica a mesma
base. Mudança concorrente impede usar conteúdo antigo para aprovar texto novo.
Depois do recibo, outra leitura distingue aprovação ainda atual, alteração
posterior e impossibilidade de conferir o estado corrente. A interface não
infere uma nova decisão a partir de um recibo antigo.

Uma resposta de gravação ou aprovação incerta mantém a identidade original do
pedido na conta local. A confirmação repete o mesmo pedido; não autoriza uma
segunda decisão com identidade nova. A gravação manual conserva também o texto
pendente. Escape ou tentativa de saída durante a edição preserva os campos e
pede conclusão ou cancelamento; depois de uma falha incerta é necessário
reconciliar o pedido. Fechar a inspeção concluída devolve o foco à origem.

O catálogo de tarefas passa a `3.0.0`: proposta do apoio no mapa e Explicações
na materialização são entradas obrigatórias. Permanecem 27 tarefas. Na candidata
local, o catálogo serializado ocupa 53.379 bytes UTF-8; o OpenAPI minificado,
44.976 bytes UTF-8 e 44.687 unidades UTF-16; a projeção formatada do editor,
96.369 unidades UTF-16. O gerador reutiliza referências de schema sem suprimir
campos. Os orçamentos de regressão do catálogo e do texto minificado foram
ajustados à extensão medida; o limite local de 98 mil caracteres do editor
permanece. Esses valores não medem uma chamada de materialização nem demonstram
descoberta ou execução do contrato por um cliente hospedado.

| Ação | Resultado e limite |
| --- | --- |
| Planejar | Proposta inspecionável. Aprovar o mapa aprova somente o que estava no mapa. |
| Produzir | Unidades e Explicação são gravadas coerentemente como rascunho. Mandato de produção e sucesso técnico não aprovam o conteúdo. |
| Inspecionar | Autoria mostra o conteúdo real, aplicações, fontes e pendências; a prévia de Estudo identifica que é rascunho. Não se presume leitura por ter aberto a tela. |
| Debater e corrigir | Debate externo usa recorte e canais existentes. Debate não escreve; aplicação autorizada grava e relê. Edição manual em Autoria não é assistência por IA. |
| Aprovar | A pessoa proprietária confirma o conjunto atual que inspecionou. A operação protegida registra autoria/data/impressão; validação automática não pode conceder esse estado. |
| Alterar materialmente | A aprovação afetada deixa de ser atual. O conjunto corrente passa a exigir revisão; não recebe aprovação do texto anterior. |

O comando de aprovação pertence à UI autenticada da pessoa proprietária. Importar,
materializar, corrigir via MCP/Actions ou enviar campos num conteúdo não pode
fabricar essa aprovação. A aprovação do conteúdo e a conferência individual de
uma fonte são fatos distintos; aprovar o conjunto não marca automaticamente
todas as fontes como conferidas. Pendências de fonte permanecem visíveis para
decisão humana, inclusive suas implicações para o material.

Os estados apresentados são **Revisão não registrada** para o acervo anterior,
**Rascunho** para produção nova ainda não aprovada, **Revisado nesta versão**
quando a decisão corresponde à base corrente e **Revisão não atual** quando
uma decisão anterior já não corresponde. Apoio apenas planejado, ausente ou
incompleto impede aprovar uma nova microssequência como pronta. Antes de aprovar,
a pessoa precisa resolver edições locais não salvas; a aplicação não as ignora.

Uma cópia independente ou importação preserva conteúdo, fontes e proveniência
úteis, mas não reaplica a aprovação da origem ao novo objeto. Um export pode
informar a situação de revisão de origem sem conceder autoridade de aprovação
na reimportação. Se a resposta da aprovação se perder, a identidade interna e
o replay recuperam somente a decisão original, sem ampliar seu alcance.

### Mudança material e concorrência

São materiais alterações de significado, objetivo, pressuposto, conteúdo,
ordem didática, resposta correta, feedback, componente/dados representados,
aplicação pedagógica, vínculo de fonte, localização citada, obra/edição ou
arquivo que sustenta a afirmação. A mudança numa fonte compartilhada afeta
somente os conjuntos que a utilizam, apurados pelas atribuições existentes.

Não são alterações do conteúdo: preferência local de tema/zoom, posição de
rolagem, estado de carregamento, progresso do estudante e renovação de URL
assinada para o mesmo objeto autorizado. Correções em prosa não são dispensadas
automaticamente por parecerem pequenas. Sem prova de equivalência estritamente
cosmética, é preciso rever o recorte. Alterar uma configuração para produção
futura não reescreve o texto nem falsifica a configuração selada anterior;
o produto mostra a diferença entre corrente e aplicada.

Com duas abas, a aprovação compara no servidor a impressão inspecionada com o
conjunto atual, sob o controle de concorrência existente. Se outra aba mudou
unidade, apoio ou fonte pertinente, recusa a aprovação obsoleta e oferece
releitura, preservando o rascunho local. Não faz rebase silencioso de uma
aprovação para outro texto. Uma alteração sem relação em outra microssequência
não invalida semanticamente esta revisão; a escrita ainda respeita a revisão
corrente do curso. Caso o controle de concorrência exija nova leitura, a UI
não apresenta isso como perda de todo o trabalho revisado.

### Distribuição e acervo anterior

Recortes novos sem aprovação atual ficam disponíveis à pessoa autora como
rascunho. Não são distribuídos como conteúdo aprovado para estudantes. Sem
manter versões editoriais paralelas no servidor, uma alteração material deixa
aquele recorte temporariamente indisponível para nova obtenção por estudantes
até nova aprovação. Isso deve ser informado antes de a pessoa aplicar a mudança.

Cópias locais já obtidas e progresso não são apagados ou substituídos pelo
rascunho. O cache atual é de curso por revisão: não misturar microssequências
de revisões diferentes sob um único número. Se atualizar retiraria um recorte
anterior por estar agora em rascunho, conservar a cópia íntegra anterior até
haver uma substituição elegível; a leitura online pode informar separadamente
os recortes indisponíveis. A cópia identifica sua revisão e, quando a diferença
for conhecida, informa que é anterior. A troca do curso é atômica e preserva
progresso. Offline não pode garantir revisão remota atual. O modo de
sincronização manual continua manual. Renovação de acesso a fontes respeita a
autorização corrente; conservar uma cópia não concede direitos adicionais.

A migração reconhece o acervo anterior sem inventar aprovação: leitura e
progresso existentes permanecem, com “Revisão não registrada” e, quando couber,
“Explicação não disponível”. Essa condição é marcada pelo corte confiável do
servidor, não por um campo que qualquer importação possa escolher. Uma edição
material posterior daquele recorte entra na regra de revisão; não remodela
automaticamente os demais. Não gerar, encurtar ou aprovar cursos antigos para
preencher lacunas durante a engenharia.

## Experiência e orçamento da fileira

No Estudo, a Explicação ocupa um ícone estável com nome acessível “Explicação”,
junto dos controles atuais, em teoria e prática. No acervo sem apoio, o mesmo
acesso explica honestamente a ausência, sem promessa de geração imediata.
Na Autoria, uma entrada contextual permite inspecionar proposta e conteúdo
da microssequência sem sair para um editor independente.

A base usa “Ver explicação” no nome acessível do botão que revela feedback
de uma prática. Com o novo apoio, esse rótulo deve identificar a operação da
resposta, como “Ver feedback da resposta”, conservando seu comportamento.
“Explicação” nomeia o apoio compartilhado; abri-lo não revela o gabarito da
prática atual nem aciona seu botão de continuar.

A base usa alvos de 44 × 44 px. No Estudo há cinco controles fixos: Fontes,
Observações, Rever, anterior e continuar. Com Explicação são seis. Reservando
intervalos de 4 px, seis alvos ocupam 284 px; com uma ferramenta variável,
sete alvos e seis intervalos ocupam 332 px. O cálculo não inclui margens
externas nem substitui inspeção visual.

Na menor largura de 360 px, a fileira precisa reservar ao menos 332 px úteis
para esses sete controles. Ferramentas variáveis múltiplas, inclusive áudio,
devem usar o agrupamento compacto já existente, com uma entrada descoberta
e rótulos no painel revelado. Não reduzir alvos, retirar Fontes/Observações/Rever
ou esconder a Explicação em menu profundo. Se a área útil for menor por zoom ou
viewport, admitir disposição recuperável em mais de uma linha, sem sobreposição
ou rolagem horizontal obrigatória de ações essenciais. Em Autoria, considerar
também os seis controles contextuais atuais e agrupar apenas ferramentas
variáveis, preservando visualizar, parâmetros, observações, fontes, visão
múltipla e edição.

O overlay deixa perceptível a unidade de origem, tem título e botão de fechar
alcançável, corpo rolável e foco contido enquanto aberto. Abrir não avança o
percurso, não envia resposta, não marca acerto e não altera “Rever”. Fechar por
botão ou Escape restaura acionador, posição e resposta pendente. Reabrir resolve
a mesma instância corrente; se a cópia mudou, a mudança é comunicada sem trocar
silenciosamente uma resposta em edição.

Fontes são reveladas preservando a âncora de retorno; não empilhar diálogos
inacessíveis. Avisos não cobrem controles ou foco. O apoio preparado acompanha
a cópia de estudo offline; link externo indisponível não impede ler seu texto.
Falta de Internet, serviço indisponível, carregamento, cópia anterior e conflito
continuam estados distintos.

### Limites de carga e prova prevista

O texto é transmitido uma vez por microssequência na materialização e na cópia
de estudo, não uma vez por unidade. Leituras contextuais e exportação devem
preservar literalidade e continuação até o fim, com o mesmo apoio/fontes/revisão.
O orçamento é de transporte, não um novo parâmetro pedagógico.

Na base, um caso sintético Actions com seis unidades e fontes enviou 16.130 bytes
e respondeu 516 bytes; houve persistência e exportação verificadas. Esse caso
não tinha a Explicação futura. Não se extrapola daí a capacidade do novo payload.
O servidor atual aplica um guarda anterior ao limite externo de 100.000
caracteres do Actions. Bytes UTF-8, unidades UTF-16, duração de geração,
tempo HTTP e tempo de execução são medidas distintas. Ver
[limites oficiais de Actions](https://developers.openai.com/api/docs/actions/production).

A implementação deve medir um pedido serializado representativo com unidades,
apoio e fontes reais de fixture; conferir schema, cliente, HTTP e persistência
separadamente; e exercitar dois lotes sucessivos em cada canal. Se uma parte
ficar grande, usar partes operacionais menores e microssequências coerentes,
sem duplicar apoio nem cortar texto silenciosamente. Não se define serviço
assíncrono, staging ou identificador humano de requisição por hipótese de timeout.
O diagnóstico do MCP encontrou divergência de validação do conector: o sucesso
do mesmo schema local ou do Actions não dispensa a prova MCP efetiva.

## Fundamentos e conjectura

A atualização focal consultou seis referências em 7 de setembro de 2026.
Encerrou-se ao obter uma fonte pertinente para cada decisão corrente, com
alcance de leitura e limite explícitos. Não foi revisão sistemática nem busca
exaustiva de publicações até aquela data. Nenhum dos seis artigos foi lido
integralmente nesta consulta; acesso a um PDF completo não equivale a leitura
integral. O registro de consultas integra o
[registro bibliográfico](evidence/registro-buscas-bibliograficas.csv).

| Referência e leitura efetiva | Papel e limite para este contrato |
| --- | --- |
| [Renkl (2002)](referencias.md#ref-renkl2002learning): resumo, introdução e trechos de método/discussão indexados pela editora; abertura direta indisponível. | Distingue explicações fornecidas de elaboração pelo aprendiz. Achados condicionais com exemplos não comprovam este overlay ou sua suficiência em redes. |
| [Koedinger e Aleven (2007)](referencias.md#ref-koedinger2007assistance): resumo e notas da editora. | O equilíbrio entre oferecer e retirar assistência permanece dependente das condições. Acesso voluntário não resolve por si a identificação da necessidade de ajuda. |
| [Kalyuga (2007)](referencias.md#ref-kalyuga2007expertisereversal): resumo e metadados da editora. | A utilidade de técnicas varia com o conhecimento prévio. Não fornece classificador de domínio nem permite inferi-lo pelo uso do botão. |
| [Rey et al. (2019)](referencias.md#ref-rey2019segmenting): resumo e metadados da editora. | A síntese de segmentação registra benefícios condicionais, maior tempo e moderador de retenção favorável ao conhecimento prévio alto. Não define tamanho de card nem benefício especial desta Explicação para novatos. |
| [Aleven et al. (2006)](referencias.md#ref-aleven2006helpseeking): resumo e páginas 19–26 do PDF de coautor, com análise de ajuda, discussão e piloto. | Evitar ajuda e percorrer dicas rapidamente exigem interpretação contextual; a agregação dos eventos altera associações. O piloto pequeno não mediu aprendizagem de geometria. Não importar o tutor ou converter cliques em domínio. |
| [Sandoval (2014)](referencias.md#ref-sandoval2014conjecture): resumo, introdução e mapeamento de conjecturas, páginas impressas 18–24. | Orienta separar elementos do desenho, processos esperados e resultados. É fundamento metodológico; não prova que a interface produza os processos propostos. |

A tabela seguinte é uma conjectura de design do AraLearn, organizada com o
auxílio metodológico de Sandoval. A literatura informa a decisão, mas não
determina a granularidade, o botão ou a política de aprovação do produto.

| Recurso decidido | Processo esperado, ainda hipotético | Resultado futuro a investigar | Risco a inspecionar |
| --- | --- | --- | --- |
| Unidade compacta com relação útil | Concentrar atenção no avanço corrente | Compreensão e transferência | Texto telegráfico, relação omitida |
| Apoio seletivo acessível na prática | Identificar lacuna e recuperar pressupostos | Compreensão, retenção e justificativa | Não reconhecer a lacuna, ignorar o botão, leitura passiva |
| Exemplo explicado e prática distinta | Separar princípio e caso; aplicar a relação | Transferência e capacidade de justificar | Apoio virar gabarito, analogia enganosa |
| Retorno preservando resposta | Retomar sem reconstruir o contexto | Orientação percebida e continuidade | Perda de foco, âncora ou resposta |
| Fontes localizadas e revisão humana | Examinar sustentação e interpretação | Crítica e correção fundamentada | Referência decorativa, aprovação aparente |

Aberturas, tempo, cliques e sucesso de ferramenta não são medidas suficientes
de aprendizagem. Inspeção de exemplos e testes funcionais verificam o artefato,
não os resultados da conjectura. Pesquisa futura com pessoas exige pergunta,
comparação, instrumentos, consentimento e tratamento de dados próprios antes
da execução. Este contrato não acrescenta telemetria, adaptação automática ou
coleta de pesquisa.

## Critérios discriminantes de aceitação

Os [dois exemplos sintéticos completos](examples/explicacao-redes.md) concretizam
o contrato em fundamentos de redes e gerência SNMP/RMON. Incluem plano,
unidades, uma Explicação por microssequência, práticas distintas, feedback,
declarações de aplicação e fontes localizadas. São rascunhos para inspeção,
sem materialização no aplicativo ou aprovação humana.

1. Produzir duas microssequências sintéticas; todas as unidades de cada uma
   resolvem um único apoio. Exportação reconstitui conteúdo e fontes sem perda.
2. Abrir a Explicação em teoria e numa prática com resposta pendente; consultar
   fonte, fechar e retornar por teclado/toque sem mudança de resposta/progresso.
3. Inspecionar um caso novato até os pressupostos e percorrer outro sem abrir
   apoio. Conferir que a tarefa tem base no percurso e que não se conta ajuda
   como aprendizagem. Isso é inspeção formativa, não estudo de eficácia.
4. Aprovar uma fixture por ação humana simulada e explicitamente rotulada;
   alterar unidade, apoio e fonte em casos separados. O estado afetado fica
   desatualizado; outra microssequência não relacionada permanece íntegra.
5. Tentar aprovar pela aba antiga e por payload/importação: rejeitar estado
   obsoleto ou aprovação fabricada sem perder rascunhos. Conferir distribuição
   do rascunho, cópia local anterior e retomada após aprovação atual.
6. Abrir acervo anterior sem apoio/revisão registrada: preservar conteúdo e
   progresso, sem geração automática. Exercitar offline preparado, manual,
   erro de serviço e falta de acesso à fonte como situações distintas.
7. Inspecionar pixels e clicar nos controles em 360, 390 e 430 px e desktop,
   incluindo ferramentas condicionais, temas, zoom/texto ampliado e viewport
   baixo. Uma conta geométrica ou teste de DOM não prova a nova fileira.

Essas provas pertencem à implementação e à candidata integrada. O contrato
não marca antecipadamente nenhum desses critérios como aprovado.

<!-- referências locais: início -->

## Referências

- [Aleven et al. (2006)](referencias.md#ref-aleven2006helpseeking): Vincent Aleven; Bruce McLaren; Ido Roll; Kenneth Koedinger (2006). **Toward Meta-cognitive Tutoring: A Model of Help Seeking with a Cognitive Tutor.** *International Journal of Artificial Intelligence in Education*, 16(2), p. 101–128.
- [Kalyuga (2007)](referencias.md#ref-kalyuga2007expertisereversal): Slava Kalyuga (2007). **Expertise Reversal Effect and Its Implications for Learner-Tailored Instruction.** *Educational Psychology Review*, 19(4), p. 509–539.
- [Koedinger e Aleven (2007)](referencias.md#ref-koedinger2007assistance): Kenneth R. Koedinger; Vincent Aleven (2007). **Exploring the Assistance Dilemma in Experiments with Cognitive Tutors.** *Educational Psychology Review*, 19(3), p. 239–264.
- [Renkl (2002)](referencias.md#ref-renkl2002learning): Alexander Renkl (2002). **Worked-Out Examples: Instructional Explanations Support Learning by Self-Explanations.** *Learning and Instruction*, 12(5), p. 529–556.
- [Rey et al. (2019)](referencias.md#ref-rey2019segmenting): Günter Daniel Rey; Maik Beege; Steve Nebel; Maria Wirzberger; Tobias H. Schmitt; Sascha Schneider (2019). **A Meta-Analysis of the Segmenting Effect.** *Educational Psychology Review*, 31, p. 389–419.
- [Sandoval (2014)](referencias.md#ref-sandoval2014conjecture): William Sandoval (2014). **Conjecture Mapping: An Approach to Systematic Educational Design Research.** *Journal of the Learning Sciences*, 23(1), p. 18–36.

<!-- referências locais: fim -->
