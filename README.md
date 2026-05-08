# AraLearn

AraLearn é uma aplicação open source para transformar conteúdos, dúvidas e intenções de estudo em percursos didáticos pequenos, praticáveis e revisáveis.

O projeto nasce de um problema contemporâneo: informação deixou de ser escassa, mas compreensão continua difícil. Com mecanismos de busca, repositórios abertos e serviços de inteligência artificial generativa, tornou-se simples obter explicações, exemplos e resumos. Ainda assim, o estudante pode continuar sem saber por onde começar, o que praticar, como revisar ou como retomar uma disciplina depois de uma pausa.

O AraLearn procura reduzir essa distância entre acesso à informação e aprendizagem efetiva. Para isso, organiza material em cursos, módulos, lições, microssequências e cards, combinando autoria local, prática ativa, importação e exportação em JSON, persistência no dispositivo e assistência por modelos de linguagem acessados por API.

A aplicação pode ser usada como:

- aplicação web, inclusive pelo GitHub Pages;
- aplicação local no navegador;
- APK Android empacotado com WebView.

Versão web publicada: <https://fabio-ara.github.io/AraLearn/>

## Propósito

O AraLearn foi pensado para apoiar estudo em condições reais: pouco tempo, atenção fragmentada, disciplinas simultâneas, deslocamentos, retomadas frequentes e necessidade de aprender sob pressão.

Em vez de entregar apenas texto, o sistema transforma uma dúvida ou um conteúdo em uma próxima ação cognitiva: ler, completar, escolher, comparar, revisar, reorganizar ou editar. O objetivo não é substituir livros, aulas, professores ou pesquisa aprofundada. O objetivo é criar uma ponte entre informação disponível e prática de aprendizagem.

Essa ponte é especialmente útil quando o estudante não precisa de uma resposta longa, mas de uma sequência breve e executável que ajude a avançar.

## Visão geral

No estado atual, o AraLearn reúne:

- organização de conteúdos em cursos, módulos, lições, microssequências e cards;
- aba `Gerar` para criar rascunhos de microssequências a partir de um contexto escolhido pelo usuário;
- aba `Cursos` para navegar, editar, ordenar, importar, exportar e estudar;
- leitura de cards com progresso local;
- edição de microssequências e cards;
- importação e exportação de projetos ou recortes estruturais;
- backup completo do estado local;
- assistência por serviços de inteligência artificial generativa acessados por API;
- funcionamento com persistência local, inclusive sem conexão contínua depois que o material está salvo;
- empacotamento Android em WebView.

A aplicação aproxima três atividades que normalmente aparecem separadas:

- autoria de material didático;
- estudo ativo;
- revisão do percurso.

Essa integração permite que o mesmo ambiente seja usado para estudar, corrigir, reorganizar e preservar o próprio material.

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

Essa estrutura aparece no contrato público, na persistência local e na interface. Ela resolve um problema prático de contexto: quando o usuário pede ajuda dentro de uma lição específica, o modelo recebe curso, módulo, lição e microssequência como moldura semântica. Isso torna a tarefa mais restrita, verificável e barata.

Em vez de pedir que um modelo produza um curso inteiro de uma vez, o AraLearn favorece operações pequenas. Modelos leves e de baixo custo, como a família Flash-Lite do Gemini quando disponível no provedor configurado, podem ser suficientes para tarefas bem delimitadas: sugerir uma escada de microssequências, gerar cards para uma unidade pequena ou revisar uma versão existente.

## Geração e importação

O AraLearn combina dois movimentos complementares.

Na geração bottom-up, o usuário parte de uma dúvida concreta dentro de uma lição. A aplicação pede ao serviço de IA generativa uma pequena escada de microssequências. Cada item nasce como rascunho no lugar correto do curso, para posterior curadoria.

Na produção top-down, cursos ou partes de cursos podem ser preparados por pipelines externos e importados no formato JSON especificado. Esse modo é adequado para estudo sistemático de disciplinas acadêmicas: um material amplo pode ser convertido em cursos, módulos, lições e microssequências antes de chegar à interface.

Desde que obedeçam ao contrato `aralearn.contract`, podem ser importados:

- projetos completos;
- cursos;
- módulos;
- lições;
- microssequências.

A aplicação também trabalha com `aralearn.storage`, formato de backup completo que preserva projeto e progresso local.

## Cards e formatos didáticos

Cada card declara sua função por campos semânticos simples. A intenção é manter o JSON legível, validável e adequado tanto à edição humana quanto à geração assistida.

Formatos já cobertos:

- `say`: explicação, leitura guiada e lacunas textuais;
- `ask`: questão de múltipla escolha;
- `code`: trecho de código;
- `table`: tabela para leitura ou prática;
- `tree`: representação e inspeção de estruturas de diretório;
- `flow`: fluxograma com leitura e prática por lacunas.

Essa abordagem permite representar formas diferentes de conhecimento sem abandonar uma base comum de autoria, renderização e validação.

## Inteligência artificial com controle do usuário

No AraLearn, modelos de linguagem são apoio operacional. Eles ajudam a transformar conteúdos, dúvidas e pedidos de revisão em estruturas estudáveis, mas não são tratados como autoridade final.

O papel da arquitetura é deslocar parte da inteligência do modelo para o processo:

- o contexto é explícito;
- a saída esperada é JSON;
- o contrato é validado;
- rascunhos não entram automaticamente no estudo;
- o usuário pode revisar, editar, excluir, exportar e versionar;
- o material fica no dispositivo, sob controle do usuário.

Esse desenho permite usar modelos mais econômicos em tarefas menores e reservar modelos mais fortes para transformações realmente difíceis. A pergunta central não é apenas “qual modelo responde melhor?”, mas “como organizar a tarefa para que a resposta seja auditável, útil e revisável?”.

## Origem intelectual

O AraLearn dialoga com várias tradições de produto e de pesquisa: recuperação ativa, flashcards, aprendizagem por lacunas, escrita em rede, versionamento, hipertexto, documentação aberta e organização pessoal do conhecimento.

Entre as inspirações estão Duolingo, Anki, Obsidian, Git, Wikipédia, a web semântica e interfaces contemporâneas de leitura curta. A formação em Letras e Linguística também aparece na atenção à estrutura da linguagem, à decomposição de sentidos e à passagem entre texto, regra, exemplo e prática.

O projeto é dedicado à memória de Edilson Jacob da Silva Jr., cuja trajetória e amizade marcaram profundamente a relação do autor com programação, automação e estudo.

## Questões de pesquisa

O AraLearn também pode ser lido como objeto acadêmico. Algumas perguntas que orientam sua evolução:

- microssequências geradas com apoio de IA melhoram retenção em comparação com leitura livre?
- lacunas, múltipla escolha e fluxogramas ajudam a transformar explicação em prática?
- a estrutura hierárquica reduz a fricção de estudar com modelos de linguagem?
- como preservar rastreabilidade entre fonte, transformação e card?
- repositórios pessoais de aprendizagem podem registrar trajetórias de entendimento de modo ético e útil?
- como evitar que eficiência substitua formação ampla, leitura longa e reflexão crítica?

O horizonte é transformar aprendizagem em percurso estruturado, revisável e controlado pelo usuário.

## Arquitetura do repositório

```text
public/   Entrada web, assets e estilos da interface
src/      Contrato, renderização, persistência, editor, geração e UI
tests/    Suíte automatizada
scripts/  Utilitários de desenvolvimento e publicação
docs/     Documentação pública, contrato e exemplos
android/  Empacotamento Android em WebView
```

## Execução local

```powershell
npm install
npm start
```

Depois, abra:

```text
http://127.0.0.1:4182/
```

## Android

Para gerar o APK debug local:

```powershell
npm run android:debug
```

Artefato gerado:

```text
android/app/build/outputs/apk/debug/app-debug.apk
```

## GitHub Pages

O site público é gerado a partir dos arquivos web versionados:

```powershell
npm run pages:build
```

O workflow de publicação envia o artefato estático para o GitHub Pages a cada atualização da branch `main`.

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
- [Visão do produto](./docs/visao-do-produto.md)
- [Arquitetura](./docs/arquitetura.md)
- [Modelo didático](./docs/modelo-didatico.md)
- [Rascunhos e microssequências](./docs/rascunhos-e-microssequencias.md)
- [Contrato público atual](./docs/aralearn-contract.md)
- [Assistência por IA generativa](./docs/assistencia-por-ia.md)
- [Pesquisa e avaliação](./docs/pesquisa-e-avaliacao.md)
- [Exemplos JSON](./docs/examples/)
- [Histórico de versões](./CHANGELOG.md)

## Status

O AraLearn está em desenvolvimento ativo. A versão atual já consolida uma base funcional para estudo, autoria local, persistência, importação, exportação, validação automatizada, assistência por IA generativa e empacotamento Android.

As próximas iterações devem aprofundar:

- rastreabilidade entre conteúdo original e material gerado;
- critérios de qualidade didática;
- avaliação com usuários;
- versionamento local de percursos de aprendizagem;
- ampliação dos tipos de card;
- integração mais clara entre estudo breve e formação aprofundada.

O projeto parte de uma convicção simples: aprender não é apenas consumir conteúdo. Aprender é transformar informação em prática, erro, revisão, memória, autonomia e entendimento.
