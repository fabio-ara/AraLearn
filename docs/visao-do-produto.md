# Visão do produto

O AraLearn enfrenta uma dificuldade comum no estudo autodidata: há conteúdo demais e percurso de menos. O estudante encontra PDFs, vídeos, fóruns, documentação oficial, aulas gravadas, anotações e respostas de IA, mas continua tendo de decidir sozinho por onde começar, que pré-requisitos considerar, quando praticar e como retomar depois de uma interrupção.

Simon (1971) formulou essa tensão ao mostrar que abundância de informação desloca a escassez para a atenção. Castells (1996) descreveu a sociedade em rede como um ambiente estruturado por fluxos informacionais. Em plataformas digitais, esses fluxos são frequentemente organizados por recomendação algorítmica; Covington, Adams e Sargin (2016), por exemplo, descrevem o sistema de recomendação do YouTube a partir de geração de candidatos e ranqueamento. O AraLearn não tenta imitar essa lógica de fluxo contínuo. Ele tenta converter material disperso em caminho de estudo.

## Proposta

O AraLearn organiza o estudo em uma árvore explícita:

```text
curso -> módulo -> lição -> microssequência -> card
```

Essa árvore torna o estudo manipulável. O curso define o campo geral. O módulo recorta uma região. A lição organiza uma etapa coerente. A microssequência concentra um problema local de aprendizagem. O card apresenta explicação, exemplo, exercício ou representação dentro dessa etapa.

A microssequência é o ponto de equilíbrio. Um card isolado pode perder contexto. Uma lição inteira pode ser grande demais para quem estuda no intervalo entre trabalho, deslocamento e aula. A microssequência permite trabalhar um conteúdo delimitado sem romper a continuidade da trilha.

## Assistência de linguagem

No aplicativo, a assistência por API edita os caminhos textuais selecionados ou
recompõe o card inteiro pelo catálogo. O escopo de microssequência pode
autorizar a criação de cards; o escopo integral de lição pode autorizar no
máximo uma nova microssequência. O resultado estruturado é validado e gravado
diretamente. No card, uma conversa curta permite desfazer, refazer e restaurar
versões; um `no-op` conserva a explicação sem simular mudança. Planejamento,
reorganização e publicação de estruturas extensas
pertencem ao Chatbot personalizado ou ao Plugin; cada mutação aceita altera
somente as partes necessárias de um workspace composto. É o mesmo assistente
na autoria e na revisão editorial; as ferramentas visíveis dependem das
capacidades da conta.

Lewis et al. (2020) mostram a importância de apoiar a geração em informação recuperada. No AraLearn, fontes externas podem apoiar a preparação de conteúdo, mas a resposta de um modelo não substitui contrato, validação e revisão.

## O que o estudante vê

O estudante não precisa conhecer a arquitetura para usar o produto. Em
`Coleções`, seleciona explicitamente os cursos que quer em `Trilhas`; abrir ou
estudar nunca faz essa seleção por conta própria. Em `Trilhas`, cria e organiza
grupos pessoais sem alterar o catálogo. Quando tiver autoridade, pode reparar
cards e seus textos ou solicitar cards e microssequências pelos escopos locais;
para estruturas maiores, pede ao Chatbot ou Plugin que abra um workspace. O
plano resultante aparece em `Trilhas`, e uma publicação oficial só muda por uma
operação autorizada. Quando o conteúdo pede outra forma, o card pode combinar
packages instalados, da escrita e do código a representações
tabulares, espaciais, relacionais, linguísticas, sistêmicas e químicas.

Essa escolha tem base didática. Sweller (1988) e Sweller, Van Merriënboer e Paas (1998) discutem como a carga cognitiva depende do modo como a informação é apresentada. Em temas técnicos, parte do esforço do estudante vem de reconstruir estrutura: onde está a linha da matriz, qual aresta liga dois vértices, que condição conduz a qual ramo do algoritmo. O AraLearn tenta tornar essa estrutura visível.

## Posicionamento no ecossistema

Ferramentas existentes resolvem partes do problema. Buscadores e wikis ajudam a localizar informação. Cadernos digitais ajudam a guardar notas. Sistemas de repetição espaçada ajudam a revisar. Chats com IA respondem dúvidas e geram explicações. Plataformas de ensino oferecem cursos fechados.

O AraLearn ocupa outro ponto: ele trata o estudo como percurso pessoal, organizável, editável e sincronizável. O interesse não está apenas em responder uma pergunta, mas em manter uma sequência que o estudante possa continuar, adaptar e revisar em diferentes momentos e dispositivos.

O funcionamento sem conexão importa também para o uso prático. Depois da
autenticação e do primeiro download, leitura, prática, edição manual, progresso
e comentários podem continuar sem rede. Progresso, comentários e trilhas
aguardam envio até a reconexão; a assistência por API exige conexão. Mudanças
autorizadas preservam a identidade do curso privado próprio ou do curso oficial
administrado, sem criar cópia por correção. Um curso de workspace só é
materializado no Storage quando publicado, o que evita uma cópia integral para
cada mudança pequena. O artefato publicado é imutável, o catálogo é remoto e
nenhum curso operacional vem embarcado no aplicativo.

## Público principal

O público inicial é o estudante-trabalhador: quem estuda com tempo limitado, muitas vezes no celular, em deslocamento, com atenção fragmentada, energia baixa e conexão instável. O projeto não romantiza essas condições; tenta levá-las a sério. Por isso, privilegia etapas delimitadas, réplica offline, prática objetiva e retorno à trilha após uma interrupção.

## Originalidade

A contribuição do AraLearn está na combinação de elementos que, isoladamente, já existem em outras ferramentas:

- microssequências como unidade intermediária entre card e lição;
- autoria assistida em duas escalas: intervenção bottom-up delimitada até a
  lição e planejamento estrutural externo pelo Chatbot ou Plugin;
- catálogo compartilhado, workspace composto e revisões publicadas imutáveis;
- contrato JSON público para intercâmbio e validação;
- validação antes da persistência;
- PostgreSQL/Supabase como fonte compartilhada e réplica relacional no IndexedDB;
- cards renderizados a partir de dados verificáveis;
- foco explícito em estudo móvel e estudantes-trabalhadores.

O resultado pretendido é um ambiente em que a abundância de informação possa ser reorganizada como percurso de aprendizagem.

## Referências citadas

Castells, M. (1996). *The rise of the network society*. Blackwell.

Covington, P., Adams, J., & Sargin, E. (2016). Deep neural networks for YouTube recommendations. *Proceedings of the 10th ACM Conference on Recommender Systems*. <https://doi.org/10.1145/2959100.2959190>

Lewis, P., Perez, E., Piktus, A., Petroni, F., Karpukhin, V., Goyal, N., et al. (2020). Retrieval-augmented generation for knowledge-intensive NLP tasks. *Advances in Neural Information Processing Systems*, 33, 9459-9474. <https://arxiv.org/abs/2005.11401>

Simon, H. A. (1971). Designing organizations for an information-rich world. In M. Greenberger (Ed.), *Computers, communication, and the public interest*. Johns Hopkins Press.

Sweller, J. (1988). Cognitive load during problem solving: Effects on learning. *Cognitive Science*, 12(2), 257-285. <https://doi.org/10.1207/s15516709cog1202_4>

Sweller, J., Van Merriënboer, J. J. G., & Paas, F. (1998). Cognitive architecture and instructional design. *Educational Psychology Review*, 10, 251-296. <https://doi.org/10.1023/A:1022193728205>
