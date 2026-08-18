# AraLearn

AraLearn é uma plataforma móvel de aprendizagem para estudar, criar e revisar
**Cursos vivos**: o conteúdo pode ser usado enquanto continua sendo planejado,
produzido e corrigido. O mesmo Curso aparece em Estudo, na Autoria visual e nas
ferramentas de autoria conversacional; não existe uma cópia “publicada” que
precise ser mantida em paralelo.

O conteúdo segue uma progressão explícita:

```text
Curso → Módulo → Lição → Microssequência didática → Unidade de estudo
```

A **Microssequência didática** organiza um avanço conceitual delimitado. Cada
**Unidade de estudo** é uma etapa renderizável dessa sequência e pode combinar
texto, fórmulas, diagramas, código, tabelas e uma forma de resposta. *Flashcard*
fica reservado ao caso específico de uma unidade organizada como pista e
resposta para prática de recuperação; não nomeia todo o conteúdo do AraLearn.

## O problema educacional

Materiais de estudo frequentemente impõem dois trabalhos ao mesmo tempo:
compreender o assunto e descobrir como o material foi organizado. Resumos
excessivamente condensados, conceitos sem preparação, diagramas ambíguos e
exercícios desconectados da explicação aumentam esse esforço sem demonstrar
melhor aprendizagem.

O AraLearn adota quatro compromissos:

1. não pressupor conhecimentos que ainda não foram ensinados;
2. distribuir a explicação em avanços conceituais manejáveis, sem confundir
   segmentação com superficialidade;
3. praticar o conhecimento desenvolvido pela sequência, com variedade
   determinada pela finalidade da tarefa;
4. usar a representação própria do objeto estudado quando ela comunicar
   melhor do que texto corrido.

Esses compromissos orientam contratos, interface e auditorias; não são, por si
sós, prova de eficácia. A [documentação pedagógica](docs/modelo-didatico.md)
separa fundamentação, hipótese, implementação e resultado empírico.

## Como se estuda

Depois de entrar, a pessoa vê diretamente os Cursos que possui e aqueles aos
quais recebeu acesso. A lista inicial é fina: traz identidade, título, objetivo,
contagens e progresso. A composição completa é buscada somente quando o Curso é
aberto e fica armazenada no dispositivo para retomada.

Estudo percorre Curso, Módulo, Lição, Microssequência didática e Unidade de
estudo. O controle principal confirma a resposta quando necessário, mostra o
feedback e depois avança. A pessoa também pode marcar uma unidade para rever ou
registrar uma observação situada, como dúvida, possível erro ou trecho confuso.

Progresso e marcas de revisão formam o **estado pessoal v2**, separado do
conteúdo canônico. Observações são **Anotações ancoradas** próprias, também
separadas do conteúdo: podem existir várias na mesma Unidade e chegam à caixa
de entrada do proprietário sem revelar registros de outros estudantes. Uma
pessoa com acesso pode estudar e conservar seus próprios dados, mas não recebe
autoridade para editar o Curso. O [guia do estudante](docs/guia-estudante.md)
ensina o percurso completo.

Quando uma Unidade possui atribuições públicas, o botão **Fontes** busca as
citações somente ao ser aberto. O Estudo nunca recebe o catálogo privado: uma
Fonte oculta ou legada não resolvida não aparece, e o link externo só é
entregue quando a pessoa autora autorizou **citação e link**.

## Como se cria e revisa conteúdo

Autoria lista somente os Cursos pertencentes à pessoa autenticada. Um Curso
novo nasce privado, com título e objetivo, e pode ser usado sem
passar por estados de rascunho, aprovação ou publicação.

Ao abrir um Curso, a interface oferece sete destinos compactos:

- **Planejamento:** título, objetivo, público, escopo, resultados
  pretendidos, unidades de análise, requisitos de evidência e Partes de autoria;
- **Parâmetros:** decisões pedagógicas, orientação natural, herança, política
  de componentes, itens do plano atribuídos a cada Microssequência e comparação
  factual entre planejado e aplicado;
- **Fontes:** catálogo privado e versionado, Âncoras exatas e atribuições
  ordenadas a itens do plano ou Unidades de estudo;
- **Estrutura:** hierarquia compacta de Módulos, Lições e Microssequências;
- **Inspeção:** sequência vertical paginada das Unidades materializadas;
- **Auditoria e correções:** no mesmo destino das Observações, reúne a caixa de
  entrada das Anotações ancoradas e o ciclo versionado de achado, proposta,
  aplicação, verificação e rollback;
- **Pessoas:** proprietário e acessos diretos concedidos somente para Estudo.

As ferramentas de autoria por **Model Context Protocol (MCP)** leem e alteram
esse mesmo Curso. Elas listam Cursos próprios, leem a composição paginada,
criam e alteram Cursos, consultam e vinculam Fontes, operam auditoria e
correções, gerem perfil e acesso e consultam a biblioteca de componentes
didáticos. O MCP continua com seis ferramentas: as capacidades novas entram em
`lerCurso` e `alterarCurso`. A revisão de estado e as chaves de repetição
segura impedem que duas edições silenciosamente se sobrescrevam ou que uma
chamada repetida duplique uma operação.

O planejamento por Partes já é persistido e editável em linguagem natural. A
faixa inicial de 7–12 Partes é uma sugestão configurável, não uma lei
pedagógica. Cada Parte referencia microssequências reais sem entrar na
hierarquia do Curso, e a produção registra tentativas e etapas retomáveis. A
interface pode copiar um pedido de materialização para o chat conectado, mas
só mostra como produzido aquilo que o servidor efetivamente gravou.

Na área **Parâmetros**, unidades de análise e requisitos de evidência do plano
são atribuídos explicitamente às Microssequências que devem realizá-los. Um
item pode servir a vários alvos e cada alvo pode receber vários itens; a
materialização não presume que toda Microssequência cubra o plano inteiro.

Na área **Fontes**, cada registro possui revisões append-only e pode receber
Âncoras de página, tempo, fragmento URI ou trecho textual. Toda atribuição nova
substitui o conjunto completo do alvo e exige ao menos uma Âncora ativa da
revisão exata da Fonte. Referências textuais herdadas foram preservadas, na
mesma identidade e ordem, como legado não resolvido e oculto; o sistema não
inventa metadados para completá-las.

A Inspeção percorre o Curso inteiro ou um recorte por Parte, Unidades sem Parte,
Módulo, Lição ou Microssequência, mantém no navegador uma janela limitada e
conserva localmente a Unidade corrente. Respostas ficam desativadas nessa
leitura. Dela, a pessoa autora pode anotar ou auditar a Unidade exata. A
correção v1 altera somente campos editáveis e a proveniência dessa Unidade,
preserva um checkpoint e exige verificação posterior; variantes e analytics de
pesquisa pertencem a fatias posteriores.

Comece pelo [guia do professor e autor](docs/guia-professor-autor.md). A
explicação do protocolo está em [Autoria por MCP](docs/autoria-mcp.md).

## Representações acadêmicas

O AraLearn compõe Unidades de estudo com **componentes didáticos**. Há
componentes para texto, código, tabelas, fórmulas, matrizes, gráficos,
diagramas, processos e formas de resposta. Eles não são decoração: cada um
deve preservar uma convenção reconhecível na área e uma finalidade
instrucional explícita.

O **núcleo de execução de componentes** conhece composição, ciclo de vida,
acessibilidade e protocolos comuns. Cada **pacote de componente** mantém seu
contrato, validação, apresentação, campos editáveis, possibilidades de prática
e descrição acadêmica. A arquitetura é detalhada em
[Componentes didáticos e packages](docs/componentes-didaticos.md).

## Funcionamento sem conexão e sincronização

O navegador e o aplicativo Android usam **IndexedDB** para manter a lista fina,
os Cursos já abertos, o estado pessoal v2 e o cache das Anotações ancoradas.
Assim, conteúdo carregado anteriormente pode ser retomado sem rede. Progresso e
**Rever** usam sua fila por Curso; comandos de observação usam uma outbox
separada e são enviados quando a conexão retorna.

Auditoria, achados e correções são online-only: não possuem store, cache
autoritativo ou outbox no IndexedDB. Isso não altera o funcionamento offline
das Observações.

No servidor, PostgreSQL conserva o Curso vivo, suas entidades normalizadas,
Anotações ancoradas, acessos diretos, eventos mínimos e estados pessoais. O
Storage de objetos é usado nesta etapa apenas para fotos privadas de perfil; o
conteúdo do Curso não depende de um artefato integral ou imutável. Concorrência
otimista, versões específicas e idempotência delimitada protegem as mutações
sem introduzir um workflow editorial.

A justificativa, as alternativas e os limites estão em
[Persistência relacional e sincronização](docs/persistencia-relacional.md).

## Aplicação web e Android

A mesma aplicação é entregue na web e como APK Android nas releases do
repositório. A interface de Estudo mantém largura confortável também no
desktop; a Autoria usa o mesmo princípio mobile-first, com navegação
iconográfica entre áreas.

## Estado e limites

O código desta revisão implementa a identidade única de Curso vivo, a lista e
a composição paginadas, a Inspeção vertical owner-only, Fontes e proveniência
por alvo, Anotações ancoradas estudantis e autorais, o ciclo owner-only e
online de auditoria, correção e verificação, o estado pessoal v2, a Autoria
restrita ao proprietário, o acesso direto para Estudo e o perfil humano mínimo
com nome e foto privada.

O corte é limpo: `StudyUnit.sources` não existe mais no conteúdo. Composição e
materialização confirmam as atribuições separadas na mesma transação das
Unidades, a migration `1900` preserva referências anteriores como legado oculto
e não resolvido até resolução in-place, a migration `2000` introduz Anotação
ancorada e estado pessoal v2 sem leitura ou escrita dupla e a migration `2100`
instala o ciclo mínimo novo sem reativar a auditoria substituída.
Runs antigos, mandatos, findings e artefatos de desenho substituídos não entram
como fonte, fallback ou compatibilidade.

Esse corte ainda não está promovido ao serviço hospedado. Antes da promoção, o
importador precisa converter e validar todos os Cursos reais, os componentes
didáticos bloqueadores precisam ter equivalência semântica, o banco local deve
ser reconstruído e as migrations `1400` a `2100` devem passar juntas pelos
mesmos gates. Os limites de paginação e payload tornam o consumo mensurável,
mas ainda não provam sustentabilidade no Supabase Free Plan. Portanto,
a aplicação pública e o APK da última release podem refletir a arquitetura
anterior até a publicação de uma nova versão.

Testes de software demonstram contratos e comportamentos observados; não
demonstram, sozinhos, aprendizagem, compreensão da interface ou validade de
construto. O [estado do produto](docs/estado-atual-e-roadmap.md) separa o que
existe, está conectado, é acessível, funciona e ainda depende de validação.

## Documentação

A documentação é material de aprendizagem sobre o produto. Ela introduz os
termos técnicos necessários, explica o problema, compara alternativas, justifica
a decisão e explicita consequências e limites.

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

Comece pela validação mais próxima da mudança e amplie somente quando o risco
for transversal. O [guia do desenvolvedor](docs/guia-desenvolvedor.md) explica
testes, build web, Supabase local e Android.

## Licença

O código-fonte é distribuído nos termos de [LICENSE.md](LICENSE.md).
