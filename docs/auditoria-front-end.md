# Auditoria da interface

Auditar a interface significa verificar se a pessoa consegue localizar,
estudar e alterar o que lhe pertence sem conhecer detalhes internos do sistema.
Não basta encontrar elementos no DOM: é preciso provar conexão com o domínio,
persistência, autorização, rede e comportamento real.

## 1. Método

Cada requisito é examinado em seis níveis:

1. **semântica:** o controle representa a tarefa anunciada;
2. **conexão:** a interação alcança o domínio e o serviço corretos;
3. **autoridade:** interface, Edge Function e PostgreSQL impõem o mesmo limite;
4. **estado:** carregamento, vazio, ausência de conexão, conflito e falha são distinguíveis;
5. **interação:** toque, teclado, foco, retorno e rolagem funcionam;
6. **proporcionalidade:** DOM, volume de dados, cópia local e chamadas têm limites verificáveis.

As evidências possuem alcances diferentes:

| Evidência | O que demonstra | O que não demonstra |
| --- | --- | --- |
| inspeção de código | responsabilidade e fluxo previsto | execução no navegador |
| teste unitário | regra isolada | geometria e integração completas |
| teste de navegador | jornada e medidas no motor real | compreensão humana prolongada |
| PostgreSQL real | restrições, concorrência e privilégios | disponibilidade hospedada futura |
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
│       ├── Parâmetros
│       ├── Fontes
│       ├── Estrutura
│       ├── Inspeção
│       ├── Auditoria e correções
│       ├── Variantes
│       ├── Pesquisa
│       └── Pessoas
└── Conta e aparência
```

Estudo lista Cursos próprios e compartilhados. Autoria lista somente Cursos
próprios; receber acesso direto não concede edição. O seletor Estudo/Autoria
muda a tarefa sem criar outra identidade de Curso.

O vocabulário visível usa Curso, Parte, Módulo, Lição, Microssequência e Unidade
de estudo. Revisão CAS, cursor, hashes e nomes de RPC pertencem ao protocolo e
só aparecem quando necessários ao diagnóstico.

## 3. Tela inicial, Estudo e estado pessoal

A tela inicial usa listas finas paginadas. Um item informa o necessário para localizar
e abrir o Curso, sem baixar milhares de Unidades. Ao entrar em Estudo, o cliente
fixa uma revisão, lê páginas de entidades, recusa mistura entre revisões,
recompõe `aralearn.course.v1` e só então substitui a cópia local válida.

O percurso de Estudo apresenta uma Unidade por vez. Resposta e feedback são
locais ao ciclo corrente; avançar não espera a persistência remota. Progresso e
marcas para rever formam o estado pessoal v2. Anotações ancoradas próprias usam
persistência separada; nenhum desses fluxos incrementa a revisão autoral do
Curso apenas por continuidade ou triagem.

Sem rede, conteúdo íntegro já carregado pode continuar em Estudo. Estado pessoal
e Anotações ancoradas possuem filas separadas para uso sem conexão. Alteração autoral fora
desse contrato não simula sucesso quando o servidor ou a revisão corrente não
estão disponíveis.

O proprietário coordena a caixa de entrada pela versão global. Estudo coordena
cópia local, paginação e duas abas por uma versão monotônica privada da própria
projeção; atividade de terceiros não muda esse valor nem se torna observável.

## 4. Autoria

### Planejamento

Planejamento edita título, objetivo, público, escopo, faixa preferencial, itens
e Partes em linguagem natural. Criar, dividir, unir,
reordenar ou retirar uma Parte não altera implicitamente a hierarquia didática.
Copiar um pedido para o ChatGPT não inicia materialização nem grava progresso.

### Parâmetros

Parâmetros percorre Curso, Módulo, Lição e Microssequência e separa valor
efetivo, atribuição local, orientação original, interpretação e política de
componentes. Numa Microssequência, a cobertura planejada oferece controles de seleção
para atribuir unidades de análise e requisitos de evidência. O estado visual é
a relação muitos-para-muitos real: não apresenta o plano inteiro como se todo
item pertencesse a todo alvo e não exige JSON.

### Fontes

A área Fontes mantém catálogo privado, revisões, Âncoras e atribuições. O envio de PDF
ocorre em duas fases: a API de Cursos autoriza o objeto, o navegador o envia ao
Storage privado e uma operação relacional confirma o vínculo. A interface não
trata um arquivo enviado, mas ainda não confirmado, como parte do Curso.

### Estrutura

Estrutura apresenta Módulos, Lições e Microssequências em páginas compactas.
Ela serve para localização; não duplica a sequência de leitura da Inspeção.

### Inspeção

Inspeção apresenta uma sequência vertical fiel de Unidades, com respostas e
edição desativadas. O filtro aceita Curso, Parte, Unidades sem Parte, Módulo,
Lição ou Microssequência. Um link profundo usa âncora inclusiva; páginas
posteriores e anteriores usam cursor `{studyUnitId}`. Âncora e cursor são
mutuamente exclusivos.

A interface pede 12 itens por página, admite resposta de até 24 e mantém no DOM
no máximo 36 Unidades. Itens distantes viram espaçadores, e a busca ocorre nas
duas direções. O contexto fixo, foco, controles abertos e posição visual não
devem saltar quando a janela muda.

A posição local conserva escopo, `studyUnitId`, deslocamento em relação ao topo
fixo e revisão. Atualização concorrente reancora pela identidade; alvo removido
explicitamente é informado como ausente. Coordenação entre abas não interrompe
uma interação recente.

O armazenamento temporário distingue revisão e pedido completo, inclusive escopo, âncora ou cursor,
direção, limite e `maxBytes`. Conserva no máximo quatro páginas ou 8 MiB por
Curso. Sem rede, somente a página exata pode reaparecer, marcada como sem conexão ou
desatualizada. Revogação ou outra perda de autoridade purga página e posição.

### Auditoria e correções

A área separa Observações, rodadas, achados e correções. Responder ou resolver
uma Observação não altera conteúdo. Aplicar uma correção exige confirmação,
conserva o estado anterior e ainda precisa de outra rodada para verificar o
critério focal. Essas operações exigem conexão.

### Variantes

A área Variantes cria Cursos independentes a partir de um mesmo ponto do planejamento
e compara diferenças declaradas, fatos correntes e desvios. Desvincular uma
variante não exclui o Curso. A interface não apresenta a comparação como
experimento nem como evidência de aprendizagem.

### Pesquisa

Pesquisa apresenta fatos da Autoria, definições de métricas, filtros, gráfico,
tabela equivalente e exportação. A mesma consulta está disponível no MCP. A
interface preserva denominador, dados ausentes e limites de interpretação e
não transforma contagens descritivas em conclusão causal.

### Pessoas

O proprietário concede Estudo por e-mail exato de uma conta existente e revoga
pelo identificador retornado. Não há diretório, papel de coautoria ou convite
pendente. A confirmação e a mensagem precisam distinguir acesso para Estudo de
autoridade autoral.

## 5. Paridade entre interface e MCP

A vista MCP `study_units` usa a mesma leitura exclusiva do proprietário usada pela Inspeção. A auditoria
compara escopos, revisão esperada, âncora, cursor, direção, limite, orçamento de
bytes, links profundos, ordem e erros. Uma das superfícies não pode corrigir ou
reinterpretar silenciosamente a resposta da outra.

Uma página normal usa orçamento de 512 KiB, configurável entre 64 KiB e
1.500.000 bytes. A projeção completa falha fechada acima de 1,75 MiB, preservando
margem sob o teto de 2 MiB. A interface deve apresentar erro recuperável sem
tentar carregar o Curso inteiro por uma rota alternativa silenciosa.

## 6. Autoridade e falha fechada

Esconder um controle não é barreira de segurança. A auditoria confirma em
conjunto:

- Autoria e MCP listam somente Cursos próprios;
- a RPC de Inspeção é concedida somente a `service_role` e revalida o ator;
- a função auxiliar privada não possui execução para papéis de cliente;
- Curso compartilhado permanece acessível apenas em Estudo;
- conflito de revisão conserva a intenção e exige releitura;
- revogação impede nova leitura pela rede e elimina a cópia privada conhecida.

Segurança por linha, privilégios e checagem de propriedade são camadas
complementares. Uma função privilegiada incorreta não é corrigida apenas por
esconder a rota na interface.

## 7. Sistema visual e acessibilidade

Verificação proporcional abre a aplicação real em 360, 390 e 430 px e em computador,
nos temas claro, escuro e Sistema. Deve conferir:

- ausência de conteúdo além da largura da página e de controles cortados;
- uma única região principal de rolagem vertical na Inspeção;
- foco visível, ordem de teclado e retorno ao acionador;
- nomes e estados acessíveis para ícones;
- alvos de toque e reorganização com ampliação;
- contraste de texto, controles, feedback e dados;
- preservação de foco e posição durante paginação e atualização.

Automação de contraste e árvore acessível não substitui leitor de tela nem teste
com participantes. A referência normativa é [WCAG 2.2](https://www.w3.org/TR/WCAG22/).

## 8. Auditoria semântica sem falso positivo visual

O corte de domínio usa `study_unit`, `studyUnits` e Unidade de estudo. A auditoria automática
de resíduos deve rejeitar identificadores, operações e atributos antigos quando
representam essa entidade. Ele não deve reprovar classes CSS genéricas que
descrevem apenas aparência, como `.clean-card`, `.card-title`,
`.runtime-card-sheet`, `.card-sheet-content` ou `.card-answer-dock`.

Essa distinção precisa ser sintática e contextual, não uma permissão ampla para
qualquer ocorrência. Um `data-*`, variável ou função que nomeia a entidade com
o termo substituído continua sendo regressão mesmo dentro de um componente
visual.

## 9. Matriz mínima de jornadas

| Jornada | Evidência principal |
| --- | --- |
| Estudo, progresso e revisão | testes de `CourseStudy*` e estado pessoal v2 |
| Observações próprias, uso sem conexão e duas abas | testes da folha de Unidade e de `CourseAnnotationRepository` |
| Autoria, rota e nove áreas | testes da superfície, rota e painéis especializados |
| Inspeção, janela, cópia local, ausência de conexão e posição | `course-inspection-sequence.test.js` e testes do controlador |
| Interface e MCP sob a mesma propriedade | testes de MCP, roteador, adaptador e API |
| restrições e concorrência | `course-postgres-concurrency.test.js` após recriação real |
| pacotes no renderizador fiel | `package-study-rendering-regressions.test.js` |
| Curso único e acesso direto ao Estudo | testes do repositório, API, RLS e manifesto |

Testes automatizados não demonstram que pessoas leigas compreendem a navegação,
que a carga cognitiva é baixa em uso prolongado ou que o Free Plan suportará a
carga real. Esses pontos continuam dependentes de avaliação humana e observação
operacional.

## 10. Critérios de aprovação

Uma mudança de interface é aprovada quando:

1. usa o vocabulário corrente sem nome semântico alternativo;
2. mantém Estudo e Autoria ligados ao mesmo Curso;
3. falha fechada em propriedade, revisão e tamanho da resposta;
4. preserva posição, foco e contexto em paginação e atualização;
5. não usa página aproximada como substituta quando está sem conexão;
6. limita página, DOM e armazenamento temporário conforme o contrato;
7. funciona por toque e teclado nas quatro larguras de referência;
8. mantém paridade com o MCP quando a capacidade é compartilhada;
9. atualiza testes e auditoria automática sem confundir classe visual com entidade;
10. declara o que ainda depende de aceitação humana ou operação hospedada.
