# Contribuição e originalidade do AraLearn

## 1. O que significa contribuição em pesquisa orientada a design

Uma contribuição não é sinônimo de funcionalidade nova. Em pesquisa orientada
à construção de artefatos, pode haver contribuição em pelo menos quatro níveis:

1. **artefato**: sistema, método ou modelo concretamente implementado;
2. **conhecimento de design**: explicação sobre como e em que condições uma
   solução pode enfrentar uma classe de problemas;
3. **instrumento de investigação**: contratos, rubricas, corpora ou protocolos
   que permitem examinar o fenômeno;
4. **resultado empírico**: evidência produzida pela avaliação do artefato.

Design Science Research trata relevância do problema, rigor do conhecimento
utilizado, construção e avaliação como atividades relacionadas
([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)). Uma contribuição de design ganha
força quando ultrapassa a descrição da instância e explicita princípios,
contextos e limites de transferência ([Gregor e Hevner (2013)](referencias.md#ref-gregor2013positioning)). Ciclos de
Design-Based Research também valorizam refinamento em situações educacionais e
produção de conhecimento associado ao desenho, sem supor que uma intervenção
funcione igualmente em qualquer contexto ([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased)).

O AraLearn pode ser descrito como artefato implementado. Sua originalidade
pedagógica, sua utilidade em uso e sua eficácia de aprendizagem permanecem
questões empíricas até que sejam avaliadas com métodos compatíveis.

Neste documento, **kernel** é o núcleo comum que coordena o aplicativo;
**package** é um módulo de recurso com contrato e renderização próprios;
**workspace** é um espaço de trabalho com membros e permissões locais; e
**inteligência artificial (IA)** designa os modelos e serviços usados para
assistir a autoria. A expressão **local-first** designa a arquitetura em que a
cópia local sustenta a operação corrente e a sincronização com o servidor não
bloqueia o gesto do usuário.

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
conteúdo, renderização de representações, prática, estudo offline, edição
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

A solução precisa preservar separação de responsabilidades, operação móvel e
offline, autoria compreensível, expansão do catálogo e rastreabilidade entre
decisão pedagógica e materialização.

### Decisão

O AraLearn investiga uma configuração integrada composta por:

- modelo didático de progressão sem quantidade fixa de cards;
- catálogo semântico de recursos de card;
- packages especializados e independentes de um kernel comum;
- contratos recuperados sob demanda depois da escolha da representação;
- práticas situadas dentro do objeto quando a operação assim exige;
- estudo local-first com sincronização assíncrona;
- autoria de curso e reparo contextual em escalas distintas;
- permissões locais, proveniência e versões reversíveis;
- política de dados orientada pela finalidade, sem telemetria comportamental
  automática.

### Fundamentação

A configuração articula problemas tratados por literaturas diferentes:
representações externas ([Ainsworth (2006)](referencias.md#ref-ainsworth2006deft)), carga cognitiva
([Sweller (1988)](referencias.md#ref-sweller1988cognitiveload); [Sweller et al. (1998)](referencias.md#ref-sweller1998architecture)), recuperação e prática
distribuída ([Karpicke e Roediger (2008)](referencias.md#ref-karpicke2008retrieval); [Cepeda et al. (2006)](referencias.md#ref-cepeda2006distributed)), feedback
([Shute (2008)](referencias.md#ref-shute2008feedback); [Carless e Boud (2018)](referencias.md#ref-carless2018feedbackliteracy)), autorregulação
([Zimmerman (2002)](referencias.md#ref-zimmerman2002selfregulated); [Panadero (2017)](referencias.md#ref-panadero2017selfregulated)), interação humano–IA
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai); [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)) e governança de dados
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
atribuir efeitos a um mecanismo. Não se afirma que a combinação seja única,
superior ou eficaz. A originalidade precisa ser sustentada por revisão do
estado da arte; a utilidade e os efeitos precisam ser sustentados por avaliação.

## 4. Contribuições potenciais

### C1 — arquitetura extensível de recursos de card

**Problema.** Contratos monolíticos e renderizadores centrais tornam a inclusão
de uma nova representação uma refatoração transversal.

**Alternativas e requisitos.** Manter um mecanismo central de renderização, distribuir módulos
sem interface comum ou adotar packages autodescritivos. A extensão precisa
preservar isolamento, validação e integração previsível.

**Decisão.** Packages autodescritivos reúnem esquema de validação, mecanismo de renderização, catálogo,
autoria, prática e testes sob um kernel comum.

**Fundamentação.** A decisão aplica separação de responsabilidades ao problema
de um artefato extensível; sua relevância e avaliação seguem a lógica de DSR
([Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Peffers et al. (2007)](referencias.md#ref-peffers2007dsrm)).

**Operacionalização.** Cada package registra contrato, mecanismo de
renderização, descrição de descoberta, campos editáveis e testes; o kernel
consome essa interface comum.

**Consequências.** A contribuição potencial é um padrão arquitetural para integrar representações
acadêmicas heterogêneas sem expor detalhes geométricos à autoria.

**Limites e evidência.** Devem ser medidos dependências, esforço de inclusão, estabilidade do
kernel, exemplos de extensão independente e comparação com alternativa
monolítica. Código funcional demonstra a instância, não a generalidade do
padrão.

### C2 — descoberta progressiva de contratos para autoria assistida

**Problema.** Enviar todos os esquemas de validação simultaneamente aumenta contexto e
dificulta escolher a representação pela intenção.

**Alternativas e requisitos.** Fornecer contrato monolítico, exigir nome exato
do package ou recuperar progressivamente catálogo e contrato. A autoria precisa
encontrar uma intenção sem conhecer a sintaxe antecipadamente.

**Decisão.** A autoria consulta descrições e facetas, escolhe o tipo e só então
recebe seu contrato.

**Fundamentação.** Recuperação de informação externa pode condicionar a geração,
mas permanece sujeita a erros de busca, interpretação e uso ([Lewis et al. (2020)](referencias.md#ref-lewis2020rag)).

**Operacionalização.** A consulta retorna intenção, operações, limitações e
facetas; uma segunda operação fornece apenas o contrato selecionado.

**Consequências.** A contribuição potencial é um método de recuperação
progressiva de ferramentas representacionais com menor contexto inicial.

**Limites e evidência.** Precisão da seleção, custo de contexto, incidência de
contrato inadequado, retrabalho e comparação com catálogo monolítico. O simples
funcionamento da busca não demonstra melhor decisão.

### C3 — modelo didático operacional de microssequência

**Problema.** Um card curto pode permanecer condensado, e uma quantidade fixa
de teoria ou prática pode ignorar complexidade e conhecimento prévio.

**Alternativas e requisitos.** Fixar tamanho, resumir para caber ou dimensionar
a sequência por pré-requisitos, relações e evidência de aprendizagem. É preciso
preservar profundidade e coerência.

**Decisão.** A microssequência declara objetivo, pré-requisitos, progressão,
exemplos, práticas e retomadas antes de materializar quantidade de cards.

**Fundamentação.** Segmentação e microlearning possuem efeitos e definições
heterogêneos; não oferecem uma cota universal ([Rey et al. (2019)](referencias.md#ref-rey2019segmenting); [De Gagne et al. (2019)](referencias.md#ref-degagne2019microlearning)).

**Operacionalização.** Blueprint, rubrica e auditoria verificam cobertura entre
teoria, exemplo, prática e feedback.

**Consequências.** A contribuição potencial é um modelo operacional que distingue microteoria de
resumo e associa granularidade à suficiência pedagógica.

**Limites e evidência.** Exigem-se confiabilidade da rubrica, julgamento de especialistas,
compreensão por novatos, retenção, transferência e casos em que a segmentação
fragmenta relações. A base externa não valida automaticamente esse modelo.

### C4 — prática incorporada a representações disciplinares

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

**Operacionalização.** O package declara alvos, respostas e feedback; o package
de resposta controla estado e confirmação sem modificar a topologia. Lacunas
que integram a mesma correspondência conservam opções e estado próprios.

**Consequências.** A contribuição potencial é um mecanismo para coordenar representação
especializada e resposta sem descaracterizar a notação.

**Limites e evidência.** Devem ser examinadas independência de alvos, correção do contrato,
interpretação por estudantes e comparação com resposta externa. Benefícios de
recuperação não demonstram que qualquer lacuna seja válida.

### C5 — autoria em duas escalas com escopo explícito

**Problema.** Construir um curso inteiro e reparar um rótulo são tarefas de
escala, risco e contexto diferentes.

**Alternativas e requisitos.** Usar o mesmo fluxo para tudo, separar completamente
as ferramentas ou coordenar autoria estrutural e reparo contextual. O escopo
precisa ser visível, validável e reversível.

**Decisão.** Autoria estrutural planeja e compõe por meio de catálogo e
contratos; edição contextual mantém o card visível, expõe apenas textos
graváveis e permite diálogo iterável e reversão.

**Fundamentação.** Interação humano–IA requer limites compreensíveis, correção e
controle efetivo ([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai); [Buçinca et al. (2021)](referencias.md#ref-bucinca2021overreliance)).

**Operacionalização.** Contexto somente leitura, campos graváveis, histórico
curto, validação e versões locais são camadas distintas.

**Consequências.** A contribuição potencial é um modelo de coordenação entre autoria ampla e
reparo localizado com assistência de modelos de linguagem.

**Limites e evidência.** Devem ser medidos erro de escopo, qualidade da mudança, retrabalho,
compreensão, controle percebido e capacidade de desfazer. Diretrizes de
interação não garantem que os controles sejam compreendidos.

### C6 — continuidade local-first e sincronização não bloqueante

**Problema.** Estudo móvel pode ocorrer sem conexão estável; ações locais não
devem depender da latência da rede.

**Alternativas e requisitos.** Operação centrada no servidor, cache parcial ou
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

**Limites e evidência.** São necessários testes offline, latência, conflitos, consumo de
armazenamento e tarefas reais de interrupção e retomada. Funcionamento offline
é resultado técnico; menor esforço de retomada é hipótese.

### C7 — governança local, proveniência e dados proporcionais

**Problema.** Papéis globais e telemetria abundante podem obscurecer
responsabilidade e produzir inferências sem validade.

**Alternativas e requisitos.** Poder global, isolamento individual ou
capacidades locais; coleta ampla ou dados definidos pela finalidade. A solução
precisa permitir revogação, atribuição e proporcionalidade.

**Decisão.** Workspaces isolam capacidades revogáveis; mudanças mantêm
proveniência; indicadores não são coletados sem pergunta e intervenção
definidas.

**Fundamentação.** Ética de analytics exige finalidade, transparência e
responsabilidade ([Pardo e Siemens (2014)](referencias.md#ref-pardo2014ethical); [Prinsloo e Slade (2017)](referencias.md#ref-prinsloo2017ethics)).

**Operacionalização.** Capacidades são calculadas no workspace, mudanças recebem
autoria e a ficha de indicador antecede qualquer coleta comportamental.

**Consequências.** A contribuição potencial é uma política integrada de colaboração, autoria e
minimização de dados para ambiente educacional.

**Limites e evidência.** Devem ser examinados isolamento, reconstrução de autoria, compreensão de
papéis, custo de armazenamento, proporcionalidade e análise de efeitos
adversos. A fundamentação ética não prova que a política adotada seja suficiente.

### C8 — instrumentos reprodutíveis de auditoria

**Problema.** Qualidade pedagógica, fidelidade representacional e correção
técnica podem ser confundidas em uma única afirmação de “qualidade”.

**Alternativas e requisitos.** Usar um selo único, manter avaliações isoladas ou
ligar instrumentos por uma matriz de evidências. Cada resultado precisa de
definição e inferência próprias.

**Decisão.** Rubricas, matrizes, casos de estresse e protocolos separam
conformidade, julgamento de especialista, usabilidade e aprendizagem.

**Fundamentação.** DBR e DSR distinguem intervenção situada, artefato e
conhecimento de design ([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased); [Hevner et al. (2004)](referencias.md#ref-hevner2004designscience); [Venable et al. (2016)](referencias.md#ref-venable2016feds)).

**Operacionalização.** Cada instrumento declara unidade, pergunta, versão,
procedimento, interpretação permitida e limite.

**Consequências.** A contribuição potencial é um conjunto de instrumentos para investigar
artefatos educacionais com autoria assistida e representações especializadas.

**Limites e evidência.** São necessárias definições operacionais, confiabilidade entre
avaliadores, sensibilidade a defeitos conhecidos e uso por equipes externas.

## 5. Relação com classes de sistemas existentes

O valor de uma contribuição integrada só pode ser avaliado por comparação
explícita. A tabela organiza classes funcionais; não afirma ausência dessas
combinações em produtos ou estudos existentes.

| Classe | Capacidade frequentemente central | Questão comparativa para o AraLearn |
| --- | --- | --- |
| sistema de gestão da aprendizagem (LMS) | matrícula, distribuição, atividade e registro institucional | o modelo de workspace e curso preserva governança sem burocratizar o estudo? |
| flashcards e prática | recuperação, repetição e feedback curto | microssequência e recursos estruturados acrescentam profundidade sem perder fluidez? |
| ferramentas de autoria | edição visual e publicação | catálogo progressivo e contratos tornam escolhas representacionais mais coerentes? |
| bibliotecas de visualização | renderização especializada | packages integram convenção, prática, edição e acessibilidade além da figura isolada? |
| aplicações local-first | réplica, fila e sincronização | a arquitetura mantém continuidade e resolve conflitos com custo proporcional? |
| assistência por modelo de linguagem | geração e transformação de conteúdo | escopo explícito, validação e reversão reduzem mudanças indevidas sem criar controle apenas simbólico? |
| learning analytics | descrição, previsão e intervenção | que perguntas úteis podem ser respondidas com dados mínimos e participação explícita? |

Uma revisão comparativa deve definir corpus, critérios de inclusão, data de
busca e unidade de comparação. “Não foi encontrado” é diferente de “não
existe”.

## 6. Níveis de alegação

### 6.1 Alegações sustentáveis por inspeção e teste técnico

Quando acompanhadas de evidência reproduzível, podem ser afirmadas propriedades
como:

- existência de kernel e packages separados;
- descoberta de catálogo antes da recuperação do contrato;
- validação de esquemas de dados e escopo de edição;
- operação offline nos cenários testados;
- reversão segundo o fluxo implementado;
- ausência de recorte ou sobreposição nos casos geométricos avaliados.

### 6.2 Alegações que exigem avaliação de uso

Não podem ser inferidas apenas do código:

- pessoas leigas compreendem catálogo, recursos, papéis e reversão;
- autoria assistida reduz retrabalho;
- retomada local reduz atrito;
- workspaces tornam responsabilidade compreensível;
- observações situadas produzem ação útil.

### 6.3 Alegações que exigem avaliação de aprendizagem

Exigem medidas compatíveis de compreensão, retenção ou transferência:

- microssequências melhoram aprendizagem;
- um recurso reduz carga cognitiva extrínseca;
- práticas internas produzem recuperação mais efetiva;
- feedback melhora desempenho posterior;
- o desenho não punitivo altera estratégia ou ansiedade.

### 6.4 Alegações que permanecem indevidas sem comparação abrangente

- o AraLearn é o primeiro ou único sistema com essa configuração;
- a arquitetura é universalmente superior;
- mais packages produzem cursos melhores;
- conteúdo gerado ou reparado por modelo é correto por ter esquema de dados válido;
- ausência de telemetria é suficiente para garantir justiça ou privacidade;
- uma preferência visual reduz carga cognitiva para todas as pessoas.

## 7. Resultados contrários e contribuição negativa

Conhecimento de design também pode surgir quando uma solução não funciona.
Exemplos relevantes incluem:

- package cuja convenção não é compreendida;
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
