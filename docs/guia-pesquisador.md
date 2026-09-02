# Guia de investigação

Este guia ajuda a estudar o AraLearn sem confundir propriedade do software,
decisão de desenho e efeito educacional. Configuração e Analytics tornam parte
do artefato inspecionável; não criam, por si, amostra, instrumento, medida,
atribuição ou inferência causal.

Antes de formular a pergunta, consulte [Visão do produto](visao-do-produto.md),
[Modelo didático](modelo-didatico.md), [Desenho instrucional
parametrizado](desenho-instrucional-parametrizado.md), [Analytics da
Autoria](analytics-instrucionais.md) e [Capacidades atuais](estado-atual-e-roadmap.md).

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

## Escolher unidade de análise e medida

Uma pessoa estudando, uma StudyUnit, um requisito de evidência, uma sessão de
autoria e um Curso sob certa condição são unidades diferentes. Declare a
unidade, o instante do recorte, o denominador e os casos ausentes antes de
calcular ou interpretar.

Quantidade de mudanças do GPT não é qualidade autoral. Conformidade estrutural
de uma Unit não é desempenho do estudante. Latência, rede e Storage não são
medidas de aprendizagem.

## Fixar condições sem arquitetura paralela

O catálogo possui quatro parâmetros pedagógicos:

1. teto de novas AnalysisUnits por StudyUnit;
2. formas de explicação por AnalysisUnit;
3. oportunidades mínimas de prática por requisito;
4. dimensões de variação da prática.

Direção editorial é registrada separadamente. Para comparar uma condição,
crie um Curso privado independente, fixe a configuração e documente o que deve
permanecer igual. Não existe entidade de Variante nem bloqueio experimental.

Ao comparar teto 1 e 2, preserve o mesmo inventário semântico. O número de
StudyUnits pode mudar; compactar AnalysisUnits para produzir tamanhos parecidos
destrói a condição que se pretendia comparar.

Configuração formal de progressão ou representação só é justificável quando uma
diferença educacional concreta será produzida e comparada. Não crie catálogo por
antecipação.

## Congelar o artefato quando necessário

O Curso cotidiano continua mutável. Se uma investigação precisar reproduzir o
artefato apresentado a um grupo, exporte explicitamente o estado e a
configuração pertinentes e guarde-os segundo o plano de dados do estudo.

**Exportar Analytics** fornece apenas o snapshot quantitativo exibido. Ele não
contém a composição completa do Curso e não substitui a exportação do artefato.
Registre também a data, o escopo e quaisquer mudanças posteriores relevantes.

## Usar Analytics com limites claros

Analytics oferece duas leituras por Curso, Parte, Microssequência ou StudyUnit:

- **Desenho**: StudyUnits, parâmetros efetivos, AnalysisUnits, introduções,
  formas explicativas, componentes, prática, variação e Fontes por papel;
- **Autoria**: Observações, parâmetros definidos, Units revisadas manualmente e
  origem observável de criação e última revisão.

Ausência de atribuição permanece ausente. O JSON exportado deve conter os mesmos
números da tela. Não derive score de qualidade, colaboração, autoria humana,
aprendizagem ou atenção dessas contagens.

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
Units demonstra o artefato produzido. Nenhum deles informa sozinho exposição,
compreensão ou efeito.

## Observações e privacidade

Observações são manifestações protegidas entre seus participantes autorizados.
Texto, alvo e contexto podem conter dados pessoais. Analytics conta estados
quando atribuíveis, mas não exporta o texto como parte do snapshot.

Antes de coletar outro dado, declare a pergunta, a inferência permitida, a
decisão legítima, a retenção, o acesso e o risco de vigilância ou coerção. O
AraLearn não coleta transcript, prompt, cadeia de pensamento, clickstream,
rolagem ou tempo em tela para Analytics.

Uma reutilização científica de conteúdo, Observações ou Fontes exige finalidade,
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
na Resolução CNS nº 510/2016 ([Conselho Nacional de Saúde (2016)](referencias.md#ref-cns2016resolucao510)).
Essa norma não demonstra
validade metodológica ou efeito educacional.

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

- [Conselho Nacional de Saúde (2016)](referencias.md#ref-cns2016resolucao510): Conselho Nacional de Saúde (2016). **Resolução nº 510, de 7 de abril de 2016.** Conselho Nacional de Saúde.
- [Design-Based Research Collective (2003)](referencias.md#ref-dbrc2003designbased): Design-Based Research Collective (2003). **Design-Based Research: An Emerging Paradigm for Educational Inquiry.** *Educational Researcher*, 32(1), p. 5–8.
- [Hevner et al. (2004)](referencias.md#ref-hevner2004designscience): Alan R. Hevner; Salvatore T. March; Jinsoo Park; Sudha Ram (2004). **Design Science in Information Systems Research.** *MIS Quarterly*, 28(1), p. 75–105.
- [Shadish et al. (2002)](referencias.md#ref-shadish2002experimental): William R. Shadish; Thomas D. Cook; Donald T. Campbell (2002). **Experimental and Quasi-Experimental Designs for Generalized Causal Inference.** 2. ed., Houghton Mifflin.
- [Wang e Hannafin (2005)](referencias.md#ref-wang2005designbased): Feng Wang; Michael J. Hannafin (2005). **Design-Based Research and Technology-Enhanced Learning Environments.** *Educational Technology Research and Development*, 53(4), p. 5–23.

<!-- referências locais: fim -->
