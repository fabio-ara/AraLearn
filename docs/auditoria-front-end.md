# Auditoria do front-end

Auditar a interface significa verificar se a pessoa consegue localizar,
estudar e alterar o que lhe pertence sem conhecer detalhes internos do sistema.
Não basta encontrar elementos no DOM: é preciso provar conexão com o domínio,
persistência, autorização, rede e comportamento real.

## 1. Método

Cada requisito é examinado em seis níveis:

1. **semântica:** o controle representa a tarefa anunciada;
2. **conexão:** a interação alcança o domínio e o serviço corretos;
3. **autoridade:** UI, Edge Function e PostgreSQL impõem o mesmo limite;
4. **estado:** carregamento, vazio, offline, conflito e falha são distinguíveis;
5. **interação:** toque, teclado, foco, retorno e rolagem funcionam;
6. **proporcionalidade:** DOM, payload, cache e chamadas têm limites verificáveis.

As evidências possuem alcances diferentes:

| Evidência | O que demonstra | O que não demonstra |
| --- | --- | --- |
| inspeção de código | responsabilidade e fluxo previsto | execução no navegador |
| teste unitário | regra isolada | geometria e integração completas |
| teste de navegador | jornada e medidas no motor real | compreensão humana prolongada |
| PostgreSQL real | constraints, concorrência e privilégios | disponibilidade hospedada futura |
| avaliação com pessoas | compreensão e carga percebida na amostra | ausência geral de defeitos |

Uma alegação só é confirmada dentro do alcance da evidência usada.

## 2. Navegação corrente

```text
Shell
├── Estudo
│   └── Curso → Módulo → Lição → Microssequência → Unidade de estudo
├── Autoria
│   └── Curso próprio
│       ├── Planejamento
│       ├── Estrutura
│       ├── Inspeção
│       └── Pessoas
└── Conta e aparência
```

Estudo lista Cursos próprios e compartilhados. Autoria lista somente Cursos
próprios; receber acesso direto não concede edição. O seletor Estudo/Autoria
muda a tarefa sem criar outra identidade de Curso.

O vocabulário visível usa Curso, Parte, Módulo, Lição, Microssequência e Unidade
de estudo. Revisão CAS, cursor, hashes e nomes de RPC pertencem ao protocolo e
só aparecem quando necessários ao diagnóstico.

## 3. Home, Estudo e estado pessoal

A Home usa listas finas paginadas. Um item informa o necessário para localizar
e abrir o Curso, sem baixar milhares de Unidades. Ao entrar em Estudo, o cliente
fixa uma revisão, lê páginas de entidades, recusa mistura entre revisões,
recompõe `aralearn.course.v1` e só então substitui o cache válido.

O percurso de Estudo apresenta uma Unidade por vez. Resposta e feedback são
locais ao ciclo corrente; avançar não espera a persistência remota. Progresso,
marcas para rever e observações pertencem à pessoa e não incrementam a revisão
autoral do Curso.

Sem rede, conteúdo íntegro já carregado pode continuar em Estudo. A fila offline
é específica do estado pessoal. Alteração autoral não simula sucesso quando o
servidor ou a revisão corrente não estão disponíveis.

## 4. Autoria

### Planejamento

Planejamento edita título, objetivo, público, escopo, faixa preferencial, itens
e Partes em linguagem natural. Criar, dividir, unir,
reordenar ou retirar uma Parte não altera implicitamente a hierarquia didática.
Copiar um pedido para o chat conectado não grava tentativa nem progresso.

### Parâmetros

Parâmetros percorre Curso, Módulo, Lição e Microssequência e separa valor
efetivo, atribuição local, orientação original, interpretação e política de
componentes. Numa Microssequência, a cobertura planejada oferece checkboxes
para atribuir unidades de análise e requisitos de evidência. O estado visual é
a relação muitos-para-muitos real: não apresenta o plano inteiro como se todo
item pertencesse a todo alvo e não exige JSON.

### Estrutura

Estrutura apresenta Módulos, Lições e Microssequências em páginas compactas.
Ela serve para localização; não duplica a sequência de leitura da Inspeção.

### Inspeção

Inspeção apresenta uma sequência vertical fiel de Unidades, com respostas e
edição desativadas. O filtro aceita Curso, Parte, Unidades sem Parte, Módulo,
Lição ou Microssequência. Um link profundo usa âncora inclusiva; páginas
posteriores e anteriores usam cursor `{studyUnitId}`. Âncora e cursor são
mutuamente exclusivos.

O front-end pede 12 itens por página, admite resposta de até 24 e mantém no DOM
no máximo 36 Unidades. Itens distantes viram espaçadores, e a busca ocorre nas
duas direções. O contexto fixo, foco, controles abertos e posição visual não
devem saltar quando a janela muda.

A posição local conserva escopo, `studyUnitId`, deslocamento em relação ao topo
fixo e revisão. Atualização concorrente reancora pela identidade; alvo removido
explicitamente é informado como ausente. Coordenação entre abas não interrompe
uma interação recente.

O cache distingue revisão e pedido completo, inclusive escopo, âncora ou cursor,
direção, limite e `maxBytes`. Conserva no máximo quatro páginas ou 8 MiB por
Curso. Sem rede, somente a página exata pode reaparecer, marcada offline ou
desatualizada. Revogação ou outra perda de autoridade purga página e posição.

### Pessoas

O proprietário concede Estudo por e-mail exato de uma conta existente e revoga
pelo identificador retornado. Não há diretório, papel de coautoria ou convite
pendente. A confirmação e a mensagem precisam distinguir acesso para Estudo de
autoridade autoral.

## 5. Paridade entre interface e MCP

A vista MCP `study_units` usa a mesma leitura owner-only da Inspeção. A auditoria
compara escopos, revisão esperada, âncora, cursor, direção, limite, orçamento de
bytes, links profundos, ordem e erros. Uma das superfícies não pode corrigir ou
reinterpretar silenciosamente a resposta da outra.

Uma página normal usa orçamento de 512 KiB, configurável entre 64 KiB e
1.500.000 bytes. A projeção completa falha fechada acima de 1,75 MiB, preservando
margem sob o teto de 2 MiB. O front-end deve apresentar erro recuperável sem
tentar carregar o Curso inteiro como fallback.

## 6. Autoridade e falha fechada

Esconder um controle não é barreira de segurança. A auditoria confirma em
conjunto:

- Autoria e MCP listam somente Cursos próprios;
- a RPC de Inspeção é concedida somente a `service_role` e revalida o ator;
- helper privada não possui execução para papéis de cliente;
- Curso compartilhado permanece acessível apenas em Estudo;
- conflito de revisão conserva a intenção e exige releitura;
- revogação impede nova leitura online e elimina o cache privado conhecido.

RLS, grants e checagem owner-only são camadas complementares. Uma função
privilegiada incorreta não é corrigida apenas por esconder a rota no front-end.

## 7. Sistema visual e acessibilidade

Verificação proporcional abre a aplicação real em 360, 390 e 430 px e desktop,
nos temas claro, escuro e Sistema. Deve conferir:

- ausência de overflow da página e de controles cortados;
- um único scroller vertical principal na Inspeção;
- foco visível, ordem de teclado e retorno ao acionador;
- nomes e estados acessíveis para ícones;
- alvos de toque e reflow com ampliação;
- contraste de texto, controles, feedback e dados;
- preservação de foco e posição durante paginação e refresh.

Automação de contraste e árvore acessível não substitui leitor de tela nem teste
com participantes. A referência normativa é [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## 8. Auditoria semântica sem falso positivo visual

O corte de domínio usa `study_unit`, `studyUnits` e Unidade de estudo. O scanner
de resíduos deve rejeitar identificadores, operações e atributos antigos quando
representam essa entidade. Ele não deve reprovar classes CSS genéricas que
descrevem apenas aparência, como `.clean-card`, `.card-title`,
`.runtime-card-sheet`, `.card-sheet-content` ou `.card-answer-dock`.

Essa distinção precisa ser sintática e contextual, não uma allowlist ampla para
qualquer ocorrência. Um `data-*`, variável ou função que nomeia a entidade com
o termo substituído continua sendo regressão mesmo dentro de um componente
visual.

## 9. Matriz mínima de jornadas

| Jornada | Evidência principal |
| --- | --- |
| Estudo, progresso, revisão e observação | testes de `CourseStudy*` e estado pessoal |
| Autoria, rota e quatro seções | testes de surface, route e view model |
| Inspeção, janela, cache, offline e posição | `course-inspection-sequence.test.js` e testes de controller |
| UI ↔ MCP e owner-only | testes de MCP, Router, Adapter e API |
| constraints e concorrência | `course-postgres-concurrency.test.js` após reset real |
| packages no renderer fiel | `package-study-rendering-regressions.test.js` |
| promoção 1400 → 1800 | testes do importador e manifesto do runtime |

Testes automatizados não demonstram que pessoas leigas compreendem a navegação,
que a carga cognitiva é baixa em uso prolongado ou que o Free Plan suportará a
carga real. Esses pontos continuam como gates humanos e operacionais.

## 10. Critérios de aprovação

Uma mudança de front-end é aprovada quando:

1. usa o vocabulário corrente sem alias semântico;
2. mantém Estudo e Autoria ligados ao mesmo Curso;
3. falha fechada em propriedade, revisão e payload;
4. preserva posição, foco e contexto em paginação e refresh;
5. não usa página aproximada como fallback offline;
6. limita página, DOM e cache conforme o contrato;
7. funciona por toque e teclado nas quatro larguras de referência;
8. mantém paridade com o MCP quando a capacidade é compartilhada;
9. atualiza testes e scanner sem confundir classe visual com entidade;
10. declara o que ainda depende de aceitação humana ou operação hospedada.
