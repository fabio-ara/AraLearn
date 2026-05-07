# AraLearn

AraLearn é uma aplicação open source para converter conteúdos, dúvidas e intenções de estudo em sequências didáticas estruturadas.

O projeto parte de um problema contemporâneo: a informação se tornou abundante, especialmente com o uso de inteligência artificial generativa, mas essa abundância não garante aprendizagem. Explicações, resumos e exemplos podem estar disponíveis em grande quantidade e, ainda assim, o estudante pode continuar sem saber por onde começar, o que praticar, como revisar ou como retomar um percurso interrompido.

O AraLearn procura reduzir essa distância entre acesso à informação e aprendizagem efetiva. Para isso, organiza conteúdos em unidades menores, navegáveis, praticáveis e revisáveis, combinando leitura guiada, cards, exercícios, persistência local e integração com serviços de inteligência artificial generativa, acessados por API, para geração e reorganização de material didático.

A aplicação pode ser usada em duas formas principais:

- como aplicação web, inclusive via GitHub Pages;
- como APK Android, empacotado com WebView.

## Propósito

O AraLearn foi pensado para apoiar estudo em condições reais: pouco tempo, atenção fragmentada, rotina de trabalho, disciplinas simultâneas, deslocamentos, pausas e retomadas frequentes.

Em vez de pressupor longos períodos contínuos de concentração, o sistema busca tornar a próxima ação de estudo mais clara e executável. O conteúdo é organizado para que o usuário possa ler, responder, revisar, editar, importar, exportar e retomar o estudo com menor fricção.

O objetivo não é apenas armazenar material. O objetivo é transformar informação em percurso de aprendizagem.

## Visão geral

No estado atual, o AraLearn reúne em uma única aplicação:

- organização de conteúdos em cursos, módulos, lições, microssequências e cards;
- leitura de cards com controle de progresso local;
- retomada do ponto de estudo;
- edição local de microssequências e cards;
- importação e exportação de projetos estruturais;
- backup completo do estado da aplicação;
- integração com serviços de inteligência artificial generativa, por API, para geração, revisão e reorganização de conteúdo;
- funcionamento com persistência local, inclusive em cenários sem conexão contínua.

A aplicação aproxima três atividades que normalmente aparecem separadas:

- autoria de material didático;
- estudo ativo;
- revisão do percurso.

Essa integração permite que o mesmo ambiente seja usado tanto para consumir material quanto para ajustá-lo, reorganizá-lo e preservá-lo.

## Modelo conceitual

O AraLearn organiza o conteúdo em uma hierarquia explícita:

```text
Projeto
  -> Cursos
    -> Módulos
      -> Lições
        -> Microssequências
          -> Cards
```

Essa estrutura aparece no contrato público, na persistência local e na interface da aplicação.

A hierarquia foi desenhada para manter equilíbrio entre granularidade e legibilidade. Cursos e módulos dão contexto; lições delimitam unidades de estudo; microssequências organizam pequenos percursos didáticos; cards tornam o conteúdo praticável.

## Cards e formatos didáticos

Cada card declara sua função por meio de campos semânticos simples. A intenção é manter o JSON autoral legível, validável e adequado tanto para edição humana quanto para geração assistida por modelos de linguagem.

Entre os formatos já cobertos estão:

- `say`: explicação, leitura guiada e lacunas textuais;
- `ask`: questões de múltipla escolha;
- `code`: trechos de código;
- `table`: tabelas para leitura ou prática;
- `tree`: representação e inspeção de estruturas de diretório;
- `flow`: fluxogramas com leitura e prática por lacunas.

Essa abordagem permite representar diferentes formas de conhecimento sem abandonar uma base comum de autoria, renderização e validação.

## Papel da inteligência artificial

No AraLearn, serviços de inteligência artificial generativa acessados por API são usados como apoio à transformação didática do conteúdo. Modelos de linguagem podem auxiliar na geração de cards, na reorganização de microssequências e na adaptação de materiais amplos ou irregulares para uma forma estudável.

Esses modelos não são tratados como autoridade final sobre o conteúdo. Seu papel é operacional: ajudar a converter textos, dúvidas ou demandas de estudo em estruturas que possam ser lidas, praticadas, revisadas e auditadas pelo usuário.

O foco do produto está menos em solicitar uma resposta isolada e mais em construir material que possa integrar um percurso de aprendizagem.

## Contrato público e renderização

O conteúdo estrutural do AraLearn usa o contrato público `aralearn.contract`, documentado em JSON. Esse contrato descreve projeto, hierarquia, cards e intenções didáticas em um formato persistível, validável e portável.

A aplicação lê esse JSON, valida sua estrutura, compila os elementos necessários para uso interno e renderiza o material na interface. Isso permite que o conteúdo não fique preso à tela de edição: ele pode ser examinado, versionado, transformado, importado, exportado e testado fora da aplicação.

Além do contrato estrutural, a aplicação também trabalha com `aralearn.storage`, formato de backup completo do estado local, incluindo projeto e progresso.

## Persistência local e funcionamento offline

O AraLearn mantém projeto e progresso no próprio dispositivo. Isso permite estudar sem depender de conexão contínua e favorece cenários de uso em que a rede é instável ou indisponível.

Na interface principal, a ação `Importar` aceita os dois formatos JSON do produto:

- `aralearn.contract`: contrato público para projetos ou recortes estruturais;
- `aralearn.storage`: backup completo da aplicação, incluindo projeto e progresso local.

Essa separação permite distinguir troca estrutural de conteúdo e preservação completa do estado local da aplicação.

## Importação, exportação e backup

A aplicação permite importar e exportar dados em formatos documentados. Isso torna possível:

- preservar cópias completas do estado local;
- compartilhar estruturas de projeto;
- testar exemplos externos;
- validar contratos públicos;
- manter portabilidade entre ambientes.

## Arquitetura do repositório

```text
public/   Entrada web, assets e estilos da interface local
src/      Contrato, renderização, persistência, editor e interface
tests/    Suíte automatizada
scripts/  Utilitários de desenvolvimento, como servidor local
docs/     Documentação pública, contrato e exemplos
```

## Execução local

```powershell
npm install
npm start
```

## Validação

```powershell
npm test
npm run validate:example
```

Para verificar a geração real de microssequências com Gemini, defina a chave no ambiente da sessão e rode:

```powershell
$env:GEMINI_API_KEY="sua-chave"
npm run smoke:gemini
```

A chave não deve ser versionada nem registrada em arquivos do projeto.

## Documentação

- [Visão geral da documentação](./docs/README.md)
- [Contrato público atual](./docs/aralearn-contract.md)
- [Assistência por IA generativa](./docs/assistencia-por-ia.md)
- [Exemplos JSON](./docs/examples/)
- [Histórico de versões](./CHANGELOG.md)

## Status do projeto

O AraLearn está em desenvolvimento ativo. A versão atual já consolida uma base funcional para estudo, autoria local, persistência, importação, exportação, validação automatizada e integração com serviços de inteligência artificial generativa por API.

As próximas iterações devem aprofundar:

- fluxos de autoria assistida por modelos de linguagem;
- rastreabilidade entre conteúdo original e material gerado;
- validação dos formatos públicos;
- melhoria da experiência de revisão;
- ampliação dos tipos de card;
- amadurecimento da aplicação como infraestrutura aberta de aprendizagem ativa.

## Direção

O horizonte do projeto é transformar aprendizagem em percurso estruturado, revisável e controlado pelo usuário.

Em vez de tratar o estudo como simples consumo de conteúdo, o AraLearn propõe uma abordagem em que informação, prática, revisão e autoria formam um ciclo contínuo. A aplicação busca apoiar esse ciclo de modo técnico, transparente e portável, preservando a autonomia do estudante e a possibilidade de auditoria do material produzido.
