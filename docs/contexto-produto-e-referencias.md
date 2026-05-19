# Contexto de produto e referências

AraLearn se situa no cruzamento entre estudo por prática, organização pessoal do conhecimento, autoria local e assistência por IA. Este documento registra esse contexto sem transformar referências em filiação direta ou argumento de autoridade.

A discussão crítica mais desenvolvida sobre poder, vigilância, performatividade e riscos educacionais está em [Ética, poder e governança](etica-poder-e-governanca.md).

## Época

O produto nasce em uma época marcada por abundância informacional. O estudante encontra conteúdo em páginas da web, vídeos, fóruns, plataformas sociais, PDFs, apostilas, documentação técnica e respostas geradas por IA. O problema não é apenas acesso. O problema é converter essa disponibilidade em percurso de estudo.

A internet ampliou a circulação de materiais. A IA generativa ampliou a velocidade de produção de explicações, resumos, listas e exemplos. Esse cenário torna mais importante a existência de estruturas externas que ajudem a ordenar, praticar, revisar e corrigir.

AraLearn responde a esse cenário com uma arquitetura simples de navegação e autoria:

```text
curso -> módulo -> lição -> microssequência -> card
```

A árvore não é só forma de armazenamento. Ela é uma técnica de orientação.

## Nicho de produto

AraLearn dialoga com produtos e práticas já conhecidos, mas não se reduz a nenhum deles.

### Anki

Anki tornou familiar a ideia de estudo por cartões, revisão e repetição espaçada. AraLearn compartilha a importância da prática recorrente, mas desloca o centro do card isolado para a microssequência: uma pequena etapa com objetivo didático, explicação, prática e possibilidade de revisão.

### Duolingo

Duolingo popularizou a aprendizagem por pequenas etapas, feedback imediato e progressão visível. AraLearn dialoga com essa lógica de avanço gradual, mas é voltado à autoria de trilhas pelo usuário, com recortes definidos por disciplina, prova, documento ou objetivo de estudo.

### Obsidian

Obsidian representa uma cultura de notas locais, links, organização pessoal do conhecimento e reapropriação do próprio material. AraLearn compartilha a preferência por autonomia local e estrutura editável, mas direciona essa organização para trilhas de estudo com prática.

### Git

Git é uma referência para versionamento, histórico e reversibilidade. AraLearn não replica Git como sistema, mas adota uma preocupação semelhante: preservar versões, permitir comparação e evitar que uma alteração apague o percurso anterior sem inspeção.

### Wikipédia

Wikipédia é um exemplo central de conhecimento hipertextual, público, editável e enciclopédico. AraLearn parte de outro problema: não basta navegar por conexões de conhecimento; para estudar, muitas vezes é preciso transformar o material em sequência, prática e revisão.

### X e plataformas de fluxo contínuo

X e outras plataformas de fluxo contínuo exemplificam a circulação rápida, fragmentada e algorítmica de informação. AraLearn opera em sentido diferente: em vez de fluxo incessante, propõe recorte, ordem, pausa, prática e autoria.

## Diferença central

A diferença do AraLearn está na combinação de quatro elementos:

1. estrutura hierárquica de estudo;
2. microssequência como unidade didática;
3. geração assistida por IA em contexto delimitado;
4. persistência local com versões e contrato exportável.

O app não pretende ser rede social, wiki, caderno de notas genérico, sistema de flashcards puro ou curso fechado. Ele é uma ferramenta de autoria e estudo para transformar informação em percurso.

## Enquadramento filosófico e ético

As referências filosóficas ajudam a formular a ambivalência do projeto. AraLearn responde a problemas reais de orientação no estudo, mas também pode reproduzir riscos que a filosofia contemporânea associou a sistemas de informação, disciplina e desempenho.

### Estruturalismo e Saussure

A organização por níveis do AraLearn pode ser aproximada, com cautela, de uma intuição estruturalista: os elementos ganham sentido por suas relações dentro de um sistema. Um card não é apenas um bloco isolado; ele pertence a uma microssequência, que pertence a uma lição, que pertence a um módulo e a um curso.

Essa aproximação não significa que o app aplique teoria linguística. Significa apenas que sua arquitetura reconhece que contexto e posição alteram o valor didático de uma unidade.

### Lyotard

Lyotard é relevante porque o AraLearn toca o problema da legitimação do conhecimento em sociedades informatizadas. O app pode ajudar o usuário a se orientar no excesso informacional, mas também pode participar da redução do saber a desempenho, eficiência e percurso operacional.

O risco não é periférico. Ao transformar conhecimento em trilhas, microssequências, cards, validações e versões, o app pode fortalecer a apropriação crítica do usuário ou apenas adaptar o usuário a uma lógica de performatividade.

### Foucault

Foucault é pertinente porque a organização do estudo também pode ser uma forma de disciplina. Classificar, ordenar, examinar, corrigir, registrar e normalizar são operações que podem apoiar aprendizagem, mas também podem servir a controle e vigilância.

AraLearn deve ser desenhado para ampliar autoria e revisão, não para tornar o usuário mais governável por uma instituição, uma plataforma ou um modelo.

## Questões éticas

A arquitetura do AraLearn implica escolhas éticas concretas.

### Autoria

A IA não deve apagar a autoria do usuário. O app precisa preservar escopo, versões, revisão e possibilidade de rejeitar ou corrigir material gerado.

### Privacidade

A orientação local-first/offline-first reduz dependência de servidor próprio e favorece controle sobre o projeto. Quando há uso de API remota, o usuário precisa compreender que o contexto necessário para geração pode ser enviado ao provider configurado.

### Confiabilidade

Conteúdo gerado por IA pode estar errado, incompleto ou didaticamente inadequado. O AraLearn deve tratar validação estrutural e revisão humana como partes do fluxo.

### Atenção

O produto deve evitar reproduzir a lógica de fluxo contínuo das plataformas sociais. O objetivo não é maximizar consumo de conteúdo, mas criar condições para estudo orientado, prática e retomada.

### Escopo

Declarar o que fica fora é tão importante quanto declarar o que entra. Isso reduz expansão enciclopédica e respeita o objetivo concreto do usuário.

## Como usar essas referências na documentação

No README, essas referências devem aparecer apenas como contextualização breve. Na documentação, podem ser desenvolvidas com mais cuidado.

A regra editorial é: referências externas devem esclarecer o lugar do AraLearn no ecossistema de produtos, práticas e problemas contemporâneos. Elas não devem substituir a descrição do que o app faz, nem transformar a apresentação em ensaio abstrato.
