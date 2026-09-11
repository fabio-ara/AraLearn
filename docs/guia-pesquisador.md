# Guia de investigação

O AraLearn é um artefato técnico de pesquisa em design instrucional e tecnologia
educacional. Nele, a autoria assistida por inteligência artificial (IA) produz
cursos que podem ser inspecionados, revisados e estudados no celular. Uma
investigação pode examinar o desenho desses cursos, o trabalho de autoria ou a
aprendizagem durante o uso; cada pergunta exige evidências próprias.

A configuração registra as escolhas de desenho, e a área **Analytics** apresenta
contagens do conteúdo salvo e das intervenções observáveis. Esses dados ajudam
a caracterizar o artefato apresentado aos participantes. A amostra, os
instrumentos e o modo de comparar resultados pertencem ao protocolo do estudo.

Para situar a pergunta, consulte [Visão do produto](visao-do-produto.md),
[Modelo didático](modelo-didatico.md), [Desenho instrucional
parametrizado](desenho-instrucional-parametrizado.md), [Analytics da
autoria](analytics-instrucionais.md) e [Capacidades atuais](estado-atual-e-roadmap.md).

## Classificar a afirmação

Toda afirmação deve ser identificada como:

- evidência externa da literatura;
- decisão de desenho do AraLearn;
- propriedade implementada e verificável;
- hipótese sujeita a investigação;
- resultado empírico produzido por um estudo adequado.

Por exemplo, um teste pode demonstrar que duas oportunidades de prática foram
gravadas e variam em dimensões declaradas. Isso não demonstra que uma pessoa
aprendeu ou transferiu conhecimento.

O mesmo vale para a [explicação compartilhada](explicacao-e-revisao-humana.md):
testes podem confirmar acesso ao apoio, preservação da resposta e rejeição de
uma aprovação obsoleta. Não demonstram que a pessoa leu, compreendeu ou usou
adequadamente a ajuda. Uma investigação desse desenho precisa examinar o
conjunto de unidades e apoio, seus pressupostos e fontes e a situação de revisão
do material, sem tratar abertura do painel de apoio ou aprovação autoral como desfecho
de aprendizagem. O produto não acrescenta coleta de pesquisa para isso.

## Escolher unidade de análise e medida

A unidade de análise da pesquisa é aquilo sobre o que a conclusão será feita:
por exemplo, uma pessoa, uma tarefa, uma sessão de autoria ou um curso sob certa
condição. Declare essa unidade, o momento da observação e os casos ausentes
antes de calcular ou interpretar. Declare também o denominador: duas correções
entre duas unidades elegíveis têm significado diferente de duas entre duzentas.

As contagens precisam conservar seu objeto. Quantidade de mudanças do assistente
descreve intervenções, não qualidade autoral. Conformidade das unidades descreve
o artefato, não o desempenho do estudante. Tempo de resposta e armazenamento de
arquivos caracterizam condições técnicas de uso.

## Examinar a inspeção humana e o vínculo com fontes

Para estudar a autoria assistida, observe se a pessoa consegue relacionar uma
afirmação à [fonte e ao trecho pertinente](fontes-e-citacoes.md), julgar a
adequação do material e explicar por que aceita, modifica ou rejeita a proposta.
Inclua casos em que o texto é fluente e estruturalmente válido, mas contém erro
factual, fonte insuficiente ou atribuição indevida. As diretrizes de interação
entre pessoas e IA fundamentam oferecer meios de correção; verificar se esses
meios são usados exige tarefas e observação
([Amershi et al. (2019)](referencias.md#ref-amershi2019humanai)).

A autorização para produzir ou corrigir delimita o trabalho do assistente. A
[declaração de revisão autoral](explicacao-e-revisao-humana.md) registra outro
ato: a pessoa afirma ter inspecionado o conteúdo salvo identificado. Avalie
separadamente a qualidade da inspeção, o tratamento dos erros e a compreensão
dessa declaração. A revisão feita pelo assistente não substitui esse ato humano.
Ao investigar esse trabalho, registre também como a IA participou da própria pesquisa e quais
procedimentos conferiram suas fontes e resultados, conforme as orientações
para a pós-graduação do
[Brasil. Ministério da Educação (2026)](referencias.md#ref-mec2026iaeducacao), pp. 175–179.

## Fixar condições de desenho

O [catálogo de desenho](desenho-instrucional-parametrizado.md), na versão 1.2.1,
reúne doze decisões. Para planejar o conteúdo, uma **unidade de análise
instrucional** acompanha um recorte de conhecimento, como conceito ou relação;
um **requisito de evidência** declara o desempenho que uma prática deve solicitar.
Essas convenções de autoria diferem da unidade de análise escolhida pelo estudo.
Entre as decisões de conteúdo e prática estão:

1. teto de novas unidades de análise por unidade de estudo;
2. formas de explicação por unidade de análise;
3. oportunidades mínimas de prática por requisito;
4. dimensões de variação da prática.

Há também dois alvos editoriais quantitativos flexíveis:

1. palavras por resposta de autoria;
2. palavras por unidade de estudo.

Completam o catálogo a distribuição e a posição da prática, os alvos de
microssequências por parte e de partes por lote, a frequência de pausa e a
preferência de interação na conversa. Essas decisões têm alcances distintos;
o catálogo informa onde cada decisão pode ser aplicada. Não são doze medidas de aprendizagem intercambiáveis.

Os alvos servem para comparar condições de desenho. No conteúdo, também é
possível confrontar o alvo com a extensão observada da unidade de estudo. O
alvo da resposta de autoria não é uma medida de conversa observada: Analytics
não persiste transcrição. Os alvos não são mínimos ou máximos, não medem
qualidade e não autorizam ocultar decisões, retirar conteúdo, compactar
novidades nem atomizar unidades.

Direção editorial é registrada separadamente. O modo automático exige
calibração contextual pelo assistente de IA no escopo pertinente antes da produção;
não representa uma combinação fixa de valores. Para comparar uma condição, crie um curso privado
independente, fixe deliberadamente os valores pertinentes e documente o que
deve permanecer igual. Uma definição do pesquisador prevalece sobre a
calibração contextual. Não existe entidade de variante nem bloqueio
experimental.

Ao comparar teto 1 e 2, preserve o mesmo repertório semântico. O número de
unidades de estudo pode mudar; compactar unidades de análise para produzir tamanhos parecidos
destrói a condição que se pretendia comparar.

O planejamento global precede os lotes, e a autorização define o trabalho que
pode ser executado. A comparação de condições deve preservar esse processo e a
possibilidade de inspeção humana. Distribuição editorial, formas de explicação, prática e outras
dimensões já configuráveis podem ser calibradas pelo assistente de IA ou fixadas para a
pesquisa.

Fixe uma diferença de progressão ou representação quando o estudo realmente
precisar produzi-la e compará-la; mantenha as demais condições identificadas.

## Congelar o artefato quando necessário

O curso cotidiano continua mutável. Se uma investigação precisar reproduzir o
artefato apresentado a um grupo, exporte explicitamente o estado e a
configuração pertinentes e guarde-os segundo o plano de dados do estudo.

Em **Analytics**, **Exportar curso e análise** reúne o conteúdo integral salvo
do curso e a leitura quantitativa do escopo escolhido. Inclui as explicações,
suas fontes, a configuração aplicada disponível e as declarações de revisão.
A exportação conserva uma revisão consistente do curso; os arquivos PDF e áudio
permanecem referenciados, sem seus bytes. Guarde também os materiais externos,
as regras de consulta ao apoio, a data e as condições de exposição necessárias
à reprodução do estudo. Os campos e limites estão na
[referência de exportação](dicionario-metricas-datasets.md#comparação-e-exportação).

## Usar Analytics com limites claros

Analytics abre em **Novidade declarada**. Em **Escolher dimensão e escopo**,
a pessoa escolhe a propriedade observada e o recorte: curso, parte,
microssequência ou unidade de estudo. As distribuições permitem encontrar e
inspecionar unidades por seus títulos. **Abrir dados e definições** apresenta
as configurações solicitadas e aplicadas e as intervenções explícitas.

Esses dados descrevem tanto o desenho do curso — conteúdo, representações,
prática e fontes — quanto o trabalho de autoria observável, como revisões
manuais, observações e origem registrada das alterações. O
[guia de Analytics](analytics-instrucionais.md) explica cada grupo.

Quando a origem de uma intervenção não puder ser identificada, ela deve
permanecer ausente. O arquivo JSON exportado deve conter os mesmos números da
tela. Essas contagens não produzem pontuação de qualidade, colaboração, autoria
humana, aprendizagem ou atenção.

## Construir a cadeia de evidência

| Elemento | Pergunta de controle |
| --- | --- |
| problema | o que ocorre e para quem isso é um problema? |
| construto | qual conceito não observável se pretende estudar? |
| operacionalização | que regra ou unidade representa parte dele? |
| medida | que dado observável será usado e qual o denominador? |
| mecanismo | por que a intervenção poderia produzir mudança? |
| explicação rival | que outra causa produziria o mesmo resultado? |
| decisão | que resultado mudaria o desenho? |
| limite | para quais pessoas, tarefas e contextos a interpretação vale? |

Um parâmetro definido demonstra a condição registrada. Uma distribuição de
unidades demonstra o artefato produzido. Nenhum deles informa sozinho exposição,
compreensão ou efeito.

## Observações e privacidade

Observações são manifestações protegidas entre seus participantes autorizados.
Texto, alvo e contexto podem conter dados pessoais. Analytics conta estados
quando atribuíveis, mas não exporta o texto como parte da leitura quantitativa.

Antes de coletar outro dado, declare a pergunta, a inferência permitida, a
decisão legítima, a retenção, o acesso e o risco de vigilância ou coerção. O
AraLearn não coleta transcrições, instruções enviadas ao modelo, raciocínio
privado, sequências de cliques, rolagem ou tempo em tela para Analytics.

Uma reutilização científica de conteúdo, observações ou fontes exige finalidade,
minimização, governança, base adequada e avaliação de reidentificação. Dados
pseudonimizados continuam pessoais enquanto houver possibilidade razoável de
associação.

## Estratégia e validade

Pesquisa baseada em design e Design Science Research podem compartilhar
episódios, mas não são sinônimas. A primeira investiga intervenções educacionais
situadas; a segunda organiza construção e avaliação do artefato e do conhecimento
de desenho ([Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased);
[Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased);
[Hevner et al. (2004)](referencias.md#ref-hevner2004designscience)).

Para uma alegação causal, ainda são necessários população, critérios de inclusão,
consentimento, protocolo, hipóteses, regra de atribuição, instrumentos válidos,
controle de exposição e perdas, plano de análise e explicações rivais
([Shadish et al. (2002)](referencias.md#ref-shadish2002experimental)).

No Brasil, pesquisas em Ciências Humanas e Sociais com participantes ou dados
identificáveis devem observar a avaliação ética aplicável e os direitos previstos
na Resolução CNS nº 510/2016 ([Conselho Nacional de Saúde (2016)](referencias.md#ref-cns2016resolucao510)). O enquadramento nacional também inclui a [Lei nº 14.874/2024](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2024/lei/l14874.htm) e sua regulamentação pelo [Decreto nº 12.651/2025](https://www.planalto.gov.br/ccivil_03/_ato2023-2026/2025/decreto/d12651.htm). O planejamento de cada estudo considera as normas e os procedimentos aplicáveis com a instância de ética responsável, além das condições de [proteção de dados no Brasil e em Portugal](privacidade.md).

## Formular caminhos de investigação

O AraLearn permite formular perguntas diferentes sobre um mesmo artefato. A
escolha deve partir do problema e do acesso a evidências, sem pressupor um
programa de pós-graduação ou uma orientação acadêmica. A tabela apresenta
possibilidades deste projeto, inspiradas pelas relações examinadas na
[revisão de literatura](revisao-de-literatura.md) e no
[quadro teórico](quadro-teorico.md). Os autores citados não propõem estas
avaliações específicas do aplicativo.

| Pergunta possível | Enquadramento e método possível | O que observar e qual o limite |
| --- | --- | --- |
| Como educadores compreendem e revisam as decisões de um curso assistido por IA? | Desenho instrucional; adaptar a articulação de análise de materiais, questionários e grupos de discussão de [Amado et al. (2022)](referencias.md#ref-amado2022moocsdesign). Os métodos mistos combinam dados numéricos e interpretação das falas. | Cursos salvos, configurações, correções e justificativas dos participantes. Concordância com um modelo de autoria não demonstra aprendizagem nem valida seus usos em todos os públicos. |
| Como a pessoa retoma o estudo, procura ajuda e decide o próximo passo? | Autorregulação; observar sessões em contexto e recolher breves relatos sobre planejamento, ação e reflexão. A relação entre IA e essas estratégias é discutida por [Ferreira e Pedrosa (2024)](referencias.md#ref-ferreira2024iaautorregulacao). | Percurso escolhido, uso da explicação e razões para alterar a estratégia. O desenho do curso oferece oportunidades; as contagens do produto não revelam o processo mental. Interrupções e conhecimento prévio precisam ser considerados. |
| Em que condições a revisão humana identifica e corrige erros da IA? | Interação pessoa–IA e confiança calibrada; usar tarefas com propostas corretas e incorretas, avaliação independente e observação da conferência das fontes. | Qualidade da decisão e do conteúdo corrigido, incluindo aceitações e rejeições indevidas. A diferença entre confiança e uso da ferramenta é desenvolvida na [revisão](revisao-de-literatura.md#confiança-calibrada-e-viés-de-automação). Familiaridade, tempo e domínio do assunto podem explicar resultados. |
| Que finalidades e relações de poder se formam numa adoção institucional? | Estudo de caso com análise de orientações institucionais, entrevistas e situações de uso; empregar as [lentes críticas sobre informação e poder](quadro-teorico.md#lentes-críticas-sobre-informação-e-poder) para formular perguntas, sem antecipar respostas. | Quem escolhe temas, fontes e critérios; como números são interpretados; possibilidades de discordar, pausar e recusar usos. A intenção do produto não demonstra emancipação, e a presença de registros não demonstra vigilância institucional. |

Um estudo inicial pode selecionar apenas um desses caminhos e aprofundá-lo.
Combinar observação, material produzido e relato ajuda a confrontar versões
divergentes do mesmo episódio. Se a pergunta mudar de compreender um processo
para atribuir um efeito à intervenção, o desenho também precisa mudar: será
necessário justificar comparação, instrumentos e explicações alternativas.
Uma agenda futura emerge dos limites e resultados do estudo realizado,
inclusive quando eles contradizem a expectativa de design.

## Relatar

Separe no relatório:

- o que a literatura sustentava;
- o que foi decisão de produto;
- qual propriedade o software verificou;
- o que o estudo observou;
- quais explicações rivais permanecem;
- quais alterações ocorreram depois do recorte.

Preserve resultados negativos e divergências. Não apresente valor padrão como
evidência, condição registrada como randomização nem contagem descritiva como
efeito.

Consulte o [protocolo de avaliação do artefato](protocolo-avaliacao-artefato.md)
e os [fundamentos de pesquisa e governança](fundamentos-pesquisa-e-governanca.md).

<!-- referências locais: início -->

## Referências

- [Amado et al. (2022)](referencias.md#ref-amado2022moocsdesign): Carolina Amado; Nuno Dorotea; Ana Pedro; João Piedade (2022). **MOOCs Design: A Conceptual Framework for Continuous Teacher Training in Portugal.** *Education Sciences*, 12(5), p. 308.
- [Amershi et al. (2019)](referencias.md#ref-amershi2019humanai): Saleema Amershi; Dan Weld; Mihaela Vorvoreanu; Adam Fourney; Besmira Nushi; Penny Collisson; Jina Suh; Shamsi Iqbal; Paul N. Bennett; Kori Inkpen; Jaime Teevan; Ruth Kikin-Gil; Eric Horvitz (2019). **Guidelines for Human-AI Interaction.** In: *Proceedings of the 2019 CHI Conference on Human Factors in Computing Systems*, p. 1–13.
- [Brasil. Ministério da Educação (2026)](referencias.md#ref-mec2026iaeducacao): Brasil. Ministério da Educação (2026). **Referencial para Desenvolvimento e Uso Responsáveis de Inteligência Artificial na Educação.** Ministério da Educação.
- [Conselho Nacional de Saúde (2016)](referencias.md#ref-cns2016resolucao510): Conselho Nacional de Saúde (2016). **Resolução nº 510, de 7 de abril de 2016.** Conselho Nacional de Saúde.
- [Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased): Design-Based Research Collective (2003). **Design-Based Research: An Emerging Paradigm for Educational Inquiry.** *Educational Researcher*, 32(1), p. 5–8.
- [Ferreira e Pedrosa (2024)](referencias.md#ref-ferreira2024iaautorregulacao): Adriano Ferreira; Daniela Pedrosa (2024). **Uso da inteligência artificial para apoiar a autorregulação de aprendizagem: uma revisão de literatura.** *PRATICA – Revista Multimédia de Investigação em Inovação Pedagógica e Práticas de e-Learning*, 7(2), p. 101–111.
- [Hevner et al. (2004)](referencias.md#ref-hevner2004designscience): Alan R. Hevner; Salvatore T. March; Jinsoo Park; Sudha Ram (2004). **Design Science in Information Systems Research.** *MIS Quarterly*, 28(1), p. 75–105.
- [Shadish et al. (2002)](referencias.md#ref-shadish2002experimental): William R. Shadish; Thomas D. Cook; Donald T. Campbell (2002). **Experimental and Quasi-Experimental Designs for Generalized Causal Inference.** 2. ed., Houghton Mifflin.
- [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased): Feng Wang; Michael J. Hannafin (2005). **Design-Based Research and Technology-Enhanced Learning Environments.** *Educational Technology Research and Development*, 53(4), p. 5–23.

<!-- referências locais: fim -->
