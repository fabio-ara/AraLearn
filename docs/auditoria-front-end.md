# Auditoria do front-end

Esta auditoria inicia a issue #60 e registra a linha de base anterior à nova
Central, aos modos Ler/Editar e ao sistema visual claro/escuro. Ela não autoriza
uma reconstrução indiscriminada: cada migração deve preservar uma jornada útil,
substituir um contrato identificado e receber teste próprio.

## Escopo e método

A linha de base foi levantada em 31 de julho de 2026 por inspeção do código, do
histórico Git, dos testes e dos contratos remotos vigentes. As próximas etapas
acrescentarão capturas reproduzíveis e medições de jornadas em celular estreito,
paisagem, tablet e desktop.

Foram considerados:

- shell, autenticação, início e navegação estrutural;
- leitor de microssequência e os dezoito `resources`;
- edição local, assistência por API e comentários;
- biblioteca remota, Trilhas, Coleções e sincronização;
- Chatbot, Plugin, OAuth e autoria remota;
- workspaces compostos, publicações e ciclo editorial que ainda não possuem
  representação suficiente no aplicativo;
- responsividade, teclado, toque, offline e retorno após interrupção.

## Linha de base técnica

- `public/styles.css` possui aproximadamente 178 kB e 8,6 mil linhas.
- O arquivo contém 207 cores hexadecimais e 555 usos de `rgb()` ou `rgba()`.
- Há uma camada inicial de variáveis, mas a interface permanece presa a uma
  paleta escura e muitos componentes declaram cores diretamente.
- O renderizador de cards ainda contém cores literais para grafos, planos,
  séries estatísticas e estados visuais.
- O CSS conserva seletores de uma antiga interface de submissão editorial cujo
  componente foi removido no corte do armazenamento relacional anterior.
- A interface atual lê capacidades remotas, mas reduz a decisão visual a um
  único sinal de publicação no catálogo.
- O backend já distingue workspace, publicação privada, submissão, revisão e
  publicação oficial; o front-end não permite compreender essas relações.

Esses números são uma linha de base de engenharia, não uma métrica de qualidade.
O objetivo não é reduzir linhas por si só, mas remover duplicação semântica,
cores órfãs e responsabilidades concorrentes.

A medição é reproduzida por `npm run audit:frontend`. O resultado inicial sem
timestamp volátil está em
[`evidence/frontend-baseline-2026-07-31.json`](evidence/frontend-baseline-2026-07-31.json).

## Evolução verificada da linha de base

As etapas 30.2 e 30.3 introduziram a fundação clara/escura, o conjunto de
ícones SVG e a migração integral do leitor e dos dezoito `resources`. O auditor
agora examina separadamente CSS de runtime e código gerador: ambos precisam
conter zero cores literais. A galeria canônica valida 18 resources em dois
temas e quatro larguras, e os percursos E2E preservam prática, resposta,
progresso e navegação.

Os resultados reproduzíveis desta etapa estão em
[`evidence/frontend-resource-stage-2026-08-01.json`](evidence/frontend-resource-stage-2026-08-01.json).

## Mapa atual de navegação

```text
Início
├── curso
│   ├── módulo
│   │   ├── lição
│   │   │   └── microssequência
│   │   │       └── leitor de cards
│   │   └── ações estruturais
│   └── ações estruturais
├── criação local rápida
├── Chatbot
└── Central remota
    ├── Central
    ├── Coleções
    ├── Trilhas
    └── Chatbot
```

O esqueleto curso → módulo → lição → microssequência → card é compreensível e
deve permanecer. O problema principal está na ausência de uma visão progressiva
dos objetos remotos e na mistura entre estudo, edição e configuração dentro do
leitor.

## Inventário e decisão inicial

| Superfície | Estado atual | Decisão inicial |
| --- | --- | --- |
| autenticação | enxuta, porém presa ao tema escuro | manter o fluxo; migrar para tokens e testar autofill, erro e recuperação |
| início e hierarquia | cards e botões compactos já organizam o percurso | manter a estrutura; simplificar contraste, densidade e hierarquia visual |
| leitor | concentra estudo, prática, índice e autoria | preservar Ler limpo; mover autoria para um modo Editar explícito e contextual |
| assistência por API | funciona em aba separada do card | substituir pela seleção no próprio card e caixa inferior contextual |
| edição manual | oferece formulários estruturais extensos | manter somente campos simples previstos na #61; autoria estrutural continua no chat |
| comentários | registro individual pouco integrado | substituir pelo modelo situado e persistente da #62 |
| Coleções e Trilhas | exibidas como abas remotas independentes | preservar os nomes amigáveis e tratá-los como vistas do mesmo domínio |
| Chatbot/Plugin | configuração disponível em painel auxiliar | manter como superfícies distintas do mesmo backend; retirar jargão desnecessário |
| workspaces | operáveis pelo chat, quase invisíveis no app | introduzir a Central e detalhes progressivos |
| ciclo editorial | backend completo, front-end ausente | reconstruir sobre o contrato v5; não restaurar o componente antigo |
| capacidades | reduzidas no cliente a um booleano | projetar capacidades canônicas por conta e, futuramente, por workspace |
| sincronização | estado local existe, parte dele aparece na biblioteca | reunir estado compreensível em `Neste dispositivo`, sem logs técnicos |
| ícones | mistura SVG, caracteres Unicode e emoji | convergir para SVG monocromático com `currentColor` e nomes acessíveis |
| CSS | arquivo único com tokens parciais e regras históricas | separar fundação, componentes, modos e resources; remover resíduos após cobertura |

## Navegação implantada localmente

```text
Início
├── Continuar / Trilhas
├── Coleções
└── Central
    ├── Em construção
    ├── Em Trilhas
    ├── Em avaliação
    ├── Em Coleções
    └── Neste dispositivo

Leitor de card
├── estado normal: conteúdo e prática ocupam a superfície
├── ações situadas: revelar / limpar / tentar novamente / observar
└── modo Editar, ativado no contexto
    ├── selecionar card ou resources na própria superfície
    ├── editar texto simples
    ├── pedido contextual à IA em caixa inferior
    └── prévia / aplicar / descartar / desfazer
```

A Central não é um dashboard corporativo. Ela responde primeiro a “onde está
cada coisa?” e revela ações somente quando a conta e o workspace as permitem.
Contagens e listas precedem gráficos; IDs, hashes e revisões ficam restritos a
diagnóstico opcional.

O recorte #74 implantou essa projeção na ramificação local. A abertura consulta
somente contagens e capacidades. Cada lista usa paginação por cursor e é
carregada ao ser aberta; Coleções e Trilhas conservam suas superfícies próprias.
O IndexedDB sobrescreve um único cache pequeno por conta, contendo o resumo e a
primeira página já conhecida de cada seção. Revogação de sessão remove esse
cache e capacidades em cache nunca autorizam uma escrita.

## Edição contextual implantada localmente

O recorte local da #61 removeu as duas abas equivalentes. O leitor permanece
montado enquanto **Editar** revela seleção de card e de recurso, edição manual
restrita, caixa de pedido, configuração do provider e prévia inferior. Um
reparo pode alcançar vários cards da mesma microssequência, mas cada proposta é
pequena e independente; a validação conjunta precede um único commit.

O estado auxiliar usa uma única entrada IndexedDB sobrescrita por curso. A fila
aceita até oito pedidos sem anexos, 4.000 caracteres e doze cards por pedido. A
reversão conserva somente a última microssequência afetada; ao desfazer a
criação de uma microssequência, guarda apenas o ID criado e as posições das
irmãs. Prompt, resposta de provider, prévia, curso e contexto montado não entram
nesse registro nem na outbox.

Os testes cobrem catálogo e curso privado, um e vários cards, edição manual de
texto, escolha, lacuna e tabela, criação nas quatro posições, descarte,
reversão, reconexão, resposta inválida, alvo obsoleto, CAS entre abas, teclado e
toque em viewport Android. O funcionamento de leitura e edição manual não
depende de provider. A sincronização remota do rascunho continua fora deste
recorte e será reconciliada com o domínio de workspaces da #58.

## Estados remotos que precisam de projeção

- workspace ativo, origem, atualização e quantidade de publicações;
- curso materializado ou ainda planejado no workspace;
- publicação privada parcial ou completa em Trilhas;
- curso oficial selecionado em Trilhas;
- submissão própria e seu estado corrente;
- fila editorial, concessão e workspace de revisão para quem puder revisar;
- coleção, posição e publicação oficial para quem puder administrar;
- rascunho local, atualização remota adiada, outbox e rejeição neste dispositivo.

A projeção deve ser paginada e derivada do estado corrente. Não haverá snapshot
da Central, histórico visual ilimitado nem duplicação de documentos de curso.

## Recortes executáveis

1. fundação visual, matriz pedagógica e capturas da linha de base;
2. tokens semânticos, preferência de modo e infraestrutura de testes;
3. migração do shell, navegação, overlays e ícones;
4. projeção remota e Central somente de leitura — concluído localmente;
5. ações contextuais autorizadas na Central;
6. modo Editar contextual no leitor — concluído localmente, com sincronização
   remota ainda dependente da #58;
7. comentários, workspaces e papéis;
8. indicadores não punitivos já fundamentados;
9. remoção final de CSS, componentes e contratos substituídos — concluída
   localmente no recorte #75.

Cada recorte termina com testes, orçamento, documentação, limitações e
comparação visual. Uma etapa não publica site ou APK enquanto a jornada local
correspondente não estiver aprovada pelos testes.

## Consolidação final do sistema visual

O recorte #75 introduziu uma auditoria de resíduos que cruza cada seletor com
os emissores reais em `src/` e `public/`. A limpeza retirou o editor low-code,
o painel antigo de submissões e outros seletores sem emissor. Listas de
seletores mistos também perdem apenas os ramos órfãos; estados construídos em
tempo de execução, como origem de curso e tons dos resources, permanecem
protegidos pelo componente-base.

Depois da limpeza, `public/styles.css` passou de 184.728 para 127.379 bytes e
não possui cor literal, regra órfã, ramo órfão, glifo de interface nem seletor
de submissão substituído. Cores concretas ficam exclusivamente nas opções de
`styles-tokens.css`; componentes consomem decisões semânticas. A verificação é
reproduzível por `npm run audit:residues` e pela suíte automatizada.
