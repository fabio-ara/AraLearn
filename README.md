# AraLearn

AraLearn é uma plataforma de aprendizagem para estudar, criar e revisar cursos
formados por pequenas sequências de explicação e prática. O aplicativo foi
projetado para o uso cotidiano em celulares, inclusive quando a conexão com a
internet é instável.

Um curso não é tratado como uma coleção aleatória de perguntas. O conteúdo é
organizado em uma progressão explícita:

```text
curso → módulo → lição → microssequência → card
```

A **microssequência** é a menor unidade didática completa. Ela apresenta um
avanço conceitual delimitado, oferece as explicações necessárias e inclui
práticas coerentes com aquilo que foi ensinado. Um **card** é uma etapa dessa
microssequência: pode conter texto, fórmulas, diagramas, código, tabelas ou
outras representações, além de uma forma de resposta quando houver prática.

## O problema educacional

Materiais de estudo frequentemente impõem ao estudante dois trabalhos ao
mesmo tempo: compreender o assunto e descobrir como o material foi organizado.
Resumos excessivamente condensados, conceitos sem preparação, diagramas
ambíguos e exercícios desconectados da teoria aumentam esse esforço sem
necessariamente melhorar a aprendizagem.

O AraLearn adota quatro compromissos para reduzir esse atrito:

1. **não pressupor conhecimentos que ainda não foram ensinados**;
2. **distribuir a explicação em avanços conceituais manejáveis**, sem confundir
   segmentação com superficialidade;
3. **praticar o conhecimento que a sequência efetivamente desenvolveu**, com
   variedade determinada pela finalidade da prática;
4. **usar a representação própria do objeto estudado**, quando um diagrama,
   uma fórmula ou outra notação comunicar melhor do que texto corrido.

Esses compromissos orientam a geração de cursos, os contratos de conteúdo, a
interface de estudo e os critérios de auditoria. Eles não são apresentados
como prova de eficácia: os fundamentos teóricos, as hipóteses e o protocolo de
avaliação são distinguidos na [documentação pedagógica](docs/modelo-didatico.md).

## Como se estuda

Depois de entrar, a pessoa escolhe entre duas atividades do mesmo produto:

- **Estudo** organiza em **Trilhas** os cursos escolhidos pela própria pessoa e
  abre o leitor;
- **Autoria** reúne **Workspaces**, onde o curso é planejado e construído, e
  **Coleções**, o catálogo editorial compartilhado.

Essa divisão não cria duas versões do curso. O mesmo conteúdo e as mesmas
identidades são usados no celular, no desktop e no APK. Estudo permanece livre
de controles editoriais; Coleções não é duplicada nos dois lados.

Adicionar um curso a Trilhas não duplica todo o curso no banco remoto. A ação
cria um vínculo pessoal, e o dispositivo mantém a réplica necessária para o
estudo. Depois do primeiro carregamento, o conteúdo pode ser retomado sem
conexão. O tema visual, a navegação entre cards, as respostas já disponíveis e
o registro local do progresso não aguardam uma requisição de rede.

Durante o estudo, o botão principal tem uma função estável: confirmar uma
resposta quando o card exige resposta, mostrar o feedback e, no toque
seguinte, avançar. A pessoa também pode marcar um card para rever ou registrar
uma observação pedagógica, como dúvida, possível erro ou trecho confuso.

O AraLearn registra apenas o estado funcional necessário para retomar o
percurso. Ele não converte tempo de tela, quantidade de tentativas ou padrões
de acerto em nota, ranking ou vigilância. O funcionamento detalhado está no
[guia de uso](docs/uso-do-app.md) e no [guia do estudante](docs/guia-estudante.md).

## Como se cria e revisa conteúdo

A autoria ocorre sobre o mesmo conteúdo que será estudado. Textos visíveis
podem ser editados diretamente; objetos selecionados podem receber assistência
de um modelo de linguagem; mudanças estruturais mais amplas podem ser feitas
por uma integração de autoria.

No aplicativo, **Autoria** começa por Workspaces e Coleções. Dentro de um
workspace, quatro destinos compactos apresentam uma superfície por vez:
**Mapa** acompanha Partes e microssequências, **Desenho** mostra os valores
efetivos e permite controles estruturados ou Auto, **Conteúdo** reutiliza o
leitor e **Auditoria** localiza achados e seus alvos. A navegação admite uma
quinta superfície contextual de Resultados quando houver dados e autorização.
Não há chat, formulário pedagógico extenso, edição de JSON nem exigência de
identificadores técnicos nessa camada.

Essa integração trabalha por etapas. Primeiro planeja a progressão; depois
materializa partes do curso; em seguida audita o conteúdo e as representações;
por fim repara apenas os problemas confirmados. Uma parte materializada já pode
ser lida e estudada, mesmo que o restante do curso ainda esteja em construção.

O modelo não recebe liberdade irrestrita sobre o banco. Toda operação passa
por contratos de dados, validação e autorização. Quando precisa escolher uma
representação, consulta primeiro um catálogo que descreve a finalidade de cada
tipo de recurso e somente depois obtém o contrato específico dos recursos
selecionados. Essa separação permite acrescentar novas representações sem
refazer o núcleo que organiza cards e cursos.

Para quem quer apenas criar um curso, o percurso começa em [Criar cursos pelo
chat](docs/criar-cursos-pelo-chat.md). A explicação técnica de **Model Context
Protocol (MCP)** — o protocolo usado por clientes externos para descobrir e
chamar as ferramentas de autoria — aparece somente no [capítulo de autoria por
MCP](docs/autoria-mcp.md).

## Representações acadêmicas

O catálogo de recursos inclui texto, código, tabelas, fórmulas, matrizes,
gráficos estatísticos, plano cartesiano, árvores, grafos, diagramas de
conjuntos, processos, modelos de software e outras estruturas. Esses recursos
não existem para ornamentar cards. Cada um deve preservar uma convenção
reconhecível na área, admitir conteúdo complexo sem sobreposição e oferecer
interação dentro do próprio objeto quando houver lacuna ou digitação.

O **kernel** do AraLearn conhece apenas as regras comuns de composição de um
card. Cada **package de recurso** reúne, de forma independente, o contrato, a
validação, a apresentação, os campos editáveis, as possibilidades de prática e
a descrição acadêmica de uma representação. Essa arquitetura é detalhada em
[Recursos de card](docs/recursos-de-card.md).

O curso **AraLearn: Catálogo de recursos** está disponível no catálogo oficial
para experimentar essas representações dentro do fluxo normal do aplicativo.

## Funcionamento sem conexão e sincronização

O navegador e o aplicativo Android usam **IndexedDB**, o banco de dados local
padronizado para aplicações web, para conservar cursos selecionados e mudanças
que ainda precisam ser enviadas. IndexedDB foi escolhido porque suporta dados
estruturados e transações no dispositivo; armazenamento simples de pares de
texto não oferece as mesmas garantias para uma árvore de curso e suas filas de
sincronização.

Quando a rede volta, o aplicativo envia as operações pendentes de cada fluxo e
recebe apenas as novidades necessárias. Identificadores de operação e controle
de revisão impedem que uma repetição silenciosa duplique uma mudança. O banco
remoto guarda estado relacional e metadados; publicações integrais e imutáveis
ficam no armazenamento de objetos. A justificativa, as alternativas e os
limites desse desenho são ensinados em [Persistência relacional e
sincronização](docs/persistencia-relacional.md).

## Aplicação web e Android

A mesma aplicação é entregue em dois formatos:

- [aplicação web](https://fabio-ara.github.io/AraLearn/);
- [APK Android da versão mais recente](https://github.com/fabio-ara/AraLearn/releases/latest).

O conteúdo operacional não é incorporado ao APK: ele é obtido conforme a
conta e mantido localmente para uso posterior. O leitor conserva uma largura
confortável também no desktop; a Autoria usa composição responsiva própria,
com uma superfície por vez no celular e um rail no desktop, sem retirar função
da versão móvel.

## Estado e limites

O produto já oferece autenticação, catálogo, Trilhas, estudo offline,
sincronização, edição contextual, observações pedagógicas, workspaces de
autoria, revisão editorial e integrações de autoria. Ainda são necessários
estudos com participantes para avaliar aprendizagem, compreensão dos papéis,
qualidade da autoria assistida e adequação em diferentes áreas do
conhecimento.

Essa distinção é importante: teste automatizado demonstra que determinada
operação respeita um contrato; não demonstra, sozinho, que pessoas aprendem
mais. O [estado do produto](docs/estado-atual-e-roadmap.md) separa capacidade
implementada, trabalho de engenharia e questão de pesquisa.

## Documentação

A documentação é material de aprendizagem sobre o produto. Ela não exige que
o leitor conheça previamente educação, bancos de dados ou integração de
modelos de linguagem. Cada capítulo introduz os conceitos usados, apresenta o
problema, compara alternativas, justifica a decisão do AraLearn e indica suas
consequências.

Comece pelo [mapa da documentação](docs/README.md). Há percursos próprios para:

- usar o aplicativo;
- compreender o modelo pedagógico e sua literatura;
- estudar a arquitetura, a persistência e a segurança;
- criar, revisar e publicar cursos;
- desenvolver, testar e implantar o sistema;
- avaliar o artefato sem confundir hipótese, propriedade implementada e
  resultado empírico.

## Desenvolvimento local

Pré-requisitos: Node.js compatível com o projeto e uma configuração pública de
uma instância Supabase.

```bash
npm install
npm run dev
```

Validação principal:

```bash
npm test
npm run lint
npm run test:e2e
npm run pages:build
npm run android:debug
```

O [guia do desenvolvedor](docs/guia-desenvolvedor.md) explica o que cada etapa
verifica, como o projeto é organizado e por que os testes são divididos dessa
forma. Para contribuir, consulte também [CONTRIBUTING.md](CONTRIBUTING.md).

## Licença

O código-fonte é distribuído nos termos descritos em [LICENSE.md](LICENSE.md).
