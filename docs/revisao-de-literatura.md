# Revisão de literatura

## Escopo, pergunta e estatuto

Esta é uma **revisão narrativa orientada ao design**. Seu objetivo é construir
uma base teórica auditável para decisões e hipóteses do AraLearn, não estimar
um efeito agregado do produto. Ela responde à pergunta: que conhecimentos
existentes ajudam a projetar e avaliar uma plataforma móvel, local-first,
orientada por representações, prática e autoria assistida?

O texto não deve ser apresentado como revisão sistemática ou de escopo
concluída. Uma revisão de escopo da dissertação ou tese deverá seguir um
protocolo próprio, alinhado ao JBI e ao PRISMA-ScR (Peters et al., 2024; Tricco
et al., 2018), com bases, strings, datas, critérios, duplicatas, seleção e
avaliação crítica reproduzíveis.

As referências bibliográficas canônicas ficam em
[referencias.bib](referencias.bib). As implicações do produto ficam na [Matriz
de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md), onde são
separadas de evidência externa e de resultado empírico.

## Procedimento de construção do corpus atual

O corpus foi consolidado em quatro movimentos:

1. leitura dos documentos acadêmico-pedagógicos do AraLearn e extração das
   alegações que exigiam fonte;
2. triagem do repositório histórico ARA-pre-consolidation como fonte de
   descoberta, sem promover automaticamente suas hipóteses;
3. priorização de revisões sistemáticas, meta-análises, textos metodológicos
   canônicos e normas primárias;
4. conferência de DOI, ISBN ou URL institucional persistente antes da entrada
   na bibliografia canônica.

Foram excluídos desta síntese: material sem identidade bibliográfica
verificável; comparações promocionais de produto; estudos cuja intervenção não
podia ser distinguida do mecanismo alegado; e inferências que confundiam
satisfação, uso, confiança ou conclusão com aprendizagem. Fontes de sistemas
específicos podem ser usadas numa futura análise comparativa, mas não foram
tratadas como evidência de eficácia educacional.

## Hierarquia de evidência usada na síntese

| Nível | Uso principal | Cuidado interpretativo |
| --- | --- | --- |
| revisão sistemática ou meta-análise | mapear consistência, heterogeneidade e moderadores | qualidade depende dos estudos e da comparabilidade |
| estudo experimental ou quase experimental | investigar efeito sob condições delimitadas | transferência ao contexto móvel não é automática |
| estudo qualitativo ou de campo | compreender processo, uso, contexto e casos negativos | não estimar efeito populacional sem desenho adequado |
| teoria ou quadro conceitual | definir mecanismo e relações plausíveis | plausibilidade não é confirmação empírica |
| norma ou orientação institucional | acessibilidade, ética e governança | conformidade não demonstra aprendizagem |
| documentação técnica do artefato | demonstrar implementação e rastreabilidade | teste de software não valida construto pedagógico |

A força de uma decisão não decorre apenas da posição na hierarquia. Importam a
correspondência entre população, tarefa, intervenção, comparação, resultado e
contexto do AraLearn.

## 1. Estudo móvel, autodireção e interrupção

### O que a literatura sustenta

Ahmad Faudzi et al. (2023) encontraram grande diversidade de frameworks de
interface em aplicações de mobile learning. Isso sustenta a necessidade de
avaliação situada, não a existência de um layout universal. Lai, Saab e
Admiraal (2022) mapearam estratégias cognitivas, metacognitivas, sociais e
afetivas em aprendizagem autodirigida de línguas com tecnologia móvel. O
domínio e o desenho dos estudos limitam sua generalização.

Autorregulação envolve fases e estratégias de planejamento, execução,
monitoramento e reflexão (Zimmerman, 2002; Panadero, 2017). Uma meta-análise de
controle do aprendiz em tecnologia educacional encontrou resultados
heterogêneos (Karich et al., 2014). Portanto, disponibilizar escolha ou
navegação não basta para afirmar agência ou autorregulação.

Interrupções criam custo de retomada e podem afetar o desempenho da tarefa
suspensa (Monk et al., 2008; Foroughi et al., 2016). Esses estudos não medem o
AraLearn, mas tornam plausível testar marcos de retomada, contexto local e
disponibilidade offline.

### Implicação limitada para o AraLearn

**Hipótese:** uma réplica local e um cursor de estudo corrente podem reduzir o
trabalho operacional para retomar uma tarefa interrompida. Avaliar por sucesso
de retomada, erros e relato, sem armazenar tempo em tela como proxy de atenção.
O benefício educacional de sessões móveis curtas permanece pergunta empírica.

## 2. Microssequência, progressão e carga cognitiva

### Segmentação não é fragmentação

A teoria da carga cognitiva orienta a distinguir complexidade inerente da
tarefa e carga criada pela apresentação ou pelo procedimento (Sweller, 1988;
Sweller et al., 1998). A meta-análise do efeito de segmentação encontrou
moderadores e heterogeneidade (Rey et al., 2019). Assim, “um conceito por card”
não é regra científica, e menor quantidade de texto não significa menor carga.

De Gagne et al. (2019) encontraram apenas 17 estudos de microlearning na
educação de profissionais da saúde, com intervenções variadas. No AraLearn,
**microssequência** nomeia uma unidade operacional entre card e lição;
**microteoria** nomeia o conjunto de explicações que sustenta práticas locais.
Nenhum dos termos define duração fixa ou teoria resumida.

### Novatos, exemplos e retirada de apoio

Exemplos resolvidos podem ser superiores à solução não apoiada para novatos em
determinadas tarefas (Sweller & Cooper, 1985), e a retirada gradual de passos
pode articular exemplo e resolução independente (Renkl et al., 2004). O
conhecimento prévio modifica necessidades de apoio. Isso reforça a progressão
do simples ao complexo sem converter uma explicação simples em explicação
rasa.

### Implicação limitada para o AraLearn

**Decisão:** o planejamento pedagógico precede o custo de produção e o número
de cards; não há quantidade fixa de teoria ou prática. **Hipótese:** uma
microssequência que explicita pré-requisitos, modela a operação, retira apoio e
varia a prática pode preservar coerência com menor carga extrínseca do que uma
concentração de vários conceitos num único card.

## 3. Representações externas e resources

### Representação como parte da tarefa

O quadro DeFT propõe analisar múltiplas representações por funções, restrições
e tarefas (Ainsworth, 2006). A teoria da aprendizagem multimídia e a
meta-análise de contiguidade espacial/temporal sustentam investigar integração
entre palavras e representações (Mayer, 2009; Ginns, 2006). Nenhuma dessas
fontes afirma que mais diagramas melhoram aprendizagem.

Uma representação externa pode: complementar informação, restringir
interpretações e apoiar a construção de compreensão mais profunda. Também pode
introduzir convenções desconhecidas, atenção dividida, rótulos ambíguos e
trabalho de tradução. O valor depende do gesto cognitivo: comparar,
relacionar, localizar, ordenar, transformar, provar, simular ou interpretar.

### Implicação limitada para o AraLearn

**Decisão:** um package especializado só entra no catálogo quando preserva uma
estrutura acadêmica que `paragraph`, `table` ou outro package geral não
preserva adequadamente. O catálogo descreve intenção, operações, domínio,
pré-requisitos de leitura e riscos; o autor consulta o contrato somente após a
seleção. **Hipótese:** essa recuperação progressiva pode melhorar adequação da
escolha e reduzir contexto desperdiçado.

Ausência de sobreposição, fonte uniforme e responsividade são requisitos de
qualidade técnica. Compreensão, transferência e adequação acadêmica exigem
avaliação com tarefas e especialistas dos domínios.

## 4. Recuperação, espaçamento, intercalação e formato de resposta

### Mecanismos distintos

Prática de recuperação beneficia aprendizagem em diferentes salas de aula,
com variação entre contextos e resultados (Agarwal et al., 2021). Karpicke e
Roediger (2008) demonstram que recuperação repetida pode sustentar retenção
posterior. Pan e Rickard (2018) mostram que transferência de aprendizagem
potencializada por teste é possível, mas moderada por desenho e distância da
tarefa.

Prática distribuída possui amplo respaldo (Cepeda et al., 2006), e o intervalo
adequado depende do horizonte de retenção (Cepeda et al., 2008). Espaçamento e
intercalação não devem ser fundidos: intercalação depende, entre outros fatores,
da similaridade e da discriminação entre categorias (Brunmair & Richter, 2019).

Formato de resposta também importa. Reconhecer uma alternativa, completar uma
lacuna, produzir uma resposta e ordenar blocos exigem operações diferentes. O
AraLearn não deve chamar todo toque de recuperação nem presumir que maior
dificuldade produz aprendizagem melhor.

### Implicação limitada para o AraLearn

**Decisão:** práticas são escolhidas pela operação necessária e podem ser
abundantes e diversas; cada lacuna é independente e pertence ao objeto que
será manipulado. **Hipótese:** combinar práticas de reconhecimento e produção,
com feedback e retomada planejada, pode apoiar compreensão, retenção e
transferência. Cada resultado precisa ser medido separadamente.

## 5. Feedback, baixa consequência e ação

Feedback pode ter efeitos positivos ou negativos conforme foco, conteúdo,
timing e possibilidade de ação (Hattie & Timperley, 2007). Revisões de feedback
formativo no ensino superior mostram grande variação de implementação e
qualidade metodológica (Morris et al., 2021). Shute (2008) organiza princípios
para feedback formativo, enquanto Nicol e Macfarlane-Dick (2006) o relacionam
à autorregulação.

Feedback literacy desloca a atenção da entrega para a capacidade de apreciar,
julgar, manejar afeto e agir (Carless & Boud, 2018). Feedback localizado pode
corrigir respostas de baixa confiança que a pessoa julgava erradas (Butler et
al., 2008), mas “correto/incorreto” isolado não garante elaboração.

Testes frequentes de baixa consequência apresentam associação média positiva
com desempenho em classe, com heterogeneidade e limites de causalidade entre
estudos (Sotola & Credé, 2021). No AraLearn, **baixa consequência** significa
ausência de nota, ranking ou punição acumulada. O **estado de estudo não
punitivo** é uma decisão normativa do produto, não uma alegação de redução de
ansiedade.

### Implicação limitada para o AraLearn

**Hipótese:** tentar, revelar, limpar, repetir e receber explicação específica
pode sustentar experimentação e ação posterior. Avaliar compreensão do
feedback, decisão de revisão e aplicação numa nova tarefa; não usar contagem de
tentativas, resposta revelada ou ausência de comentário como diagnóstico.

## 6. Agência, colaboração e autoria

Autorregulação e autodireção não significam abandono. Apoio pode ser retirado
à medida que a pessoa ganha controle sobre a tarefa (Wood et al., 1976). Em
contextos sociais, Wenger (1998) ajuda a compreender participação em práticas,
e Bridwell-Mitchell (2016) mostra que comunidades também podem habilitar ou
inibir agência.

Papéis de workspace são mecanismos de permissão e responsabilidade. Acesso,
papel ou copresença não demonstram colaboração. Da mesma forma, autoria
assistida por IA não demonstra agência apenas porque a pessoa pode editar; é
preciso observar entendimento do escopo, possibilidade real de rejeitar,
reverter e justificar decisões.

### Implicação limitada para o AraLearn

**Hipótese:** edição contextual, escopo explícito e versões reversíveis podem
reduzir erros de alvo e apoiar julgamento editorial. **Decisão:** publicação,
permissão e mudança de estrutura permanecem ações separadas e humanas.

## 7. IA generativa, recuperação e supervisão humana

RAG condiciona geração a informação recuperada (Lewis et al., 2020), mas não
elimina erro da fonte, seleção ou geração. No AraLearn, recuperação lexical de
instruções e consulta progressiva de contratos são mecanismos de economia e
delimitação de contexto, não selo de factualidade.

Diretrizes de interação humano-IA destacam comunicação de capacidade e limite,
feedback oportuno, correção e controle (Amershi et al., 2019). Experimentos com
funções de fricção cognitiva mostram que obrigar reflexão pode reduzir
dependência excessiva em decisões assistidas, com custo de interação e limites
de transferência (Buçinca et al., 2021). UNESCO (2023) e NIST (2024)
recomendam avaliação de risco, transparência, proteção de dados e
responsabilidade humana.

### Implicação limitada para o AraLearn

**Decisão:** a LLM recebe contexto somente leitura e alvos textuais graváveis
distintos; sua saída é validada e limitada ao escopo; a pessoa pode iterar em
chat, rejeitar e reverter. **Hipótese:** contratos especializados e auditoria
posterior podem reduzir deriva estrutural e retrabalho. Schema válido não
garante correção factual, pedagógica ou acadêmica.

## 8. Learning analytics, privacidade e recusa de proxies

Pardo e Siemens (2014) situam transparência, acesso, controle e responsabilidade
como princípios de analytics. Prinsloo e Slade (2017) tratam ética como parte
constitutiva da prática. Tsai e Martinez-Maldonado (2022) enfatizam processos
humanos e dialógicos de feedback informado por dados.

Cliques, abertura, tempo, conclusão e resposta revelada são manifestações
ambíguas. Podem refletir interrupção, acessibilidade, familiaridade,
curiosidade, falha técnica ou estratégia. Não devem ser promovidos a atenção,
esforço, domínio ou risco sem modelo, validação e intervenção legítima.

### Implicação limitada para o AraLearn

**Decisão:** um dado só entra quando pergunta, construto, manifestação,
interpretação permitida, alternativas, intervenção, retenção e custo estão
registrados. A recusa de telemetria punitiva é uma escolha de governança; seus
efeitos sobre confiança e uso ainda precisam ser estudados.

## 9. Metodologias de construção e avaliação

Design-Based Research investiga intervenções educacionais iterativamente em
contextos autênticos e busca produzir explicações sobre relações entre teoria,
design e prática (Design-Based Research Collective, 2003; Wang & Hannafin,
2005). Design Science Research organiza construção, demonstração, avaliação e
contribuição de artefatos (Hevner et al., 2004; Peffers et al., 2007).

Gregor e Hevner (2013) ajudam a posicionar a contribuição conforme maturidade
do problema e da solução. Venable et al. (2016) distinguem avaliação formativa
ou somativa e artificial ou naturalística. Para o AraLearn, DBR e DSR são
trilhas complementares: DBR examina intervenção e aprendizagem situada; DSR
examina artefato e conhecimento de design. Elas não são nomes intercambiáveis
para “iterar software”.

## Síntese transversal

| Afirmação | Estado atual | Consequência para o desenho |
| --- | --- | --- |
| unidade curta é sempre melhor | não sustentada | dimensionar pela progressão e pelo objetivo |
| mais resources são melhores | não sustentada | exigir justificativa semântica e acadêmica |
| recuperação e distribuição podem beneficiar aprendizagem | sustentada em múltiplos contextos, com moderadores | escolher operação, feedback e intervalo; avaliar transferência |
| learner control produz autonomia | não sustentada como regra | oferecer apoio, explicitar consequências e avaliar escolhas |
| feedback funciona por ser imediato | simplificação indevida | estudar conteúdo, foco, timing e ação |
| offline e retomada reduzem atrito | hipótese plausível do contexto | medir tarefa de retomada e falhas reais |
| RAG e schema garantem qualidade | falso | manter revisão humana, auditoria e avaliação de conteúdo |
| rastros comportamentais medem aprendizagem | falso sem validação | partir de pergunta e construto, não da disponibilidade do dado |

## Lacunas e agenda da revisão formal

- comparar diretamente AraLearn, LMS, flashcards, microlearning, tutores,
  ferramentas autorais por IA e sistemas local-first;
- caracterizar estudos com estudantes-trabalhadores e conectividade variável;
- identificar medidas válidas de retomada, carga, agência, feedback literacy e
  qualidade autoral em dispositivos móveis;
- mapear representações canônicas e gestos cognitivos por área do conhecimento;
- revisar práticas de composição de múltiplas representações num mesmo card;
- investigar efeitos de explicações progressivas para novatos sem redução de
  profundidade;
- distinguir retenção e transferência em práticas de diferentes formatos;
- investigar supervisão de modelos menores na assistência local e modelos
  maiores na autoria por MCP;
- mapear governança, proveniência, autoria coletiva e direitos de participantes;
- buscar casos negativos, efeitos adversos e mecanismos que devam ser
  removidos, não apenas refinados.

## Ligações para operacionalização

- [Fundamentos, pesquisa e governança](fundamentos-pesquisa-e-governanca.md)
- [Quadro teórico](quadro-teorico.md)
- [Glossário de construtos](glossario-construtos.md)
- [Matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md)
- [Protocolo de avaliação](protocolo-avaliacao-artefato.md)
- [Fundamentação pedagógica dos resources](fundamentacao-pedagogica-dos-resources.md)
- [Contribuição e originalidade](contribuicao-originalidade.md)
