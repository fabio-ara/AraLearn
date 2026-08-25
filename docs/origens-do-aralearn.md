# Origens do AraLearn

## O que esta narrativa explica

O AraLearn nasceu de problemas encontrados ao estudar, produzir material e
construir sistemas sob restrições concretas. Esta página registra a genealogia
biográfica declarada pelo responsável pelo projeto. Ela ajuda a compreender por
que certas perguntas ganharam importância, mas não demonstra que as respostas
do produto sejam pedagogicamente eficazes ou tecnicamente superiores.

As instituições e tecnologias citadas contextualizam experiências. Nenhuma
delas participou do desenvolvimento, avaliou o AraLearn ou o endossa. As
relações com aprendizagem, interação e pesquisa são examinadas separadamente na
[revisão de literatura](revisao-de-literatura.md) e nos [fundamentos de
pesquisa](fundamentos-pesquisa-e-governanca.md).

## Do estudo de idiomas ao conteúdo estruturado

O ponto de partida foi o uso do [Anki](https://apps.ankiweb.net/) no estudo de
idiomas, especialmente japonês e chinês. Com o tempo, os cartões deixaram de ser
somente pares de pergunta e resposta. Passaram a usar
[HTML](https://html.spec.whatwg.org/), [CSS](https://www.w3.org/Style/CSS/) e
[JavaScript](https://tc39.es/ecma262/) para organizar informação gramatical,
representações e interação.

O trabalho também envolveu curadoria e processamento de grandes conjuntos
provenientes de dicionários e enciclopédias disponíveis na internet. Parsers
transformavam essas fontes em registros utilizáveis. O
[MeCab](https://taku910.github.io/mecab/) apoiava a análise morfológica; o
[Online Japanese Accent Dictionary, OJAD](https://www.gavo.t.u-tokyo.ac.jp/ojad/eng/pages/home),
da Universidade de Tóquio, oferecia recursos para prosódia e acento; e a
[síntese de voz do Microsoft Azure](https://learn.microsoft.com/azure/ai-services/speech-service/text-to-speech)
gerava automaticamente áudio associado a itens vocabulares e sentenças.

Essa etapa tornou visíveis problemas que um cartão simples não resolvia:
preservar a relação entre texto, som e análise linguística; transformar fontes
heterogêneas sem perder sua origem; automatizar operações repetitivas; e manter
controle sobre o resultado de uma produção em escala. A experiência explica a
presença posterior de dados estruturados, representações especializadas,
Fontes, validação e autoria assistida no horizonte do projeto. Ela não prova
que a solução adotada pelo AraLearn seja a melhor para esses problemas.

## De vocabulário a materiais extensos

Durante um período de desemprego, o ambiente customizado foi adaptado para
produzir material de estudo para concursos públicos. O trabalho reunia fontes
públicas, bancos de questões por assinatura e materiais extensos de cursos
preparatórios, sobretudo em Administração e Direito.

A mudança de domínio deslocou o centro do problema. Já não bastava associar
uma forma linguística a significado e áudio. Era necessário selecionar grandes
volumes, decompor argumentos e procedimentos, organizar dependências,
transformar fontes em explicação e prática e revisar a qualidade do conjunto.
Surgiram, assim, perguntas sobre escalabilidade de autoria e sobre como
representar conteúdos que não cabem numa única forma de atividade.

## Automação de processos sob restrições

O responsável pelo projeto atua na
[CETESB](https://cetesb.sp.gov.br/). Nesse contexto, passou a trabalhar
intensamente com automação de processos de negócio num ambiente com forte
restrição de ferramentas, baseado principalmente em licenciamento Microsoft
E3, atualmente também [Microsoft 365
Copilot](https://www.microsoft.com/microsoft-365-copilot),
[Excel](https://www.microsoft.com/microsoft-365/excel) e automações locais em
[VBA](https://learn.microsoft.com/office/vba/api/overview/).

Foram construídos sistemas para rotinas como processamento de pagamentos e
benefícios, admissão e demissão, alterações cadastrais, geração de documentos,
demonstrativos destinados a órgãos reguladores e outros processos
administrativos. Esta narrativa não expõe regras internas, dados pessoais ou
informações confidenciais. A CETESB não é apresentada como usuária ou
patrocinadora do AraLearn.

A contribuição dessa experiência para a genealogia está no tipo de problema:
automatizar sem perder rastreabilidade; validar entradas e resultados;
integrar etapas que pertencem ao mesmo processo; manter sistemas usados em
situações reais; e permitir que conhecimento operacional seja compreendido,
revisado e transmitido. Essas relações ajudam a explicar o interesse do
AraLearn por proveniência, histórico de decisões, recuperação e circulação de
conhecimento.

## Aprender a integrar um sistema

A necessidade de automação ampliou o estudo de programação, engenharia de
software, Excel, [Microsoft Power
Platform](https://www.microsoft.com/power-platform) e outras tecnologias
administrativas e de desenvolvimento. A trajetória inclui diversos cursos do
[SENAI](https://www.portaldaindustria.com.br/senai/), mencionados aqui por sua
função no percurso de aprendizagem, não como inventário de certificados.

O estudo autodidata de desenvolvimento moderno também produziu a situação
informalmente chamada *tutorial hell*. O termo não designa um constructo
científico. Ele descreve a repetição de muitos tutoriais locais sem conseguir
integrar o que cada exemplo pressupõe: reproduzir uma tela ou uma API era
diferente de construir um sistema cuja programação, arquitetura, dados,
implantação, segurança e operação funcionassem juntas.

Essa dificuldade reforçou uma pergunta central do AraLearn: como ensinar um
assunto em partes sem esconder as relações que permitem passar do exemplo para
uma realização inteira? A pergunta biográfica pode orientar hipóteses de
desenho; sua resposta exige literatura e avaliação próprias.

## Formação corrente e experiência anterior

O responsável frequenta atualmente o curso superior de Tecnologia em Análise e
Desenvolvimento de Sistemas no [Instituto Federal de São Paulo
(IFSP)](https://www.ifsp.edu.br/). O interesse pelo AraLearn foi retomado em
paralelo a essa formação, como artefato para relacionar engenharia de software,
educação e investigação.

A experiência anterior na [Universidade Virtual do Estado de São Paulo
(UNIVESP)](https://univesp.br/) deixou de atender, naquele momento, à necessidade
pessoal de integrar stacks e práticas modernas de desenvolvimento. Esse relato
é situado: não avalia a instituição, seus cursos ou seus estudantes, e não
implica conclusão de formação, campus ou período que não tenham sido declarados.

## O artefato que reúne essas perguntas

O AraLearn passou a reunir problemas antes tratados separadamente:

- transformar fontes em conteúdo estruturado e revisável;
- preservar relações entre explicação, representação e prática;
- oferecer profundidade sem condensar pressupostos nem fragmentar o percurso;
- sustentar estudo e retomada em dispositivos móveis e conectividade variável;
- apoiar autoria com automação e modelos de linguagem sem retirar a decisão
  editorial da pessoa;
- relacionar engenharia, proveniência, privacidade e avaliação;
- investigar aplicações possíveis em estudo autodidata, educação profissional,
  treinamento e desenvolvimento e circulação de conhecimento no trabalho.

Essas áreas são contextos possíveis de uso e pesquisa, não resultados já
demonstrados. O AraLearn implementa um produto e materializa decisões de
desenho. Usabilidade, aprendizagem, transferência ao trabalho e mudança
organizacional continuam sendo perguntas empíricas distintas.

## Da experiência à evidência

A genealogia e a pesquisa cumprem funções diferentes:

```text
experiência declarada
  → problema percebido
  → hipótese de desenho
  → propriedade implementada
  → avaliação delimitada
  → resultado e limites
```

Uma experiência pode mostrar por que a decomposição do conhecimento se tornou
uma preocupação. A implementação pode demonstrar que o produto conserva
hierarquia, Fontes e versões. Somente uma avaliação adequada pode mostrar como
pessoas compreendem o percurso, aprendem, transferem uma prática ou usam o
artefato no trabalho. Preservar essas fronteiras permite contar a origem do
AraLearn sem transformar biografia em prova.
