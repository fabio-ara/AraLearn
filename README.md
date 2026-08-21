# AraLearn

AraLearn é uma plataforma móvel para estudar, criar e revisar **Cursos vivos**.
O conteúdo pode ser estudado enquanto continua sendo planejado, produzido e
corrigido. Estudo, Autoria visual e Autoria conversacional trabalham sobre o
mesmo Curso e a mesma identidade.

O percurso segue uma hierarquia explícita:

```text
Curso → Módulo → Lição → Microssequência didática → Unidade de estudo
```

A **Microssequência didática** organiza um avanço conceitual delimitado. Cada
**Unidade de estudo** realiza uma etapa dessa sequência e pode reunir texto,
fórmula, diagrama, código, tabela e uma forma de resposta. *Flashcard* designa
apenas a Unidade organizada como pista e resposta para prática de recuperação.

## O problema educacional

Materiais de estudo costumam impor dois trabalhos ao mesmo tempo: compreender o
assunto e descobrir como o material foi organizado. Conceitos sem preparação,
resumos excessivamente condensados, diagramas ambíguos e exercícios desligados
da explicação acrescentam esforço sem demonstrar melhor aprendizagem.

O AraLearn orienta seus Cursos por quatro compromissos:

1. apresentar os conhecimentos necessários antes de usá-los;
2. distribuir a explicação em avanços manejáveis e preservar a profundidade do
   assunto;
3. praticar o conhecimento desenvolvido pela sequência, com variedade definida
   pela finalidade da tarefa;
4. empregar a representação própria do objeto quando ela comunica melhor do que
   a prosa.

Esses compromissos orientam contratos, interface e auditoria. Sua presença no
produto ainda precisa ser distinguida de evidência sobre aprendizagem. O
[modelo didático](docs/modelo-didatico.md) explica essa distinção.

## Como se estuda

Depois de entrar, a pessoa encontra os Cursos que possui e aqueles aos quais
recebeu acesso. Um único seletor e uma única prévia apresentam título, objetivo,
relação de acesso, contagens, progresso e disponibilidade local do Curso
escolhido. A ação **Começar**, **Continuar** ou **Retomar** busca a composição
completa quando necessário e a conserva no dispositivo.

Estudo percorre Curso, Módulo, Lição, Microssequência didática e Unidade de
estudo. O controle principal confirma uma resposta quando necessário, apresenta
o retorno e depois avança. A pessoa também pode marcar uma Unidade para rever ou
registrar uma observação situada, como dúvida, possível erro ou trecho confuso.

Progresso e marcas de revisão formam o **estado pessoal**, separado do conteúdo
do Curso. As observações ficam em **Anotações ancoradas** próprias: podem existir
várias na mesma Unidade e chegam à caixa de entrada do proprietário sem revelar
registros de outros estudantes. O acesso compartilhado permite estudar e
conservar dados pessoais de continuidade; a edição permanece com o
proprietário.

Quando uma Unidade possui proveniência pública, o botão **Fontes** busca as
citações ao ser aberto. Estudo recebe apenas a projeção autorizada. Uma Fonte
oculta ou uma referência anterior ainda sem comprovação fica restrita à
Autoria; o endereço externo aparece somente com a opção **Citação e link**.

O [guia do estudante](docs/guia-estudante.md) apresenta o percurso completo.

## Como se cria e revisa conteúdo

Autoria lista somente os Cursos da pessoa autenticada. Um Curso novo nasce
privado, com título e objetivo. Assim que contém Unidades válidas, já pode ser
aberto em Estudo pelo proprietário ou por quem recebeu acesso.

Ao abrir um Curso, a interface conserva a mesma largura compacta de Estudo e
parte de quatro destinos por ícone. Cada destino revela somente as capacidades
necessárias à tarefa corrente:

- **Curso:** Estrutura, Planejamento, Parâmetros e Fontes;
- **Revisar:** Inspeção, Observações, auditoria e correções;
- **Pesquisa:** Variantes, Analytics e fatos da Autoria;
- **Pessoas:** proprietário e acessos diretos concedidos para Estudo.

Na Inspeção, o autor percorre a hierarquia sem perder a Unidade em foco. Pode
editar ali mesmo as folhas textuais declaradas pelo componente ou pedir uma
sugestão focal ao relay local configurado no dispositivo, conferir a prévia e só
então aplicar. A credencial do provider permanece no relay, fora do AraLearn; a
conversa contextual é transitória. O ChatGPT conectado por MCP continua sendo a
via principal para planejar, materializar, discutir e auditar o Curso inteiro.
O relay foi comprovado no ambiente web local. Desde a versão 0.0.24, o
aplicativo Android encaminha a chamada por uma ponte nativa fixa para o relay,
sem afrouxar a política de conteúdo misto do WebView. O site e o APK estão
publicados; o acesso
à rede local pelo Pages e o relay no APK instalado ainda dependem das validações
de transporte registradas no roadmap.

As ferramentas de autoria conectam assistentes ao mesmo Curso por um protocolo
aberto, o **Model Context Protocol (MCP)**. Elas listam Cursos próprios,
percorrem sua composição, criam e alteram
Cursos, consultam e vinculam Fontes, operam auditoria e correções, gerem perfil
e acesso e consultam a biblioteca de componentes didáticos. O protocolo oferece
seis ferramentas estáveis; diferentes leituras e alterações entram como
operações tipadas. Revisões e identificadores de pedido protegem edições
concorrentes e repetições causadas por falhas de rede.

O planejamento por Partes é persistido e editável em linguagem natural. A faixa
inicial de 7 a 12 Partes é uma sugestão configurável. Cada Parte referencia
Microssequências reais sem entrar na hierarquia curricular, e a produção
registra etapas retomáveis. A interface copia um pedido de materialização para
o ChatGPT conectado e apresenta como produzido somente o que o servidor
confirmou.

Na área **Fontes**, cada registro possui revisões imutáveis, metadados de
autoria, data, idioma, origem, disponibilidade e verificação. Uma revisão pode
receber Âncoras de página, tempo, fragmento de endereço ou trecho textual e até
oito PDFs privados. Cada arquivo tem limite de 20 MiB; conteúdos idênticos usam
os mesmos bytes dentro do Curso, respeitado o total de 64 MiB. Uma nova
atribuição exige uma Âncora ativa da revisão exata. Referências anteriores sem
prova continuam identificadas como pendentes de resolução, com a identidade
preservada e sem metadados inventados.

A Inspeção percorre o Curso inteiro ou um recorte por Parte, Unidades sem Parte,
Módulo, Lição ou Microssequência. Ela mantém uma janela limitada no navegador e
conserva localmente a Unidade corrente. As respostas ficam desativadas. Dela, a
pessoa autora pode anotar ou auditar a Unidade exata. Uma correção altera
somente o conteúdo editável e a proveniência dessa Unidade, preserva o estado
anterior para reversão e exige verificação posterior.

O [guia do professor e autor](docs/guia-professor-autor.md) ensina essas tarefas.
A [Autoria por MCP](docs/autoria-mcp.md) documenta o protocolo conversacional.

## Representações acadêmicas

O AraLearn compõe Unidades de estudo com **componentes didáticos**. Há
componentes para texto, código, tabelas, fórmulas, matrizes, gráficos,
diagramas, processos e formas de resposta. Cada um deve preservar uma convenção
reconhecível na área e uma finalidade instrucional explícita.

O núcleo de execução conhece composição, ciclo de vida, acessibilidade e
protocolos comuns. Cada pacote de componente mantém seu contrato, validação,
apresentação, campos textuais editáveis, possibilidades de prática e descrição
acadêmica. A arquitetura está em [Componentes didáticos e
pacotes](docs/componentes-didaticos.md).

## Funcionamento sem conexão e sincronização

O navegador e o aplicativo Android usam **IndexedDB**, o banco local do
dispositivo, para manter a lista resumida, os Cursos já abertos, o estado
pessoal e as Anotações necessárias à continuidade. Conteúdo carregado
anteriormente pode ser retomado sem rede. Progresso e **Rever** usam uma fila por
Curso; comandos de observação usam outra fila e são enviados quando a conexão
retorna.

Auditoria, achados e correções exigem conexão e não ficam em uma fila local. As
Observações conservam sua própria cópia e fila para uso sem conexão.

No servidor, PostgreSQL conserva o Curso vivo, suas entidades normalizadas,
Anotações ancoradas, acessos diretos, eventos mínimos e estados pessoais. O
armazenamento de objetos guarda fotos privadas de perfil e PDFs privados ligados
às Fontes. Concorrência otimista, versões específicas e repetição segura
protegem as alterações.

A justificativa e os limites estão em [Persistência relacional e
sincronização](docs/persistencia-relacional.md).

## Aplicação web e Android

A mesma aplicação é entregue na web e como pacote de instalação Android (APK)
nas versões publicadas do repositório. A linha corrente é a 0.0.25, sobre o
manifesto hospedado `20260820224424`. Estudo e Autoria conservam uma superfície
centralizada de até 430 px também no computador. A entrada de Estudo usa um
único seletor de Curso e uma única prévia, sem transformar a biblioteca num
painel de cartões; a Autoria usa quatro grupos iconográficos com divulgação
progressiva.

## Estado e limites

O AraLearn usa uma única identidade de Curso vivo, leitura paginada, Inspeção
vertical exclusiva do proprietário, Fontes com proveniência e PDFs privados,
Anotações ancoradas, auditoria e correções, Variantes, Pesquisa, estado pessoal,
acesso direto para Estudo e perfil humano mínimo com nome e foto privada.

As Fontes ficam em relações próprias, separadas do conteúdo da Unidade. A
produção confirma a Unidade e suas atribuições de proveniência na mesma
operação. Referências anteriores sem metadados suficientes permanecem ocultas
no Estudo até serem resolvidas pela pessoa autora. Observações, achados de
auditoria, correções e estado pessoal também possuem regras próprias de acesso e
persistência.

O [estado do produto](docs/estado-atual-e-roadmap.md) registra capacidades,
verificações e limites operacionais da versão disponível. Testes de software
demonstram contratos e comportamentos observados; efeitos sobre aprendizagem e
compreensão da interface exigem avaliação com pessoas e tarefas adequadas.

## Documentação

A documentação apresenta o produto por percursos de aprendizagem. Ela explica
primeiro o problema, introduz os termos necessários, justifica as decisões e
expõe consequências e limites.

Comece pelo [mapa da documentação](docs/README.md). Há percursos para usar o
aplicativo, compreender o modelo pedagógico, estudar a engenharia, realizar
Autoria, avaliar o produto e operar sua implantação.

## Desenvolvimento local

Pré-requisitos: Node.js compatível com o projeto e uma configuração pública de
uma instância Supabase.

```bash
npm install
npm run dev
```

O [guia do desenvolvedor](docs/guia-desenvolvedor.md) explica testes, compilação
da aplicação web, Supabase local e Android.

## Licença

O código-fonte é distribuído nos termos de [LICENSE.md](LICENSE.md).
