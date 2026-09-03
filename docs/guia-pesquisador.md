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

Uma pessoa estudando, uma unidade de estudo, um requisito de evidência, uma sessão de
autoria e um curso sob certa condição são unidades diferentes. Declare a
unidade, o instante do recorte, o denominador e os casos ausentes antes de
calcular ou interpretar.

Quantidade de mudanças do GPT não é qualidade autoral. Conformidade estrutural
de uma unidade não é desempenho do estudante. Latência, rede e Storage não são
medidas de aprendizagem.

## Fixar condições sem arquitetura paralela

O catálogo possui quatro parâmetros pedagógicos:

1. teto de novas unidades de análise por unidade de estudo;
2. formas de explicação por unidade de análise;
3. oportunidades mínimas de prática por requisito;
4. dimensões de variação da prática.

Direção editorial é registrada separadamente. O estado `default` autoriza
calibração contextual pelo GPT para cada microssequência ou unidade; não
representa um preset fixo. Para comparar uma condição, crie um curso privado
independente, fixe deliberadamente os valores pertinentes e documente o que
deve permanecer igual. Uma definição do pesquisador prevalece sobre a
calibração contextual. Não existe entidade de variante nem bloqueio
experimental.

Ao comparar teto 1 e 2, preserve o mesmo repertório semântico. O número de
unidades de estudo pode mudar; compactar unidades de análise para produzir tamanhos parecidos
destrói a condição que se pretendia comparar.

O fluxo global antes dos lotes, a aprovação apenas do que foi inspecionável e a
fronteira pública em linguagem humana são invariantes do produto, não condições
experimentais. Distribuição editorial, formas de explicação, prática e outras
dimensões já configuráveis podem ser calibradas pelo GPT ou fixadas para a
pesquisa.

Configuração formal de progressão ou representação só é justificável quando uma
diferença educacional concreta será produzida e comparada. Não crie catálogo por
antecipação.

## Congelar o artefato quando necessário

O curso cotidiano continua mutável. Se uma investigação precisar reproduzir o
artefato apresentado a um grupo, exporte explicitamente o estado e a
configuração pertinentes e guarde-os segundo o plano de dados do estudo.

**Baixar dados de autoria** fornece o snapshot quantitativo exibido, inclusive
a configuração efetivamente aplicada e selada nas unidades materializadas. Ele
permite comparar o desenho entre publicações ou cópias experimentais, mas não
contém a composição completa do curso nem substitui a exportação explícita do
artefato. Registre também a data, o escopo e quaisquer mudanças posteriores
relevantes. Não é necessário criar histórico universal ou ledger no produto.

## Usar Analytics com limites claros

Analytics oferece duas leituras por curso, parte, microssequência ou unidade de estudo:

- **Desenho**: unidades de estudo, parâmetros efetivos, unidades de análise,
  introduções, formas explicativas, componentes, prática, variação e fontes por papel;
- **Autoria**: observações, parâmetros definidos, unidades revisadas manualmente e
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
unidades demonstra o artefato produzido. Nenhum deles informa sozinho exposição,
compreensão ou efeito.

## Observações e privacidade

Observações são manifestações protegidas entre seus participantes autorizados.
Texto, alvo e contexto podem conter dados pessoais. Analytics conta estados
quando atribuíveis, mas não exporta o texto como parte do snapshot.

Antes de coletar outro dado, declare a pergunta, a inferência permitida, a
decisão legítima, a retenção, o acesso e o risco de vigilância ou coerção. O
AraLearn não coleta transcript, prompt, cadeia de pensamento, clickstream,
rolagem ou tempo em tela para Analytics.

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
