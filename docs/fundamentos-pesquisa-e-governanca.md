# Fundamentos, pesquisa e governança

## Função deste documento

Este é o ponto de entrada do corpus acadêmico-pedagógico do AraLearn. O
produto é simultaneamente um artefato técnico, uma intervenção educacional em
desenvolvimento e um possível objeto de investigação. Essas três condições não
se confundem: uma propriedade implementada não constitui, por si só, evidência
de aprendizagem; uma decisão de design não se torna teoria; e uma hipótese
plausível não se torna resultado antes de avaliação.

A documentação foi organizada para poder sustentar um projeto de dissertação
ou tese sem transformar memória de produto em conclusão científica. A
bibliografia canônica está em [referencias.bib](referencias.bib), e toda
afirmação de eficácia permanece condicionada ao [protocolo de avaliação do
artefato](protocolo-avaliacao-artefato.md).

## Mapa do corpus para uma dissertação ou tese

| Função no trabalho acadêmico | Documento principal | Evidência que deve acompanhar | Limite de uso |
| --- | --- | --- | --- |
| problema, contexto e delimitação | este documento | caracterização do público e do contexto de estudo | não generalizar a qualquer estudante ou instituição |
| revisão do conhecimento disponível | [Revisão de literatura](revisao-de-literatura.md) | estratégia de busca e tabela de fontes da investigação | a revisão atual é narrativa e orientada ao design |
| modelo conceitual e proposições | [Quadro teórico](quadro-teorico.md) | definição de construtos e relações testáveis | proposições são hipóteses, não fatos |
| definições operacionais | [Glossário de construtos](glossario-construtos.md) | fonte, manifestação e interpretação proibida | nomes da interface não são construtos científicos |
| teoria → design → observação | [Matriz de rastreabilidade pedagógica](matriz-rastreabilidade-pedagogica.md) | requisito, mecanismo, código, teste e instrumento | teste de software não demonstra efeito pedagógico |
| método de construção e avaliação | [Protocolo de avaliação](protocolo-avaliacao-artefato.md) | episódios DBR e DSR versionados | DBR e DSR são complementares, não sinônimos |
| contribuição e novidade | [Contribuição e originalidade](contribuicao-originalidade.md) | comparação, avaliação e casos negativos | não alegar primazia sem busca comparativa |
| conformidade técnica | [Matriz de conformidade técnica](matriz-conformidade-tecnica.md) | código, schemas, testes e artefatos de implantação | conformidade técnica não equivale a validade pedagógica |
| memória operacional | manual privado versionado | decisões, incidentes e mudanças de versão | não citar como literatura científica |

Uma estrutura possível de capítulos é: (1) problema e contexto; (2) revisão de
literatura; (3) quadro teórico e proposições; (4) método DBR/DSR; (5) desenho e
implementação do artefato; (6) episódios de avaliação; (7) discussão e limites;
(8) contribuição e agenda futura. O código e os testes entram como evidência da
construção e da conformidade do artefato; dados de participantes entram somente
nos capítulos de avaliação, sob protocolo ético aprovado.

## Estados epistêmicos obrigatórios

O corpus usa seis rótulos. Eles devem aparecer em notas de pesquisa, matrizes e
relatos de ciclo sempre que houver risco de ambiguidade.

| Rótulo | Significado | Exemplo permitido |
| --- | --- | --- |
| **Evidência externa** | resultado publicado ou síntese de literatura, com população, tarefa e limites próprios | prática de recuperação costuma beneficiar retenção em condições estudadas |
| **Inferência teórica** | relação argumentada entre evidências e o contexto do AraLearn | retomada visível pode reduzir custo operacional após interrupção |
| **Hipótese de design** | proposição falseável sobre contexto, mecanismo e resultado | um cursor local pode facilitar a retomada de uma sessão móvel |
| **Decisão de produto** | escolha normativa ou arquitetural vigente | não usar tempo em tela como proxy de atenção |
| **Propriedade implementada** | comportamento demonstrável por código, inspeção ou teste | o estudo sincronizado permanece disponível offline |
| **Resultado empírico** | achado produzido por episódio de avaliação descrito | participantes de uma amostra concluíram determinada tarefa sob certas condições |

Ausência de rótulo não autoriza promoção automática. Em particular,
“funciona”, “melhora”, “reduz” e “favorece” exigem sujeito, comparação, medida,
contexto e fonte. Quando a relação ainda não foi avaliada, deve-se escrever
“pretende”, “pode” ou “hipótese a testar”.

## Objeto, contexto e delimitação

O AraLearn investiga uma plataforma móvel e local-first para estudo e autoria
de cursos estruturados em percursos, microssequências, cards e representações
especializadas. O caso prioritário é o estudante adulto que concilia trabalho
e estudo, usa celular, enfrenta interrupções e pode perder conectividade. Essa
caracterização é uma delimitação de design; deve ser confirmada empiricamente
na população de cada estudo.

O problema não é somente disponibilizar informação. É tornar explícitos o
percurso, os pré-requisitos, a prática e a possibilidade de retomada sem
condensar teoria a ponto de ocultar fundamentos. No AraLearn,
**microssequência** e **microteoria** são termos operacionais: não designam uma
dose universal nem autorizam a fragmentação de conceitos. A literatura de
segmentação mostra efeitos moderados por tarefa e desenho (Rey et al., 2019), e
a literatura de microlearning permanece heterogênea (De Gagne et al., 2019).

## Questão central e subquestões

A formulação de trabalho, ainda revisável antes de registro do estudo, é:

> Como uma plataforma móvel, local-first e orientada por representações pode
> ser projetada e avaliada para apoiar estudo e autoria em contextos de tempo
> fragmentado e conectividade variável, preservando coerência pedagógica,
> agência humana e responsabilidade sobre IA?

Subquestões possíveis, todas abertas:

1. **RQ1 — desenho pedagógico:** como tamanho, progressão e combinação de
   explicação, exemplo, prática e feedback afetam compreensão, retenção e
   transferência, considerados separadamente?
2. **RQ2 — representação:** em que condições um resource especializado reduz
   traduções desnecessárias sem criar carga extrínseca ou exigir gramática
   visual não ensinada?
3. **RQ3 — continuidade:** como offline, retomada e orientação mobile afetam a
   capacidade de continuar uma atividade após interrupção?
4. **RQ4 — autoria e IA:** como escopo explícito, contratos e reversibilidade
   afetam controle percebido, qualidade autoral e retrabalho?
5. **RQ5 — governança:** quais dados, papéis e intervenções são úteis sem
   converter rastros ambíguos em vigilância ou diagnóstico indevido?

Essas perguntas não precisam compor um único estudo. Uma dissertação pode
delimitar uma ou duas; uma tese pode articulá-las em programa de episódios.

## Duas tradições metodológicas complementares

### Design-Based Research — DBR

DBR é usada para investigar uma intervenção educacional em contexto autêntico,
por ciclos de análise, desenho, implementação e revisão com participantes e
atores da prática. O produto esperado não é apenas uma interface corrigida,
mas explicações situadas sobre **como**, **para quem**, **quando** e **por que**
um mecanismo contribuiu ou falhou. Design-Based Research Collective (2003) e
Wang e Hannafin (2005) fundamentam essa trilha.

No AraLearn, DBR é a trilha adequada para microssequências, compreensão de
representações, retomada no cotidiano, feedback, agência e práticas de autoria.
Ela requer contexto real, participação, dados qualitativos e quantitativos
coerentes com a pergunta e registro das mudanças entre ciclos.

### Design Science Research — DSR

DSR é usada para construir e avaliar o artefato e o conhecimento de design que
ele incorpora. Hevner et al. (2004), Peffers et al. (2007), Gregor e Hevner
(2013) e Venable et al. (2016) ajudam a distinguir problema, objetivos,
artefato, demonstração, avaliação e contribuição.

No AraLearn, DSR é a trilha adequada para kernel e packages, contrato de curso,
catálogo progressivo de resources, persistência local-first, escopo de autoria,
validação e frugalidade. Testes automatizados sustentam correção e
conformidade; utilidade educacional e uso real exigem episódios adicionais.

### Como as trilhas se encontram

```text
DBR: problema educacional situado → intervenção → uso autêntico → explicação
                                      ↕
DSR: problema do artefato → construção → demonstração → avaliação → contribuição
```

Uma mudança pode pertencer às duas trilhas, mas os produtos de evidência não
são intercambiáveis. Um teste visual pode demonstrar ausência de sobreposição;
somente uma tarefa com participantes pode informar se a representação foi
compreendida; e somente uma medida posterior pode informar retenção.

## Fundamentos que orientam, sem determinar, o design

### Carga, segmentação e representações

A teoria da carga cognitiva distingue demandas inerentes à tarefa das demandas
criadas pelo desenho (Sweller, 1988; Sweller et al., 1998). DeFT trata múltiplas
representações por suas funções, restrições e tarefas (Ainsworth, 2006).
Contiguidade e segmentação podem apoiar integração, mas não tornam qualquer
imagem ou card curto pedagogicamente bom (Ginns, 2006; Rey et al., 2019).

**Decisão de produto:** um resource só se justifica quando sua estrutura
preserva uma operação acadêmica que texto linear ou package mais geral não
representaria com a mesma precisão. **Hipótese:** a seleção por intenção e a
renderização canônica podem reduzir tradução mental; isso ainda requer
comparação por tarefa e domínio.

### Aprendizagem inicial, recuperação e distribuição

Exemplos resolvidos e retirada gradual de apoio podem beneficiar aprendizes
novatos em tarefas complexas (Sweller & Cooper, 1985; Renkl et al., 2004).
Prática de recuperação e distribuição possuem respaldo amplo, mas efeitos
dependem do conteúdo, formato, conhecimento prévio, intervalo e feedback
(Cepeda et al., 2006; Agarwal et al., 2021; Carpenter et al., 2022).
Intercalação não é sinônimo de espaçamento e apresenta moderadores próprios
(Brunmair & Richter, 2019).

**Decisão de produto:** planejamento pedagógico antecede quantidade de cards e
resources. Teoria não é resumida para caber num número fixo; práticas variam
conforme os gestos cognitivos necessários. **Hipótese:** uma microssequência
coerente pode articular explicação progressiva, apoio, recuperação e feedback.

### Agência, mediação e feedback

Autorregulação envolve planejamento, desempenho e reflexão, não apenas
liberdade de navegação (Zimmerman, 2002; Panadero, 2017). Controle do aprendiz
tem resultados heterogêneos (Karich et al., 2014). Feedback depende da
informação, da interpretação e da possibilidade de ação (Hattie & Timperley,
2007; Carless & Boud, 2018; Morris et al., 2021).

**Decisão de produto:** o estado de estudo é não punitivo; tentativas, tempo e
respostas reveladas não se transformam em nota ou diagnóstico. Essa é uma
política normativa. Não deve ser apresentada como evidência de que ansiedade
foi reduzida.

### IA, analytics e governança

Geração apoiada por recuperação pode restringir contexto, mas não garante
verdade (Lewis et al., 2020). Diretrizes de interação humano-IA recomendam
comunicar limites, permitir correção e sustentar controle humano (Amershi et
al., 2019); funções de fricção podem reduzir confiança automática em certos
contextos (Buçinca et al., 2021). UNESCO (2023) e NIST (2024) situam
responsabilidade, privacidade e avaliação de risco.

Learning analytics exige finalidade, transparência, proporcionalidade e
possibilidade de ação (Pardo & Siemens, 2014; Prinsloo & Slade, 2017). **Decisão
de produto:** só se coleta dado associado a pergunta e intervenção declaradas;
clique e tempo não são proxies de atenção, esforço ou aprendizagem.

## Proveniência do corpus

O repositório histórico
[ARA-pre-consolidation](https://github.com/fabio-ara/ARA-pre-consolidation)
foi usado como corpus de descoberta. Suas sínteses e bibliografias registram
hipóteses acumuladas e trilhas de busca, não decisões vigentes. Nesta
consolidação, uma referência só foi promovida para
[referencias.bib](referencias.bib) após conferência de DOI, ISBN ou URL
persistente; implicações antigas foram reclassificadas como evidência externa,
inferência, hipótese, decisão ou lacuna.

Para uma revisão de escopo formal, o protocolo deve seguir JBI e PRISMA-ScR
(Peters et al., 2024; Tricco et al., 2018), com bases, strings, datas,
duplicatas, seleção, avaliação crítica e fluxograma preservados fora do código
do produto.

## Limitações e lacunas atuais

- a revisão atual é narrativa e orientada ao design, não sistemática;
- ainda não há comparação exaustiva com LMS, flashcards, tutores, ferramentas
  autorais, sistemas local-first e catálogos extensíveis de representações;
- a população prioritária precisa ser caracterizada empiricamente;
- não há evidência consolidada de aprendizagem produzida pelo AraLearn;
- a validade entre áreas do conhecimento e níveis de formação permanece
  aberta;
- modelos de IA, provedores, prompts e conhecimento recuperado podem mudar
  entre ciclos;
- qualidade visual, correção de schema e cobertura de testes não demonstram
  adequação acadêmica nem compreensão;
- frugalidade de armazenamento e custo precisa ser medida longitudinalmente;
- participação institucional, autoria coletiva e riscos de poder exigem
  estudos próprios.

## Regra de governança científica

Toda mudança relevante deve deixar quatro rastros separados:

1. **decisão operacional**, no manual privado;
2. **implementação**, no código, schemas e testes;
3. **justificação**, na matriz pedagógica e na literatura;
4. **avaliação**, no protocolo e nos dados autorizados do estudo.

Não se deve preencher retrospectivamente uma justificativa para legitimar uma
decisão. Quando a evidência não sustenta diretamente o mecanismo, registra-se a
inferência e testa-se a hipótese. Resultados negativos, abandono de recursos e
limites de transferência são contribuições do programa de pesquisa, não falhas
documentais a ocultar.
