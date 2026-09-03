# Contribuição e originalidade do AraLearn

## 1. O que significa contribuição em pesquisa orientada ao desenho de artefatos

Uma contribuição não é sinônimo de funcionalidade nova. Em pesquisa orientada
à construção de artefatos, pode haver contribuição em pelo menos quatro níveis:

1. **artefato**: sistema, método ou modelo concretamente implementado;
2. **conhecimento de desenho**: explicação sobre como e em que condições uma
   solução pode enfrentar uma classe de problemas;
3. **instrumento de investigação**: contratos, rubricas, corpora ou protocolos
   que permitem examinar o fenômeno;
4. **resultado empírico**: evidência produzida pela avaliação do artefato.

Design Science Research trata relevância do problema, rigor do conhecimento
utilizado, construção e avaliação como atividades relacionadas
([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)). Uma contribuição de desenho ganha
força quando ultrapassa a descrição da instância e explicita princípios,
contextos e limites de transferência ([Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning)). Ciclos de
Design-Based Research também valorizam refinamento em situações educacionais e
produção de conhecimento associado ao desenho, sem supor que uma intervenção
funcione igualmente em qualquer contexto ([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased)).

O AraLearn pode ser descrito como artefato implementado. Sua originalidade
pedagógica, sua utilidade em uso e sua eficácia de aprendizagem permanecem
questões empíricas até que sejam avaliadas com métodos compatíveis.

Nos trechos técnicos, **núcleo comum** designa a camada que coordena os módulos
do aplicativo; **pacote de componente**, o módulo versionado que reúne contrato,
validação e implementação de uma representação ou formato de resposta; e
**inteligência artificial (IA)**, os modelos e serviços usados para auxiliar a
autoria. A expressão **operação local prioritária** designa a arquitetura em
que a cópia local sustenta a operação corrente e a sincronização com o servidor
não bloqueia o gesto da pessoa.

## 2. Distinções necessárias

| Conceito | Pergunta | Evidência apropriada |
| --- | --- | --- |
| novidade técnica | existe diferença verificável em relação a soluções anteriores? | comparação arquitetural, código, contratos e estado da técnica |
| utilidade | a solução ajuda alguém a realizar uma tarefa relevante? | tarefas com usuários, erros, tempo, satisfação e análise qualitativa |
| usabilidade | pessoas específicas alcançam objetivos com eficácia, eficiência e satisfação em contexto definido? | avaliação baseada em contexto de uso e medidas correspondentes ([International Organization for Standardization (2018)](referencias.md#ref-iso2018usability)) |
| adequação pedagógica | objetivos, fundamentos, prática, feedback e representação estão coerentes? | rubrica, especialistas, estudantes e análise das tarefas |
| eficácia de aprendizagem | a intervenção melhora compreensão, retenção ou transferência? | desenho empírico com comparação, medidas válidas e incerteza |
| originalidade científica | o trabalho acrescenta conhecimento defensável além da instância? | síntese da literatura, avaliação e abstração dos resultados |

Uma implementação pode ser nova e pouco útil. Uma interface pode ser usável e
não melhorar aprendizagem. Um curso pode ser coerente segundo especialistas e
ainda produzir dificuldades imprevistas. Essas distinções impedem que testes de
software sejam apresentados como resultados educacionais.

## 3. Decisão sobre a unidade de contribuição

### Problema

Ambientes educacionais costumam separar planejamento didático, produção de
conteúdo, renderização de representações, prática, Estudo sem conexão, edição
assistida e governança. Integrar tudo em uma única aplicação pode gerar um
monólito difícil de ampliar; mantê-los totalmente separados pode romper a
rastreabilidade entre intenção pedagógica e experiência de estudo.

### Alternativas e requisitos

As alternativas principais são:

- adotar uma plataforma genérica e adaptar o conteúdo aos componentes
  existentes;
- construir módulos independentes sem uma semântica comum;
- definir um núcleo pequeno e contratos explícitos que coordenem componentes
  especializados.

A solução precisa preservar separação de responsabilidades, operação móvel sem
conexão, autoria compreensível, expansão do catálogo e rastreabilidade entre
decisão pedagógica e materialização.

### Decisão

O AraLearn investiga uma configuração integrada composta por:

- modelo didático de progressão sem quantidade fixa de Unidades de estudo;
- catálogo semântico de componentes didáticos;
- pacotes de componente especializados e independentes de um núcleo comum;
- contratos recuperados sob demanda depois da escolha da representação;
- práticas situadas dentro do objeto quando a operação assim exige;
- estudo com cópia local e sincronização assíncrona;
- autoria do Curso e correção focal em escalas distintas;
- propriedade do Curso, acesso direto para Estudo, proveniência e correções
  revisáveis em qualquer ponto;
- política de dados orientada pela finalidade, sem telemetria comportamental
  automática.

### Fundamentação

A configuração articula problemas tratados por literaturas diferentes:
representações externas ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)), carga cognitiva
([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)), recuperação e prática
distribuída ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed)), feedback
([Shute (2008)](referencias.md#ref-shute2008feedback); [Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy)), autorregulação
([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated); [Panadero (2017)](referencias.md#ref-panadero2017selfregulated)), interação entre pessoas e IA
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai);
[Lee e See (2004)](referencias.md#ref-lee2004trust);
[Vaccaro et al. (2024)](referencias.md#ref-vaccaro2024humanai)) e governança de dados
educacionais ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)). Nenhuma dessas fontes
avalia a configuração do AraLearn como conjunto.

### Operacionalização

A arquitetura, os contratos, as regras de autoria, a persistência e os
protocolos de avaliação são documentados separadamente. Cada decisão possui
identificador na [Matriz de rastreabilidade
pedagógica](matriz-rastreabilidade-pedagogica.md), evidência técnica e episódio
empírico requerido.

### Consequências

A unidade de análise deixa de ser uma funcionalidade isolada e passa a ser a
coordenação entre planejamento, representação, interação, persistência e
governança. Isso permite estudar tanto cada mecanismo quanto efeitos e custos da
configuração completa.

### Limites e evidência

A integração pode aumentar complexidade, custo de manutenção e dificuldade de
atribuir efeitos a um mecanismo. A configuração não é apresentada como única,
superior ou eficaz. Sua originalidade depende da revisão do estado da arte; sua
utilidade e seus efeitos dependem de avaliação.

## 4. Contribuições potenciais

### C1: arquitetura extensível de componentes didáticos

**Problema.** Contratos monolíticos e renderizadores centrais tornam a inclusão
de uma nova representação uma refatoração transversal.

**Alternativas e requisitos.** Manter um mecanismo central de renderização,
distribuir módulos sem interface comum ou adotar pacotes autodescritivos. A
extensão precisa preservar isolamento, validação e integração previsível.

**Decisão.** Pacotes de componente autodescritivos reúnem esquema de validação,
mecanismo de renderização, catálogo, autoria, prática e testes sob um núcleo
comum.

**Fundamentação.** A decisão aplica separação de responsabilidades ao problema
de um artefato extensível; sua relevância e avaliação seguem a lógica de DSR
([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)).

**Operacionalização.** Cada pacote registra contrato, mecanismo de
renderização, descrição de descoberta, campos editáveis e testes; o núcleo
consome essa interface comum. O catálogo corrente materializa essa decisão em
32 pacotes, sendo 29 de conteúdo e três de resposta.

**Consequências.** A contribuição potencial é um padrão arquitetural para integrar representações
acadêmicas heterogêneas sem expor detalhes geométricos à autoria.

**Limites e evidência.** Devem ser medidos dependências, esforço de inclusão, estabilidade do
núcleo, exemplos de extensão independente e comparação com alternativa
monolítica. Código funcional demonstra a instância, não a generalidade do
padrão.

### C2: descoberta progressiva de contratos para autoria assistida

**Problema.** Enviar todos os esquemas de validação simultaneamente aumenta contexto e
dificulta escolher a representação pela intenção.

**Alternativas e requisitos.** Fornecer contrato monolítico, exigir nome exato
do componente ou recuperar progressivamente catálogo e contrato. A autoria precisa
encontrar uma intenção sem conhecer a sintaxe antecipadamente.

**Decisão.** A autoria consulta descrições e facetas, escolhe o tipo e só então
recebe seu contrato.

**Fundamentação.** A geração aumentada por recuperação condiciona a produção a
informação recuperada ([Lewis et al. (2020)](referencias.md#ref-lewis2020rag)),
mas erros de geração, sua detecção e sua mitigação variam conforme a tarefa
([Ji et al. (2023)](referencias.md#ref-ji2023hallucination)).

Estudos situados de autoria educacional mostram instrutores e docentes
planejando, avaliando, adaptando e contextualizando saídas de IA
([Choi et al. (2024)](referencias.md#ref-choi2024vivid);
[Dennison et al. (2026)](referencias.md#ref-dennison2026shiksha)). Esses estudos
situados não autorizam presumir ganho uniforme. Uma meta-análise encontrou
efeitos heterogêneos para combinações pessoa–IA e ausência de sinergia média
contra o melhor desempenho isolado; nas tarefas de criação, o efeito positivo
não foi estatisticamente significativo
([Vaccaro et al. (2024)](referencias.md#ref-vaccaro2024humanai)). Entrevistas com
57 docentes de oito escolas também descreveram conferência, reparo, reescrita,
rejeição e reconstrução de materiais produzidos por IA
([Selwyn et al. (2025)](referencias.md#ref-selwyn2025prompting)).

**Operacionalização.** A consulta retorna intenção, operações, limitações e
facetas; uma segunda operação fornece apenas o contrato selecionado.

**Consequências.** A contribuição potencial é um método de recuperação
progressiva de ferramentas representacionais com menor contexto inicial.

**Limites e evidência.** Precisão da seleção, custo de contexto, incidência de
contrato inadequado, retrabalho e comparação com catálogo monolítico. O simples
funcionamento da busca não demonstra melhor decisão.

### C3: modelo didático operacional de microssequência

**Problema.** Uma Unidade de estudo curta pode permanecer condensada, e uma
quantidade fixa de teoria ou prática pode ignorar complexidade e conhecimento
prévio.

**Alternativas e requisitos.** Fixar tamanho, resumir para caber ou dimensionar
a sequência por pré-requisitos, relações e evidência de aprendizagem. É preciso
preservar profundidade e coerência.

**Decisão.** A microssequência declara objetivo, pré-requisitos, progressão,
exemplos, práticas e retomadas antes de materializar as Unidades de estudo.

**Fundamentação.** Segmentação e microaprendizagem possuem efeitos e definições
heterogêneos; não oferecem uma cota universal ([Rey et al. (2019)](referencias.md#ref-rey2019segmenting); [De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning)).

**Operacionalização.** Plano instrucional, rubrica e auditoria verificam a
cobertura entre teoria, exemplo, prática e feedback.

**Consequências.** A contribuição potencial é um modelo operacional que distingue microteoria de
resumo e associa granularidade à suficiência pedagógica.

**Limites e evidência.** Exigem-se confiabilidade da rubrica, julgamento de especialistas,
compreensão por novatos, retenção, transferência e casos em que a segmentação
fragmenta relações. A base externa não valida automaticamente esse modelo.

### C4: prática incorporada a representações disciplinares

**Problema.** Exercícios genéricos deslocam a resposta do lugar em que o
raciocínio acontece.

**Alternativas e requisitos.** Responder fora do objeto, transformar toda
representação em formulário ou autorizar alvos semânticos internos. A interação
precisa preservar notação e identidade de cada alvo.

**Decisão.** Lacuna e digitação podem ocupar folhas semânticas de código,
matriz, tabela, fórmula ou diagrama; escolha e ordenação são usadas quando
correspondem à operação. Quando a tarefa exige estabelecer correspondências,
cada relação ocupa uma lacuna independente no campo textual de `paragraph` ou
`table` em que já é lida, sem bloco autônomo de associação.

**Fundamentação.** Recuperação pode beneficiar aprendizagem, mas tarefa e
transferência são moderadores ([Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval); [Pan e Rickard (2018)](referencias.md#ref-pan2018transfer)).

**Operacionalização.** O componente declara alvos, respostas e feedback; o
formato de resposta controla estado e confirmação sem modificar a topologia.
Lacunas que integram a mesma correspondência conservam opções e estado próprios.

**Consequências.** A contribuição potencial é um mecanismo para coordenar representação
especializada e resposta sem descaracterizar a notação.

**Limites e evidência.** Devem ser examinadas independência de alvos, correção do contrato,
interpretação por estudantes e comparação com resposta externa. Benefícios de
recuperação não demonstram que qualquer lacuna seja válida.

### C5: autoria estrutural e correção focal com escopo explícito

**Problema.** Construir um Curso inteiro e corrigir uma Unidade são tarefas de
escala, risco e contexto diferentes.

**Alternativas e requisitos.** Usar o mesmo fluxo para tudo, separar completamente
as ferramentas ou coordenar autoria estrutural e correção focal. O escopo
precisa ser visível, validável e revisável.

**Decisão.** A autoria estrutural apresenta primeiro o mapa curricular global e
o mantém inspecionável antes da aprovação. Depois, partes agrupam a produção
incremental sem se tornar nível curricular. Observações ficam ancoradas no
curso, na microssequência ou na unidade de estudo e podem ser registradas em
vários alvos na mesma ação. Ao preparar uma revisão, o contexto inclui também as unidades afetadas por progressão,
pré-requisitos, exemplos, prática e transições; a correção atualiza diretamente
o curso mutável e a rematerialização volta a comprovar seus parâmetros.

**Fundamentação.** A interação entre pessoas e IA requer limites
compreensíveis, correção e controle
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)). Em uma tarefa
de decisão assistida, funções que forçavam reflexão reduziram dependência
excessiva e acrescentaram custo; o resultado não demonstra controle efetivo na
autoria educacional
([Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)).

**Operacionalização.** O servidor deriva o contexto focal, mantém as observações
abertas consultáveis e aplica correções com controle de concorrência. Voltar a
qualquer ponto significa abrir unidades antigas, anotar e reparar o conjunto
coerente afetado; não requer rodadas imutáveis nem um histórico paralelo de
mutações.

**Consequências.** A contribuição potencial é um modelo de coordenação entre
autoria ampla e correção localizada com assistência de modelos de linguagem.

**Limites e evidência.** Devem ser medidos erro de escopo, qualidade da mudança,
retrabalho, compreensão, controle percebido, verificação e capacidade de voltar
a pontos anteriores para revisá-los. Diretrizes de interação não garantem que
os controles sejam compreendidos.

### C6: continuidade local e sincronização não bloqueante

**Problema.** Estudo móvel pode ocorrer sem conexão estável; ações locais não
devem depender da latência da rede.

**Alternativas e requisitos.** Operação centrada no servidor, cópia parcial ou
réplica local sincronizável. A resposta do gesto corrente precisa independer da
rede sem perder consistência posterior.

**Decisão.** Conteúdo já sincronizado e estado corrente permanecem locais; a
sincronização ocorre fora do caminho crítico.

**Fundamentação.** Interrupção pode impor custo de retomada, mas a literatura não
avalia esta arquitetura ([Monk et al. (2008)](referencias.md#ref-monk2008resumption); [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption)).

**Operacionalização.** Réplica, fila, cursor corrente e resolução de conflito
são testados sob perda e retorno de conexão.

**Consequências.** A contribuição potencial é uma aplicação educacional móvel cuja continuidade
operacional e retomada são tratadas como requisitos arquiteturais.

**Limites e evidência.** São necessários testes sem conexão, latência,
conflitos, consumo de armazenamento e tarefas reais de interrupção e retomada.
O funcionamento sem conexão é resultado técnico; menor esforço de retomada é
hipótese.

### C7: propriedade, proveniência e dados proporcionais

**Problema.** Poder de edição difuso e telemetria abundante podem obscurecer
responsabilidade e produzir inferências sem validade.

**Alternativas e requisitos.** Autoria coletiva com papéis, isolamento completo
ou propriedade do Curso com acesso direto para Estudo; coleta ampla ou dados
definidos pela finalidade. A solução precisa permitir revogação, atribuição e
proporcionalidade.

**Decisão.** Cada Curso possui uma pessoa proprietária, e o acesso direto concede
somente Estudo no original. Uma edição contextual feita
por quem estuda cria outro Curso privado, sob sua propriedade, sem escrever na
origem. Fontes, Âncoras, eventos e correções preservam proveniência. A área
Pesquisa expõe fatos autorais sem dados identificadores e contagens descritivas,
sem criar telemetria comportamental por conveniência.

**Fundamentação.** A ética da análise de dados educacionais exige finalidade, transparência e
responsabilidade ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)).

**Operacionalização.** A autorização é calculada por Curso e operação; mudanças
recebem origem e revisão; cada métrica declara pergunta, denominador, ausências
e interpretações vedadas.

**Consequências.** A contribuição potencial é uma política integrada de
responsabilidade autoral, compartilhamento para Estudo e minimização de dados.

**Limites e evidência.** Devem ser examinados isolamento, reconstrução de
autoria, compreensão de propriedade e acesso, custo de armazenamento,
proporcionalidade e efeitos adversos. A fundamentação ética não prova que a
política adotada seja suficiente.

### C8: instrumentos reprodutíveis de auditoria

**Problema.** Qualidade pedagógica, fidelidade representacional e correção
técnica podem ser confundidas em uma única afirmação de “qualidade”.

**Alternativas e requisitos.** Usar um selo único, manter avaliações isoladas ou
ligar instrumentos por uma matriz de evidências. Cada resultado precisa de
definição e inferência próprias.

**Decisão.** Rubricas, matrizes, casos de estresse e protocolos separam
conformidade, julgamento de especialista, usabilidade e aprendizagem.

**Fundamentação.** DBR e DSR distinguem intervenção situada, artefato e
conhecimento de desenho ([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Venable et al. (2016)](referencias.md#ref-venable2016feds)).

**Operacionalização.** Cada instrumento declara unidade, pergunta, versão,
procedimento, interpretação permitida e limite.

**Consequências.** A contribuição potencial é um conjunto de instrumentos para investigar
artefatos educacionais com autoria assistida e representações especializadas.

**Limites e evidência.** São necessárias definições operacionais, confiabilidade entre
avaliadores, sensibilidade a defeitos conhecidos e uso por equipes externas.

## 5. Relação com classes de sistemas existentes

O valor de uma contribuição integrada só pode ser avaliado por comparação
explícita. A tabela organiza classes funcionais sem afirmar que determinada
configuração inexista em outros produtos ou estudos.

| Classe | Capacidade frequentemente central | Questão comparativa para o AraLearn |
| --- | --- | --- |
| sistema de gestão da aprendizagem (LMS) | matrícula, distribuição, atividade e registro institucional | propriedade do Curso e acesso direto preservam responsabilidade sem burocratizar o Estudo? |
| flashcards e prática | recuperação, repetição e retorno após a resposta | microssequências e componentes estruturados acrescentam profundidade sem perder fluidez? |
| ferramentas de autoria | edição visual e publicação | catálogo progressivo e contratos tornam escolhas representacionais mais coerentes? |
| bibliotecas de visualização | renderização especializada | pacotes de componente integram convenção, prática, edição e acessibilidade além da figura isolada? |
| aplicações com cópia local | réplica, fila e sincronização | a arquitetura mantém continuidade e resolve conflitos com custo proporcional? |
| assistência por modelo de linguagem | geração e transformação de conteúdo | escopo explícito, validação e revisão contextual reduzem mudanças indevidas sem criar controle apenas simbólico? |
| análise de dados educacionais | descrição, previsão e intervenção | que perguntas úteis podem ser respondidas com dados mínimos, definições explícitas e participação adequada? |

Uma revisão comparativa deve definir corpus, critérios de inclusão, data de
busca e unidade de comparação. “Não foi encontrado” é diferente de “não
existe”.

## 6. Níveis de alegação

### 6.1 Alegações sustentáveis por inspeção e teste técnico

Quando acompanhadas de evidência reproduzível, podem ser afirmadas propriedades
como:

- existência de núcleo comum e pacotes de componente separados;
- descoberta de catálogo antes da recuperação do contrato;
- validação de esquemas de dados e escopo de edição;
- operação sem conexão nos cenários testados;
- retorno a qualquer ponto do Curso e revisão segundo o fluxo implementado;
- ausência de recorte ou sobreposição nos casos geométricos avaliados.

### 6.2 Alegações que exigem avaliação de uso

Não podem ser inferidas apenas do código:

- pessoas leigas compreendem catálogo, componentes, propriedade, acesso e revisão;
- autoria assistida reduz retrabalho;
- retomada local reduz atrito;
- propriedade e acesso direto tornam a responsabilidade compreensível;
- observações situadas produzem ação útil.

### 6.3 Alegações que exigem avaliação de aprendizagem

Exigem medidas compatíveis de compreensão, retenção ou transferência:

- microssequências melhoram aprendizagem;
- uma representação reduz carga cognitiva extrínseca;
- práticas internas produzem recuperação mais efetiva;
- feedback melhora desempenho posterior;
- o desenho não punitivo altera estratégia ou ansiedade.

### 6.4 Alegações que exigem comparação definida com alternativas pertinentes

- o AraLearn é o primeiro ou único sistema com essa configuração;
- a arquitetura é universalmente superior;
- mais componentes didáticos produzem Cursos melhores;
- conteúdo gerado ou reparado por modelo é correto por ter esquema de dados válido;
- ausência de telemetria é suficiente para garantir justiça ou privacidade;
- uma preferência visual reduz carga cognitiva para todas as pessoas.

## 7. Resultados contrários e contribuição negativa

Conhecimento de desenho também pode surgir quando uma solução não funciona.
Exemplos relevantes incluem:

- componente cuja convenção não é compreendida;
- representação especializada sem vantagem sobre tabela ou prosa;
- segmentação que quebra relações conceituais;
- controle de assistência que não impede aceitação automática;
- conflito de sincronização que torna versões incompreensíveis;
- indicador cuja interpretação não sustenta intervenção legítima.

Esses resultados devem registrar contexto, mecanismo esperado, observação,
explicações rivais e decisão resultante: manter, restringir, fundir, redesenhar
ou retirar. Relatar casos negativos reduz viés de sobrevivência e delimita onde
um princípio pode ser transferido.

## 8. Estrutura de uma alegação responsável

Toda contribuição avaliada deve apresentar:

```text
problema e contexto
→ alternativas e requisitos
→ decisão e mecanismo implementado
→ fundamentação externa
→ procedimento de avaliação
→ resultado observado e incerteza
→ explicações rivais
→ consequências e limites de transferência
```

Quando não houver resultado empírico, a cadeia termina em hipótese e protocolo.
O [Protocolo de avaliação do artefato](protocolo-avaliacao-artefato.md) define
como avançar dessa hipótese para evidência. A [Revisão de
literatura](revisao-de-literatura.md), o [Quadro teórico](quadro-teorico.md) e a
[Matriz de rastreabilidade](matriz-rastreabilidade-pedagogica.md) sustentam a
cadeia documental. As referências completas estão em
[`referencias.bib`](referencias.bib).

<!-- referências locais: início -->

## Referências

- [Agarwal et al. (2021)](referencias.md#ref-agarwal2021retrieval): Pooja K. Agarwal; Ludmila D. Nunes; Janell R. Blunt (2021). **Retrieval Practice Consistently Benefits Student Learning: A Systematic Review of Applied Research in Schools and Classrooms.** *Educational Psychology Review*, 33(4), p. 1409–1453.
- [Ainsworth (2006)](referencias.md#ref-ainsworth2006deft): Shaaron Ainsworth (2006). **DeFT: A Conceptual Framework for Considering Learning with Multiple Representations.** *Learning and Instruction*, 16(3), p. 183–198.
- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance): Zana Buçinca; Maja Barbara Malaya; Krzysztof Z. Gajos (2021). **To Trust or to Think: Cognitive Forcing Functions Can Reduce Overreliance on AI in AI-Assisted Decision-Making.** *Proceedings of the ACM on Human-Computer Interaction*, 5(CSCW1), p. 1–21.
- [Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy): David Carless; David Boud (2018). **The Development of Student Feedback Literacy: Enabling Uptake of Feedback.** *Assessment & Evaluation in Higher Education*, 43(8), p. 1315–1325.
- [Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed): Nicholas J. Cepeda; Harold Pashler; Edward Vul; John T. Wixted; Doug Rohrer (2006). **Distributed Practice in Verbal Recall Tasks: A Review and Quantitative Synthesis.** *Psychological Bulletin*, 132(3), p. 354–380.
- [Choi et al. (2024)](referencias.md#ref-choi2024vivid): Seulgi Choi; Hyewon Lee; Yoonjoo Lee; Juho Kim (2024). **VIVID: Human–AI Collaborative Authoring of Vicarious Dialogues from Lecture Videos.** In: *Proceedings of the 2024 CHI Conference on Human Factors in Computing Systems*, Association for Computing Machinery, p. 1–26.
- [De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning): Jennie Chang De Gagne; Hyeyoung Kate Park; Katherine Hall; Amanda Woodward; Sandra Yamane; Sang Suk Kim (2019). **Microlearning in Health Professions Education: Scoping Review.** *JMIR Medical Education*, 5(2), p. e13997.
- [Dennison et al. (2026)](referencias.md#ref-dennison2026shiksha): Deepak Varuvel Dennison; Bakhtawar Ahtisham; Kavyansh Chourasia; Nirmit Arora; Rahul Singh; René F. Kizilcec; Akshay Nambi; Tanuja Ganu; Aditya Vashistha (2026). **Shiksha Copilot: Teacher–AI Collaboration for Curating and Customizing Lesson Plans in Low-Resource Schools.** *Proceedings of the ACM on Human-Computer Interaction*, 10(2), p. 1–47.
- [Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased): Design-Based Research Collective (2003). **Design-Based Research: An Emerging Paradigm for Educational Inquiry.** *Educational Researcher*, 32(1), p. 5–8.
- [Foroughi et al. (2016)](referencias.md#ref-foroughi2016resumption): Cyrus K. Foroughi; Nicole E. Werner; Elizabeth T. Nelson; Deborah A. Boehm-Davis (2016). **Individual Differences in Working-Memory Capacity and Task Resumption Following Interruptions.** *Journal of Experimental Psychology: Learning, Memory, and Cognition*, 42(9), p. 1480–1488.
- [Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning): Shirley Gregor; Alan R. Hevner (2013). **Positioning and Presenting Design Science Research for Maximum Impact.** *MIS Quarterly*, 37(2), p. 337–355.
- [Hevner et al. (2004)](referencias.md#ref-hevner2004designscience): Alan R. Hevner; Salvatore T. March; Jinsoo Park; Sudha Ram (2004). **Design Science in Information Systems Research.** *MIS Quarterly*, 28(1), p. 75–105.
- [International Organization for Standardization (2018)](referencias.md#ref-iso2018usability): International Organization for Standardization (2018). **ISO 9241-11:2018: Ergonomics of Human-System Interaction — Part 11: Usability: Definitions and Concepts.** ISO 9241-11:2018.
- [Ji et al. (2023)](referencias.md#ref-ji2023hallucination): Ziwei Ji; Nayeon Lee; Rita Frieske; Tiezheng Yu; Dan Su; Yan Xu; Etsuko Ishii; Ye Jin Bang; Andrea Madotto; Pascale Fung (2023). **Survey of Hallucination in Natural Language Generation.** *ACM Computing Surveys*, 55(12), p. 1–38.
- [Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval): Jeffrey D. Karpicke; Henry L. Roediger (2008). **The Critical Importance of Retrieval for Learning.** *Science*, 319(5865), p. 966–968.
- [Lee e See (2004)](referencias.md#ref-lee2004trust): John D. Lee; Katrina A. See (2004). **Trust in Automation: Designing for Appropriate Reliance.** *Human Factors*, 46(1), p. 50–80.
- [Lewis et al. (2020)](referencias.md#ref-lewis2020rag): Patrick Lewis; Ethan Perez; Aleksandra Piktus; Fabio Petroni; Vladimir Karpukhin; Naman Goyal; Heinrich Küttler; Mike Lewis; Wen-tau Yih; Tim Rocktäschel; Sebastian Riedel; Douwe Kiela (2020). **Retrieval-Augmented Generation for Knowledge-Intensive NLP Tasks.** In: *Advances in Neural Information Processing Systems*, vol. 33, p. 9459–9474.
- [Monk et al. (2008)](referencias.md#ref-monk2008resumption): Christopher A. Monk; J. Gregory Trafton; Deborah A. Boehm-Davis (2008). **The Effect of Interruption Duration and Demand on Resuming Suspended Goals.** *Journal of Experimental Psychology: Applied*, 14(4), p. 299–313.
- [Pan e Rickard (2018)](referencias.md#ref-pan2018transfer): Steven C. Pan; Timothy C. Rickard (2018). **Transfer of Test-Enhanced Learning: Meta-Analytic Review and Synthesis.** *Psychological Bulletin*, 144(7), p. 710–756.
- [Panadero (2017)](referencias.md#ref-panadero2017selfregulated): Ernesto Panadero (2017). **A Review of Self-Regulated Learning: Six Models and Four Directions for Research.** *Frontiers in Psychology*, 8, p. 422.
- [Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical): Abelardo Pardo; George Siemens (2014). **Ethical and Privacy Principles for Learning Analytics.** *British Journal of Educational Technology*, 45(3), p. 438–450.
- [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm): Ken Peffers; Tuure Tuunanen; Marcus A. Rothenberger; Samir Chatterjee (2007). **A Design Science Research Methodology for Information Systems Research.** *Journal of Management Information Systems*, 24(3), p. 45–77.
- [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics): Paul Prinsloo; Sharon Slade (2017). **Ethics and Learning Analytics: Charting the (Un)Charted.** In: *Handbook of Learning Analytics*, Society for Learning Analytics Research, p. 49–57.
- [Rey et al. (2019)](referencias.md#ref-rey2019segmenting): Günter Daniel Rey; Maik Beege; Steve Nebel; Maria Wirzberger; Tobias H. Schmitt; Sascha Schneider (2019). **A Meta-Analysis of the Segmenting Effect.** *Educational Psychology Review*, 31, p. 389–419.
- [Selwyn et al. (2025)](referencias.md#ref-selwyn2025prompting): Neil Selwyn; Marita Ljungqvist; Anders Sonesson (2025). **When the Prompting Stops: Exploring Teachers' Work Around the Educational Frailties of Generative AI Tools.** *Learning, Media and Technology*, 50(3), p. 310–323.
- [Shute (2008)](referencias.md#ref-shute2008feedback): Valerie J. Shute (2008). **Focus on Formative Feedback.** *Review of Educational Research*, 78(1), p. 153–189.
- [Sweller (1988)](referencias.md#ref-sweller1988cognitiveload): John Sweller (1988). **Cognitive Load During Problem Solving: Effects on Learning.** *Cognitive Science*, 12(2), p. 257–285.
- [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture): John Sweller; Jeroen J. G. van Merriënboer; Fred G. W. C. Paas (1998). **Cognitive Architecture and Instructional Design.** *Educational Psychology Review*, 10, p. 251–296.
- [Vaccaro et al. (2024)](referencias.md#ref-vaccaro2024humanai): Michelle Vaccaro; Abdullah Almaatouq; Thomas Malone (2024). **When Combinations of Humans and AI Are Useful: A Systematic Review and Meta-Analysis.** *Nature Human Behaviour*, 8, p. 2293–2303.
- [Venable et al. (2016)](referencias.md#ref-venable2016feds): John Venable; Jan Pries-Heje; Richard Baskerville (2016). **FEDS: A Framework for Evaluation in Design Science Research.** *European Journal of Information Systems*, 25(1), p. 77–89.
- [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased): Feng Wang; Michael J. Hannafin (2005). **Design-Based Research and Technology-Enhanced Learning Environments.** *Educational Technology Research and Development*, 53(4), p. 5–23.
- [Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated): Barry J. Zimmerman (2002). **Becoming a Self-Regulated Learner: An Overview.** *Theory Into Practice*, 41(2), p. 64–70.

<!-- referências locais: fim -->
