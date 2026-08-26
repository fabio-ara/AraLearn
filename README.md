# AraLearn

AraLearn é uma plataforma para estudar, criar e revisar **Cursos vivos**. O
conteúdo pode ser usado enquanto continua sendo planejado, produzido, discutido
e corrigido. Estudo, Autoria visual e Autoria conversacional trabalham sobre o
mesmo Curso.

Não é necessário conhecer programação, pesquisa ou teoria educacional para usar
o aplicativo. A documentação começa pelas tarefas e oferece aprofundamento
quando ele se torna útil.

## O problema educacional

Materiais digitais costumam separar estudo, produção e revisão em ferramentas
que não compartilham o mesmo objeto. Isso dificulta corrigir uma explicação sem
perder seu lugar no percurso, ligar uma afirmação à fonte exata e distinguir
conteúdo, evidência de uso e hipótese educacional. O AraLearn mantém essas
atividades ao redor do mesmo Curso vivo e conserva seus papéis separados.

## Como o conteúdo é organizado

Todo Curso segue uma hierarquia reconhecível:

```text
Curso → Módulo → Lição → Microssequência didática → Unidade de estudo
```

Uma **Microssequência didática** organiza um avanço conceitual delimitado. Cada
**Unidade de estudo** realiza uma etapa desse avanço e pode reunir texto,
fórmula, código, tabela, diagrama, gráfico e uma forma de resposta.

O AraLearn procura preparar os conhecimentos antes de usá-los, distribuir a
explicação em avanços manejáveis, praticar o que foi desenvolvido e escolher a
representação adequada ao objeto. Esses compromissos orientam o produto; não
devem ser confundidos com evidência de aprendizagem. O
[modelo didático](docs/modelo-didatico.md) explica essa diferença.

## Como se estuda

Depois de entrar, a pessoa encontra Cursos próprios e Cursos compartilhados. Um
seletor e uma prévia mostram objetivo, relação de acesso, quantidade de Módulos,
Lições e Unidades, progresso e disponibilidade no dispositivo.

**Começar**, **Continuar** ou **Retomar** abre o ponto adequado. **Voltar**
restaura a origem real, a rolagem e o foco; **Home** oferece uma saída global.
O acesso direto ao pai aparece somente quando uma jornada contextual o exige.
Durante o estudo, a pessoa pode responder às práticas, receber retorno, marcar
uma Unidade para rever, registrar uma Observação e consultar Fontes autorizadas.

Na Unidade, **Visualizar**, **Editar** e **Assistência por IA** são modos irmãos
sobre o mesmo alvo. Se uma pessoa com acesso ao Estudo editar um Curso
compartilhado, a primeira gravação material cria uma cópia privada e preserva o
original. A navegação continua na mesma Unidade da nova cópia.

O [guia do estudante](docs/guia-estudante.md) ensina o percurso completo.

## Como se cria e revisa conteúdo

Autoria mostra somente os Cursos da pessoa proprietária. Um Curso novo nasce
privado. A pessoa pode definir objetivo e público, construir sua hierarquia,
planejar a produção, ajustar parâmetros, registrar Fontes e conceder acesso
direto ao Estudo.

Ao abrir um Curso, a **Visão geral** mostra seu estado, a próxima ação útil e as
sete tarefas principais: **Planejamento**, **Conteúdo**, **Parâmetros e
componentes**, **Fontes**, **Revisão**, **Variantes e pesquisa** e **Pessoas e
acesso**. Conteúdo reúne a hierarquia, a leitura no renderer e a edição
contextual. Revisão oferece um ponto de entrada comum para Observações e
Auditoria sem confundir seus contratos.

Cada Parte do Planejamento conserva o histórico completo das materializações.
Uma execução mostra canal, estado, etapas, resultados e links para os objetos
produzidos; Aplicativo, MCP e Actions aparecem no mesmo percurso visual. Fontes
possuem revisões imutáveis, Âncoras e PDFs privados. Variantes relacionam Cursos
comparáveis, e Pesquisa apresenta fatos, definições, denominadores, ausências e
exportações sem produzir conclusões causais automáticas.

O [guia do professor e autor](docs/guia-professor-autor.md) conduz essas tarefas.

## Usar Assistência por IA

Assistência por IA é uma sessão contextual com minichat. A pessoa discute um
plano, confirma a geração, confere a prévia no renderer real e decide se deseja
aplicar e salvar.

A sessão pode alterar composição e conteúdo da Unidade, estrutura e conteúdo da
Microssequência e a organização de Microssequências dentro da Lição. O contexto
enviado é somente leitura e limitado ao alvo necessário. A resposta usa escrita
tipada e precisa cumprir os contratos do produto.

Para componentes didáticos, o AraLearn descobre progressivamente as famílias e
os contratos exatos, valida a composição e permite reparos delimitados. JSON bem
formado não basta: uma proposta inválida ou não renderizável nunca substitui o
conteúdo corrente.

A pessoa escolhe OpenAI, Gemini ou DeepSeek e fornece uma chave mantida somente
na memória da sessão. O capítulo [Assistência por modelo de
linguagem](docs/assistencia-por-ia.md) explica autoridade, contexto e falhas.

## Criar por conversa

Há dois canais distintos para operar Cursos a partir de uma conversa.

O **Model Context Protocol (MCP)** conecta clientes compatíveis às ferramentas
canônicas do AraLearn. Ele permite localizar Cursos próprios, ler composição,
planejar, materializar, operar Fontes, Auditoria, Variantes e Pesquisa e
consultar componentes didáticos.

Um **GPT personalizado com Actions** usa a descrição OpenAPI publicada pelo
AraLearn e cinco operações HTTP autorizadas. Actions possui OAuth próprio e não
é um modo do MCP. Os dois canais reutilizam o mesmo domínio de Curso sem
compartilhar protocolo ou sessão.

Veja [Autoria por MCP](docs/autoria-mcp.md), [Criar Cursos pelo
chat](docs/criar-cursos-pelo-chat.md) e [Fluxos, instruções e
contratos](docs/fluxos-prompts-e-contratos.md).

## Funcionamento sem conexão e sincronização

O navegador e o Android mantêm no dispositivo a lista de Cursos, composições já
abertas, estado pessoal e filas necessárias à continuidade. Conteúdo carregado
anteriormente pode ser retomado sem rede. Progresso, **Rever** e Observações são
sincronizados quando a conexão retorna.

Operações autorais amplas, Auditoria, correções e Assistência por IA exigem
conexão. O AraLearn não mantém uma fila autoral genérica que poderia aplicar uma
mudança antiga sobre um Curso novo.

No servidor, PostgreSQL conserva o Curso e suas relações. Storage privado guarda
avatares e PDFs. Revisões, identificadores de pedido e repetição segura protegem
alterações concorrentes. A explicação completa está em [Persistência relacional
e sincronização](docs/persistencia-relacional.md).

## Controlar acesso e dados

Um acesso direto permite estudar o Curso, mas não concede coautoria do original.
Na Home, **Ações deste Curso** distingue excluir um Curso próprio de sair de um
Curso compartilhado. **Remover dados deste dispositivo**, **Sair** e **Excluir
conta** também são ações diferentes e informam seu alcance antes da confirmação.

Uma identidade administrativa autorizada encontra **Manutenção** em **Conta e
aparência**. A área apresenta retenção e resíduos classificados pelo produto;
cada remoção é revalidada no servidor e seguida por nova leitura do inventário.

A [página de privacidade](docs/privacidade.md) descreve finalidades, retenção,
acesso e limites.

## Componentes didáticos

Unidades são compostas por pacotes para texto, código, tabelas, fórmulas,
matrizes, gráficos, diagramas, processos e respostas. Cada pacote mantém seu
contrato, validação, apresentação, campos editáveis, acessibilidade e finalidade
instrucional.

Consulte [Componentes didáticos e pacotes](docs/componentes-didaticos.md) para
entender como descoberta, validação e renderização se relacionam.

## Web e Android

A mesma experiência é entregue como site e aplicativo Android. Estudo é a
referência visual: uma coluna central, conteúdo em primeiro lugar, poucas ações
simultâneas e divulgação progressiva. A interface funciona em telefones de 360,
390 e 430 pixels e em telas maiores sem criar um segundo painel de desktop.

Os artefatos de instalação ficam nas publicações do repositório. As instruções
de ambiente, backend e publicação estão em [Implantação](docs/implantacao.md).

## Estado e limites

O produto disponível inclui Estudo, Autoria visual, Assistência por IA,
Autoria conversacional por MCP e por Actions, dados pessoais, controle de acesso
e Manutenção administrativa para identidades autorizadas. O que depende de
conexão ou de permissão é indicado antes da ação.

Testes de software demonstram contratos e comportamentos nas condições
exercitadas. Eles não demonstram, sozinhos, compreensão, usabilidade ou efeito
educacional. Essas afirmações exigem avaliação com pessoas, população, tarefa e
método adequados.

## Documentação

O [mapa da documentação](docs/README.md) oferece percursos para:

- começar a usar o aplicativo;
- compreender o modelo educacional;
- criar e investigar Cursos;
- estudar a engenharia;
- avaliar propriedades, hipóteses e evidências;
- implantar e manter o sistema.

A página [Capacidades e limites atuais](docs/estado-atual-e-roadmap.md) resume o
produto disponível e indica conexão, acesso e limites de cada caso de uso.

## Desenvolvimento local

Pré-requisitos: Node.js compatível com o projeto e configuração pública de uma
instância Supabase.

```bash
npm install
npm run dev
```

O [guia do desenvolvedor](docs/guia-desenvolvedor.md) explica validações,
aplicação web, Supabase local e Android.

## Licença

O código-fonte é distribuído nos termos de [LICENSE.md](LICENSE.md).
