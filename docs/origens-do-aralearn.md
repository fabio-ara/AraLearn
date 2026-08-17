# Origens do AraLearn

## Como ler esta página

Esta é uma narrativa de origem baseada na memória autobiográfica do **autor do
projeto**. Ela registra experiências que antecederam o AraLearn e ajuda a
compreender de onde vieram algumas perguntas que o produto procura enfrentar.

Uma memória biográfica pode explicar por que um problema chamou a atenção de
quem projetou o sistema. Ela não demonstra, por si só, que uma solução ensina
melhor, que uma decisão técnica é adequada ou que uma relação de causa e efeito
existe. Essas afirmações exigem literatura, implementação verificável e
avaliação empírica, tratadas separadamente na [revisão de
literatura](revisao-de-literatura.md) e no [protocolo de avaliação do
artefato](protocolo-avaliacao-artefato.md).

As instituições mencionadas abaixo identificam etapas da trajetória declarada.
A menção não significa que elas participaram do desenvolvimento, avaliaram ou
endossam o AraLearn. Também não se atribui a elas uma decisão do produto sem
evidência específica dessa relação.

## Trajetória declarada

| Período | Experiência biográfica |
| --- | --- |
| 2009–2013 | Bacharelado em Letras, com habilitações em Português e Linguística, na Universidade de São Paulo. |
| 2010–2022 | Vínculo com o Colégio Etapa. Esta página não presume nem detalha funções além dessa associação declarada. |
| 2014–2020 | Bacharelado em Ciências Biológicas na Universidade de São Paulo, interrompido na etapa do trabalho de conclusão de curso, depois do cumprimento dos créditos. |
| desde 2024 | Vínculo com a Companhia Ambiental do Estado de São Paulo. Esta menção não descreve atividades internas nem associa a instituição ao projeto. |
| desde 2025 | Bacharelado em Tecnologia da Informação na Universidade Virtual do Estado de São Paulo. |
| desde 2026 | Curso superior de Tecnologia em Análise e Desenvolvimento de Sistemas no Instituto Federal de São Paulo. |

As datas abertas indicam formações ou vínculos declarados como ainda em curso
na data desta redação; não antecipam titulação, conclusão ou permanência.

## Experiências de aprendizagem que precederam o projeto

Antes do AraLearn, o autor do projeto experimentou diferentes maneiras de
organizar o próprio estudo. Entre elas estavam a produção de resumos, a criação
de materiais no Anki e o uso de Duolingo e LingoDeer. Essas práticas fizeram
parte, em especial, da aprendizagem autodidata de japonês e mandarim.

Na memória autobiográfica do autor do projeto, essas experiências precederam
perguntas que mais tarde se tornariam relevantes para o AraLearn:

- como organizar conteúdo complexo para estudo continuado;
- como combinar explicação e prática sem depender de um percurso fechado;
- como adaptar materiais a objetivos próprios;
- como tornar o estudo utilizável em sessões pequenas e retomáveis;
- como reduzir o trabalho de produzir e revisar materiais sem perder o
  controle sobre o conteúdo.

Esta lista registra a genealogia declarada do problema. Ela não afirma que uma
ferramenta citada causou uma escolha técnica nem avalia comparativamente a
eficácia dessas ferramentas.

## Quando o cartão se tornou um ambiente programável

Segundo o relato autobiográfico, o Anki deixou progressivamente de ser usado
apenas como uma sequência de frente e verso. Os materiais passaram a combinar
HTML, CSS, JavaScript, áudio, informações gramaticais, dicionários e dados
obtidos de fontes diferentes. Planilhas e arquivos CSV serviam para organizar
e transformar conjuntos maiores de dados antes de sua apresentação.

Essa experiência trouxe duas perguntas que continuam pertinentes ao projeto:

- como combinar representações verbais, sonoras, visuais e interativas sem
  perder a unidade de sentido do conteúdo;
- como automatizar tarefas repetitivas de produção sem retirar do autor o
  controle sobre fontes, estrutura e correção.

O relato não demonstra que essa combinação seja pedagogicamente superior. Ele
explica por que multimodalidade, dados estruturados e automação apareceram cedo
como problemas de design. A natureza acadêmica das unidades hoje chamadas de
*cards* e *resources* é examinada separadamente na revisão terminológica.

## Progressão fechada e autoria do percurso

Duolingo e LingoDeer aparecem nessa memória como experiências importantes e,
mais tarde, como contraste para uma necessidade percebida: poder alterar
ordem, ênfase, exemplos, representações e ritmo. A insatisfação relatada não é
uma avaliação geral dessas plataformas; é a origem autobiográfica da pergunta
“quem pode configurar o percurso de aprendizagem?”.

Os mesmos procedimentos de decomposição, organização e recuperação foram
posteriormente adaptados, no relato, do estudo de idiomas para conteúdos de
Administração e Direito. Essa transferência entre domínios motivou a hipótese
de que parte do problema era mais geral que a aprendizagem de uma língua. A
hipótese ainda precisa ser delimitada e avaliada; o episódio biográfico não a
valida.

## Da automação aos modelos de linguagem

A automação surgiu primeiro como resposta prática ao custo de tratar dados e
manter materiais manualmente. Mais tarde, a formação em desenvolvimento de
sistemas permitiu formular esse conjunto de práticas como um problema de
software. O encontro posterior com modelos de linguagem acrescentou uma nova
possibilidade e uma nova tensão:

```text
interpretação e geração flexíveis
              +
estado persistido, contratos e validação verificável
              ↓
autoria assistida com controle humano
```

Essa formulação não faz do modelo de linguagem a fonte permanente do curso. O
estado mutável — planejamento, parâmetros, fontes, observações e andamento —
pertence ao AraLearn e pode ser lido ou alterado tanto pela interface quanto
pelas ferramentas autorizadas. Instruções estáveis ficam separadas desse
conteúdo para que a pesquisa possa comparar configurações sem reconstruir o
assistente inteiro.

## A situação móvel que concentra as restrições

Uma imagem recorrente na memória do projeto é a de quem trabalha e estuda em
pé no transporte público: tela pequena, interrupções, períodos curtos,
conectividade variável e necessidade de retomar. Trata-se de uma situação de
design, não de uma afirmação sobre atenção ou funcionamento neural.

Ela ajuda a tornar concretas exigências como largura móvel, continuidade,
retomada, uso offline e segmentação semanticamente coerente. Se essas decisões
melhoram aprendizagem, usabilidade ou permanência é uma pergunta empírica, não
uma conclusão biográfica.

## Da experiência pessoal à pesquisa

Para não confundir origem com validação, o projeto usa uma sequência explícita:

```text
memória autobiográfica
        ↓
problema percebido
        ↓
hipótese de design
        ↓
decisão implementada
        ↓
avaliação com método declarado
        ↓
evidência e limites
```

Por exemplo, produzir materiais próprios pode motivar a pergunta sobre quanto
controle autoral uma plataforma deve oferecer. A experiência pessoal torna a
pergunta compreensível; não determina a resposta. A resposta precisa ser
comparada com alternativas, implementada de modo observável e avaliada com
participantes, tarefas, instrumentos e critérios adequados.

Essa distinção permite preservar a história do AraLearn sem transformar a
biografia do autor do projeto em argumento de autoridade ou em evidência de
eficácia educacional.
