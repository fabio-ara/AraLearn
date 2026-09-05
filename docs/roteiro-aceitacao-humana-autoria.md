# Roteiro de aceitação humana da autoria

Este roteiro avalia se uma pessoa encontra e conclui as tarefas reais de autoria
sem aprender a arquitetura interna. Automação verifica contratos e geometria;
não substitui observação de compreensão e uso.

## Contrato de jornadas

Os critérios abaixo definem o destino de [#295](https://github.com/fabio-ara/AraLearn/issues/295).
São condições refutáveis de engenharia, não um registro de testes executados.
O conteúdo de teste é sintético. A revisão e os ambientes exercitados delimitam
a validade de cada prova.

| Jornada | Ação e permissão | Resultado exigido |
| --- | --- | --- |
| J1 — entrada pública | visitante abre home e link de curso público | prática e feedback completos; progresso/Rever locais; observar requer conta, editar requer propriedade |
| J2 — identificação e acesso | proprietário seleciona identificador público único | avatar opcional, sem segundo nome obrigatório; destinatário lê, terceiro não lê; revogação impede novo acesso conectado |
| J3 — planejar e produzir | autor examina mapa, altera escopo e autoriza lote | cobertura e dependências inspecionáveis; lote não muda currículo; sem mandato ampliado, concluir lote e aguardar |
| J4 — perfis e cadência | criar/aplicar/editar/excluir perfil; ajustar lote e pausas | aplicação copia preferências; editar/excluir perfil não muda curso anterior; reaplicar declara alcance/exceções; lotes e pausas independentes |
| J5 — contexto | abrir unidade indicada, parâmetros, fontes e observações | retorno ao mesmo alvo, rolagem e acionador; tarefa global acessível pelo menu |
| J6 — seleção | selecionar unidades anteriores e posteriores | sequência vertical mostra vizinhança; sair restaura unidade inicial; seleção não cria entidade persistente |
| J7 — edição | proprietário edita título, prosa e rótulos de prática | mesmo renderer e geometria na entrada; crescimento natural sem corte, fonte menor ou prática oculta; salvar/reabrir preserva texto |
| J8 — assistência | proprietário em Estudo discute alteração focal por API | alvo preservado, proposta verificável e domínio comum; falha conserva original/rascunho; chave nunca entra no curso |
| J9 — observação | estudante autenticado observa e tenta editar | observação chega ao autor/GPT; edição recusada sem cópia automática; visitante não envia observação |
| J10 — fontes | abrir URL, PDF, slides e referência incompleta | metadados conhecidos, localizador e alcance legíveis; estilo não muda identidade; publicação escolhe política de arquivos/exceções |
| J11 — corrigir | observação afeta explicação e prática posterior | GPT lê dependências, discute mudança material, aplica dentro do mandato e relê resultado; HTTP 200 não resolve semanticamente a observação |
| J12 — parametrizar | autor fixa condição e compara distribuição | pedido, resolução e aplicação distintos; automático calibra contexto; valor fixado prevalece; inventário não é fundido para cumprir teto |
| J13 — ferramentas | chinês/pinyin com áudio e leitura; matemática com calculadora | idiomas/notação preservados; múltiplos itens; indisponibilidade/custo explícitos; contratos focais e acessibilidade |
| J14 — sincronizar | duas abas, alteração remota, rascunho e rede intermitente | manual suspende intercâmbio de estudo em fundo e conteúdo aberto; nuvem sincroniza; conflito não perde dados; escrita autoral/acesso continuam |
| J15 — copiar e comparar | autor copia curso e inspeciona dados | cópias independentes preservam conteúdo, mapa, repertório, configuração e fontes; não copiam acesso/progresso/observações pessoais; tela/export têm mesmos objetos e denominadores |
| J16 — retomar pelos canais | mesma intenção em MCP e Actions novos | mesma autorização/efeito; texto literal disponível; retorno breve e endereçável; reenvio não duplica conteúdo |
| J17 — entregar | candidata integrada e documentação | revisão, configuração e artefatos correspondem; runtime substituído removido; prova técnica não se apresenta como avaliação educacional |

## Continuidade e geometria

Estudo conserva home, módulos, lições, microssequências e unidade. Autoria entra
no conteúdo e oferece planejamento progressivo e tarefas globais pelo menu.
Um módulo revela lições; uma lição revela microssequências, pressupostos e
cobertura. Ajustes e fontes locais abrem sobreposição. Dados começam por uma
distribuição selecionável e revelam objetos e tabela completa sob demanda.

Barras principais usam ícones com nomes e estados acessíveis; menus e ajustes
revelados admitem texto. A coluna permanece até 430 px também no desktop.
Em 360, 390, 430 e 1280 px, sob o mesmo zoom, fontes carregadas e estado,
coordenadas/dimensões de controles equivalentes e caixa de conteúdo admitem até
1 CSS px de arredondamento ao entrar/sair da edição sem alterar texto. Medir
antes/depois no mesmo ambiente. Texto novo pode aumentar altura; largura,
âncora e controles fixos continuam preservados.

Sobreposições mantêm foco e devolvem-no ao acionador; se ele deixou de existir
por ação explícita, testar o destino lógico. Esc fecha detalhe sem descartar
silenciosamente rascunho. Cabeçalho reserva espaço para controles ausentes;
título longo não desloca irmãos. Validar teclado, alvos de toque, reflow e zoom
200%; estabilidade não impede ampliação. As referências são
[WCAG 2.2](https://www.w3.org/TR/WCAG22/) e o
[padrão de diálogo WAI-ARIA](https://www.w3.org/WAI/ARIA/apg/patterns/dialog-modal/).

Carregamento mantém conteúdo confirmado. A nuvem indica pendência, andamento,
sucesso ou falha; sucesso e adiamento normal não geram aviso persistente.
Falha recuperável conserva campos e permite repetição idempotente; conflito
material revela alternativas antes de substituir conteúdo. Sem acesso, a
mensagem explica a restrição correta; criar conta não concede autoria.

## Lote, pausa e mandato

Lote é o conjunto finito de unidades a produzir e revisar numa operação autoral,
organizado depois do mapa. Sua fronteira é o recorte curricular escolhido para
essa produção; não acrescenta nível didático. Pausa é o ponto em que a produção
aguarda nova orientação humana. Ela pode ocorrer após uma microssequência, após
um lote ou somente diante de decisão material, conforme a cadência autorizada.

Mandato delimita o que pode ser feito: escopo, lotes ou recorte curricular
autorizados e restrições explícitas. Termina quando esse conjunto é concluído,
quando o autor o interrompe ou quando uma mudança material exige decisão.
Na ausência de continuidade autorizada, termina ao entregar o primeiro lote.
Uma preferência de pausa não amplia o escopo do mandato. Alterar o tamanho do
lote também não autoriza produzir além desse escopo. Correções mecânicas e
retentativas permanecem no mesmo mandato, sem certificar revisão factual.

Caso refutável: num mapa com seis microssequências, autorizar somente as quatro
primeiras. Primeiro usar dois lotes de duas e pausar após cada lote; depois
manter os mesmos lotes e autorizar execução contínua. O conteúdo autorizado e
o limite final são iguais, mas há uma pausa intermediária apenas no primeiro
caso. Em seguida, manter execução contínua e usar quatro lotes de uma: muda a
granularidade, não a pausa nem o escopo. Nos três casos, a quinta
microssequência não pode ser produzida sem novo mandato. Uma fonte necessária
indisponível ou mudança de objetivo interrompe também a execução contínua.

## Alcance da sincronização manual

| Estado/operação | Com manual ativo | Nuvem ou retorno explícito ao automático |
| --- | --- | --- |
| conteúdo e descritores de cursos já abertos | nenhuma atualização de fundo por foco, reconexão, temporizador ou aviso de outra aba; preservar leitura e rascunho | consultar revisão e reconciliar sem sobrescrever edição concorrente |
| posição, progresso e Rever pessoais | gravação local e pendência por conta/dispositivo; não enviar nem receber em fundo | intercambiar e resolver conflito material antes de descartar valores |
| resposta e feedback da prática em curso | interação local continua; esta preferência não cria coleta ou histórico de respostas | não acrescentar sincronização de respostas inexistente no contrato de estado pessoal |
| observação escrita pelo estudante autenticado | o ato explícito de enviar continua permitido; sem rede, conservar texto pendente, sem reenvio automático em fundo | enviar pendência por ação explícita, com repetição segura; visitante não envia |
| observações já recebidas e revisão do autor | não substituir em fundo a inspeção de Estudo; abrir/atualizar a tarefa é leitura explícita | reler no alvo e conservar rascunhos |
| salvar edição autoral, publicar acesso ou chamar assistência | rede explícita continua; falha preserva original/rascunho | não esperar sincronização pessoal para executar escrita autorizada |
| sessão, autorização e revogação | verificações de segurança permanecem; manual não conserva direito revogado | conferir acesso antes de intercambiar ou gravar |
| abrir fonte web, baixar arquivo ou curso ainda não disponível | rede solicitada explicitamente, sujeita a acesso | não classificar esse pedido como atualização de fundo |

Visitante conserva posição, progresso e Rever apenas localmente. Ao entrar numa
conta, não associar seu estado a essa pessoa silenciosamente; oferecer
incorporação explícita, preservando a alternativa local. Sair da conta não
transporta sua fila para outro usuário do dispositivo. Avisos entre abas podem
marcar a nuvem como pendente, mas não aplicar o conteúdo recebido em manual.

J14 deve provocar cada linha em duas abas, com rede interrompida e alteração
remota. O teste distingue chamadas de autorização das leituras/escritas de
estado suspensas, verifica a fila após reiniciar e confirma que acionar a nuvem
não elimina rascunho nem ultrapassa a conta ou o curso autorizados.

## Pré-condições

Reprove a revisão se:

- a autoria deixa de abrir diretamente em Conteúdo;
- aparece dashboard, sidebar, segunda coluna permanente ou segundo rolador;
- uma unidade de estudo deixa de dominar o leitor fora da seleção múltipla;
- ações somente por ícone não possuem nome acessível, foco e estado corretos;
- a página cria rolagem horizontal em 360, 390 ou 430 px;
- Estudo perde navegação, renderer, prática, progresso ou funcionamento offline;
- a interface ou a conversa expõe identificadores, nomes de campos, hashes,
  comandos, contagens internas ou detalhes de transporte.

Verifique a aplicação real nos temas claro e escuro, por toque, teclado e
tecnologias assistivas pertinentes. Tela larga preserva a mesma arquitetura de
uma coluna.

## Preparação

- use conta e cursos privados descartáveis;
- inclua um curso novo baseado numa ementa extensa;
- prepare público, objetivo, pré-requisitos, escopo e fontes com papéis distintos;
- inclua ao menos duas partes de produção e conteúdo suficiente para exigir
  índice e pesquisa;
- use configuração contextual e uma condição de pesquisa deliberadamente fixa;
- não explique MCP, Actions nem mecanismos internos;
- peça que a pessoa diga o que procura, o que espera e por que escolheu cada ação.

## Jornada curricular e conversacional

Execute numa conexão MCP nova ou renovada e num GPT com o OpenAPI corrente
efetivamente importado:

1. a pessoa pede um curso extenso;
2. o GPT apresenta uma síntese curricular global;
3. um link permite inspecionar todos os módulos, lições e microssequências;
4. cada item obrigatório do escopo aparece associado ao mapa;
5. a pessoa altera cobertura ou ordem;
6. o GPT ajusta a mesma arquitetura, sem materializar unidades;
7. a pessoa aprova o mapa visível;
8. o GPT apresenta brevemente a primeira parte e pede autorização, podendo
   receber mandato de continuidade para outros lotes;
9. a pessoa corrige uma ênfase;
10. o GPT materializa a parte e devolve o link do conteúdo;
11. a pessoa inspeciona todas as unidades na ordem;
12. o GPT apresenta a segunda parte, avançando dentro da cadência autorizada;
13. a pessoa altera uma decisão e acrescenta uma fonte técnica;
14. o GPT materializa e a pessoa inspeciona o resultado;
15. o repertório acumulado distingue ideias novas, usadas e retomadas.

O chat deve parecer conversa com uma pessoa que desconhece o mecanismo do
AraLearn. A pessoa autora não pode ser tratada como estudante. A aprovação do
mapa não autoriza automaticamente produção. O mandato pode abranger vários
lotes e correções rotineiras; conteúdo inexistente não foi revisado factualmente.

## Tarefas

| Intenção | Resultado esperado | Evidência |
| --- | --- | --- |
| “Mostre como todo o curso ficará organizado.” | apresenta síntese e mapa completo de módulos, lições e microssequências | cobertura, ordem, dependências e zero unidades materializadas |
| “Mude esta área de lugar.” | atualiza o mapa e preserva decisões anteriores | nova versão inspecionável antes da aprovação |
| “Prepare o primeiro lote.” | apresenta somente a progressão local relevante | parte separada do currículo e conversa curta |
| “Produza este lote.” | materializa unidades suficientes e conectadas | conteúdo renderizado, não apenas JSON ou contagens |
| “Mostre o que esta unidade pressupõe.” | exibe ideias introduzidas, usadas e retomadas em linguagem humana | ausência de termos internos e referências coerentes |
| “Compare teto 1 e 2.” | preserva o repertório e permite mudar a distribuição de unidades | condição fixada prevalece sobre calibração contextual |
| “Deixe o GPT ajustar ao conteúdo.” | estado `default` exige calibração contextual automática dos parâmetros pedagógicos e alvos editoriais por microssequência ou unidade | valor, origem, escopo e aplicação observáveis |
| “Prefira cerca de 140 palavras por unidade.” | registra alvo editorial flexível sem truncar nem compactar conteúdo | alvo e extensão observada comparáveis; unidades podem ultrapassá-lo |
| “Confira de onde vem esta afirmação.” | distingue fonte de escopo, avaliação e sustentação técnica | proveniência e limite interpretado |
| “Revise as observações abertas.” | relê também progressão, pré-requisitos, transições, exemplos e prática | conjunto afetado e proposta concreta |
| “Mostre como o curso foi desenhado.” | Analytics mostra estado aplicado e exporta dados comparáveis | valores, origem, escopo, uso e JSON |
| “Continue numa conversa nova.” | retoma mapa, lotes e repertório persistidos sem repetir o briefing | próxima decisão correta |

## Revisão sequencial do conteúdo

Use ao menos uma microssequência técnica, como o funcionamento de um switch
Ethernet. Assuma que quadro, endereço MAC e porta já foram ensinados e confira
uma progressão real com problema, mecanismo, mudança de estado, previsão,
comparação, prática parcialmente resolvida e integração.

Reprove se:

- um conceito necessário aparece antes de ser ensinado;
- uma relação essencial é pressuposta;
- uma aplicação exige operação que nunca foi praticada;
- uma unidade expositiva supera o teto de novidades;
- prática é obrigada a introduzir novidade;
- o conteúdo vira resumo denso;
- uma ideia simples é atomizada em telas sem progressão;
- componentes variam pela aparência em vez da função;
- definições se repetem integralmente sem necessidade.

Registre um caso em que uma unidade densa foi dividida e outro em que fragmentos
foram fundidos. Avalie o percurso completo, não apenas unidades isoladas.

## Perguntas finais

Pergunte sem mostrar a navegação:

1. “Onde você conferiria o mapa completo antes da produção?”
2. “Qual é a diferença entre currículo e parte?”
3. “O que exatamente você aprovou em cada momento?”
4. “Como saberia que configuração vale neste ponto?”
5. “Como voltaria a um conteúdo antigo?”
6. “O que faria quando uma fonte parece inadequada?”
7. “O que os números de Analytics permitem e não permitem concluir?”

## Critério de decisão

O fluxo falha se a pessoa precisar conhecer o backend, perder o contexto,
aprovar conteúdo que não viu, aceitar compactação por limite visual, reconstruir
sozinha uma sequência atomizada, não reencontrar unidades antigas ou interpretar
contagem como qualidade.

Registre dificuldades como observações e corrija falhas materiais reproduzíveis.
Uma sessão positiva sustenta usabilidade somente para participantes, tarefas e
condições exercitados. Não demonstra aprendizagem nem eficácia educacional.
