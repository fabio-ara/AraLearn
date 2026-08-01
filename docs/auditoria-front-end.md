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
└── biblioteca remota
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

## Navegação proposta

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
4. projeção remota e Central somente de leitura;
5. ações contextuais autorizadas na Central;
6. modo Editar contextual no leitor;
7. comentários, workspaces e papéis;
8. indicadores não punitivos já fundamentados;
9. remoção final de CSS, componentes e contratos substituídos.

Cada recorte termina com testes, orçamento, documentação, limitações e
comparação visual. Uma etapa não publica site ou APK enquanto a jornada local
correspondente não estiver aprovada pelos testes.
