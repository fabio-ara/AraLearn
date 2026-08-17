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

Progresso, marcas de revisão e observações formam um **estado pessoal** separado
do conteúdo canônico. Uma pessoa com acesso pode estudar e conservar seu
próprio estado, mas não recebe autoridade para editar o Curso. O [guia do
estudante](docs/guia-estudante.md) ensina o percurso completo.

## Como se cria e revisa conteúdo

Autoria lista somente os Cursos pertencentes à pessoa autenticada. Um Curso
novo nasce privado, com título, objetivo e orientações, e pode ser usado sem
passar por estados de rascunho, aprovação ou publicação.

Ao abrir um Curso, a interface oferece quatro destinos compactos:

- **Planejamento:** título, objetivo, público, escopo, orientação, resultados
  pretendidos, unidades de análise, requisitos de evidência e Partes de autoria;
- **Estrutura:** hierarquia compacta de Módulos, Lições e Microssequências;
- **Inspeção:** sequência vertical paginada das Unidades materializadas;
- **Pessoas:** proprietário e acessos diretos concedidos somente para Estudo.

As ferramentas de autoria por **Model Context Protocol (MCP)** leem e alteram
esse mesmo Curso. Elas listam Cursos próprios, leem a composição paginada,
criam e alteram Cursos, gerem perfil e acesso e consultam a biblioteca de
componentes didáticos. A revisão de estado e as chaves de repetição segura
impedem que duas edições silenciosamente se sobrescrevam ou que uma chamada
repetida duplique uma operação.

O planejamento por Partes já é persistido e editável em linguagem natural. A
faixa inicial de 7–12 Partes é uma sugestão configurável, não uma lei
pedagógica. Cada Parte referencia microssequências reais sem entrar na
hierarquia do Curso, e a produção registra tentativas e etapas retomáveis. A
interface pode copiar um pedido de materialização para o chat conectado, mas
só mostra como produzido aquilo que o servidor efetivamente gravou.

A Inspeção percorre o Curso inteiro ou um recorte por Parte, Unidades sem Parte,
Módulo, Lição ou Microssequência, mantém no navegador uma janela limitada e
conserva localmente a Unidade corrente. Respostas ficam desativadas nessa leitura. Edição
contextual, proveniência, anotações autorais, correção, variantes e analytics
de pesquisa pertencem às próximas fatias.

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
os Cursos já abertos e o estado pessoal. Assim, conteúdo carregado anteriormente
pode ser retomado sem rede. Alterações pessoais feitas offline formam uma fila
por Curso e são enviadas quando a conexão retorna.

No servidor, PostgreSQL conserva o Curso vivo, suas entidades normalizadas,
acessos diretos, eventos mínimos e estados pessoais. O Storage de objetos é
usado nesta etapa apenas para fotos privadas de perfil; o conteúdo do Curso não
depende de um artefato integral ou imutável. Concorrência otimista e
idempotência delimitada protegem as mutações sem introduzir um workflow
editorial.

A justificativa, as alternativas e os limites estão em
[Persistência relacional e sincronização](docs/persistencia-relacional.md).

## Aplicação web e Android

A mesma aplicação é entregue na web e como APK Android nas releases do
repositório. A interface de Estudo mantém largura confortável também no
desktop; a Autoria usa o mesmo princípio mobile-first, com navegação
iconográfica entre áreas.

## Estado e limites

O código desta revisão implementa a identidade única de Curso vivo, a lista e
a composição paginadas, a Inspeção vertical owner-only, o estado pessoal, a
Autoria restrita ao proprietário, o acesso direto para Estudo e o perfil humano
mínimo com nome e foto privada.

Esse corte ainda não está promovido ao serviço hospedado. Antes da promoção, o
importador precisa converter e validar todos os Cursos reais, os componentes
didáticos bloqueadores precisam ter equivalência semântica, o banco local deve
ser reconstruído e a migração remota deve passar pelos mesmos gates. Portanto,
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
