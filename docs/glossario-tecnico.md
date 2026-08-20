# Glossário técnico

Este glossário define os mecanismos da execução corrente do AraLearn. Conceitos
de pesquisa educacional estão no [glossário de
construtos](glossario-construtos.md). As decisões terminológicas e os
equivalentes internacionais ficam no [vocabulário
controlado](vocabulario-controlado.md).

## Camadas do sistema

**Execução corrente (`runtime`).** Código, banco e serviços efetivamente usados
por uma versão. Um arquivo histórico, uma migração antiga ou um teste removido
da jornada não pertence à execução apenas por existir no Git.

**Interface cliente (`frontend`).** Camada executada no navegador ou no
WebView Android. Inclui Estudo, Autoria, Pesquisa, componentes didáticos e
persistência local.

**Serviço remoto (`backend`).** Camadas que autenticam, autorizam, validam e
persistem operações. O AraLearn usa PostgreSQL, Auth, armazenamento de objetos
e funções remotas do Supabase.

**Domínio.** Regras que expressam o produto sem depender da aparência da tela.
Composição de Curso, resolução de parâmetros, proveniência, auditoria e
variantes são regras de domínio.

**Contrato fechado.** Estrutura que aceita apenas os campos e valores
declarados. Evita interpretações diferentes entre navegador, função remota e
banco.

**Manifesto da execução.** Resposta fechada que informa revisão do esquema,
versão do contrato e capacidades obrigatórias. Site e função remota recusam uma
revisão de banco incompatível.

## Formatos e identidades

**JSON.** Formato textual de objetos, listas, textos, números, booleanos e
`null`. Um documento JSON ainda precisa de esquema e regras adicionais para ser
válido.

**UUID.** Identificador de 128 bits representado em texto. Cursos, contas,
Partes, Fontes e pedidos usam UUIDs para conservar identidade sem depender de
uma sequência global.

**SHA-256.** Função de impressão digital usada para comparar bytes e conteúdo
canônico. A igualdade da impressão digital não cifra informação nem concede
acesso.

**Esquema (`schema`).** Descrição da forma aceita por um contrato ou banco. Um
esquema estrutural não avalia correção factual ou qualidade pedagógica.

**Canonicidade.** Existência de uma única representação normativa para o mesmo
fato ou contrato. A forma canônica permite comparar, assinar e repetir pedidos
sem manter nomes paralelos.

## Curso e composição

**Curso vivo (`course`).** Raiz identificável e mutável compartilhada por
Estudo, Autoria, Pesquisa e MCP. Conserva proprietário, título, objetivo,
revisão e datas. Plano, composição e estados relacionados ficam em relações
próprias sob o mesmo `courseId`.

**Revisão do Curso (`revision`).** Inteiro crescente alterado por uma mudança
autoral confirmada. Serve à concorrência e à leitura coerente; não cria outro
Curso.

**Composição didática.** Estrutura curricular corrente do Curso:
Curso, Módulo, Lição, Microssequência didática e Unidade de estudo. Um Tópico
pode classificar conteúdo dentro da Lição, mas não acrescenta outro nível a
essa sequência.

**Entidade de Curso (`course entity`).** Linha persistida de Módulo, Lição,
Tópico, Microssequência ou Unidade, com identidade, pai, posição e conteúdo
compatíveis com seu tipo.

**Unidade de estudo (`study_unit`).** Menor unidade persistida, ordenável,
endereçável e renderizável. Pode apresentar conteúdo, pedir resposta e oferecer
retorno. `studyUnits` é a coleção correspondente no documento hierárquico.

**Documento `aralearn.course.v1`.** Contrato hierárquico corrente. O perfil de
intercâmbio aceita um ou mais Cursos; o perfil unitário do núcleo representa um
Curso. Ambos usam a mesma identidade e a mesma hierarquia.

**Achatamento (`flatten`).** Transformação do documento hierárquico em linhas
de entidades. **Composição (`compose`)** é a operação inversa. O percurso de ida
e volta só é válido quando recompõe um documento aceito pelo contrato.

**Normalização relacional.** Separação de fatos para evitar duplicação e
anomalias. O AraLearn normaliza raiz, entidades, acesso, planejamento e fatos
consultáveis; o conteúdo interno dos componentes permanece em JSON validado e
versionado.

## Planejamento e produção

**Plano instrucional vivo.** Planejamento revisável que reúne público, escopo,
resultados pretendidos, unidades de análise, requisitos de evidência e Partes.
Título e objetivo aparecem nessa leitura, mas pertencem à raiz do Curso.

**Item do plano.** Enunciado ordenado e versionado de resultado pretendido,
unidade de análise instrucional ou requisito de evidência. A pessoa o edita em
linguagem natural.

**Atribuição de item.** Relação entre uma Microssequência e os itens que sua
produção precisa considerar. Resultados gerais do Curso não são copiados para
cada alvo.

**Parte de autoria.** Agrupamento operacional configurável para planejar,
produzir e revisar várias Microssequências numa iteração. Parte não pertence à
hierarquia didática.

**Faixa preferencial de Partes.** Mínimo e máximo operacionais associados à
origem automática, autoral ou de pesquisa. O valor inicial de 7 a 12 é
configurável e pesquisável, sem valor de lei pedagógica.

**Vínculo de produção.** Relação exclusiva entre uma Parte e uma
Microssequência, com ordem própria. Retirar o vínculo não exclui a
Microssequência nem muda sua posição curricular.

**Execução de materialização.** Registro retomável da produção ou atualização
de conteúdo de uma Parte. Conserva estado, versão, contexto derivado no servidor
e fatos do resultado.

**Etapa de materialização.** Operação limitada de leitura de contexto,
produção de uma Microssequência ou validação. A confirmação grava entidades,
vínculos, aplicação de desenho, proveniência e revisão na mesma transação.

**Progresso derivado de Parte.** Projeção calculada a partir dos vínculos, das
Unidades e das etapas confirmadas. Nenhuma pessoa ou modelo marca esse progresso
por simples declaração.

## Parâmetros e orientações

**Parâmetro de desenho instrucional.** Definição fechada e versionada de uma
decisão pedagógica controlável, com tipo, escopos, valor-padrão, limitações e
referências. Limites técnicos e métricas pertencem a outros conceitos.

**Atribuição de parâmetro.** Registro que define ou remove o valor num escopo e
conserva origem automática, autoral ou de pesquisa, além do motivo. Herança e
valor-padrão são calculados.

**Valor efetivo.** Resultado da resolução de precedência para um alvo. A
interface mostra o valor, a origem e o escopo de onde ele veio.

**Revisão de orientação.** Texto original imutável ligado ao Curso, ao escopo,
ao canal e à revisão. Orientações efetivas acumulam do Curso até o alvo.

**Interpretação de orientação.** Registro separado que conserva resumo,
diretivas, divergências e perguntas para uma revisão exata. Não substitui o
texto humano nem armazena raciocínio privado.

**Política de componentes.** Valor completo que fixa a revisão do catálogo,
disponibilidade geral ou restrita, referências permitidas, bloqueadas e
preferidas. Bloqueio prevalece; preferência não concede permissão.

## Componentes didáticos

**Componente didático.** Capacidade modular que apresenta uma representação,
coleta uma resposta ou oferece retorno dentro de uma Unidade de estudo.

**Pacote de componente (`component package`).** Módulo versionado que reúne
manifesto, esquema, normalização, validação, mecanismo de renderização,
capacidades e exemplos.

**Núcleo de execução de componentes.** Código comum de composição, ciclo de
vida, acessibilidade e protocolos. Um pacote novo não exige uma enumeração
paralela no núcleo, no navegador, na função remota ou no MCP.

**Biblioteca de componentes.** Índice gerado a partir dos manifestos. Navegador
e função remota usam a mesma fonte para descoberta, inspeção e validação.

**Forma de resposta.** Contrato de interação da prática, como escolha,
preenchimento ou ordenação. Distingue-se do componente que apresenta o
conteúdo.

**Adequação contextual (`canonical`, `versatile`, `substitute`).** Relação
declarada entre uma necessidade e um candidato específico, geral ou
aproximativo. A classificação orienta seleção e aviso; não ordena qualidade ou
eficácia.

**Hidratação.** Etapa em que um componente já desenhado liga comportamento ao
DOM. HTML visível sem interação necessária caracteriza falha de hidratação.

## Persistência local e carregamento

**IndexedDB.** Banco transacional do navegador. Mantém sessão, páginas,
documentos compostos, estado pessoal e as filas específicas de Observações.

**Cópia temporária (`cache`).** Cópia regenerável usada para reduzir latência e
rede. Não constitui outra autoridade sobre o Curso.

**Réplica local.** Cópia suficientemente completa para continuar uma tarefa sem
conexão. A réplica do Curso permite leitura; estado pessoal e Observações
conservam intenções de escrita em filas separadas.

**Fila de saída.** Operações ainda não confirmadas pelo servidor. Estado
pessoal e Observações usam contratos próprios; não existe uma fila universal de
Autoria.

**Estado pessoal de Curso.** Documento v2 por pessoa e Curso que contém
progresso e marcas para rever. Sua alteração não incrementa a revisão autoral.

**Lista fina.** Página de descritores sem a composição integral. Contém apenas
o necessário para localizar, ordenar e apresentar a lista de Cursos.

**Paginação por cursor.** Leitura cuja página seguinte começa depois da última
chave estável recebida. O cursor é vinculado ao recorte e não representa posição
curricular.

**Carregamento sob demanda.** Busca da composição ou do detalhe apenas quando o
destino é aberto. Não implica descarte automático de dados locais válidos.

**Inspeção.** Superfície exclusiva do proprietário que percorre Unidades numa
sequência vertical fiel a Estudo, com respostas inertes.

**Âncora de Inspeção.** Identidade da Unidade que precisa entrar na primeira
página de um endereço direto ou de uma restauração. Não é enviada junto com o
cursor.

**Posição local de Inspeção.** Registro por dispositivo com escopo, Unidade,
deslocamento em relação ao topo fixo e revisão do Curso. Serve à retomada e não
vira fato pedagógico compartilhado.

**Janela limitada.** Trecho da sequência mantido no DOM enquanto itens
distantes usam espaçadores. A Inspeção pagina doze Unidades e mantém no máximo
trinta e seis.

## Concorrência e repetição segura

**Concorrência otimista.** Estratégia em que uma escrita só confirma se a
versão lida ainda for corrente.

**Comparação e troca (`compare-and-swap`, CAS).** Comparação atômica entre a
revisão esperada e a atual antes de gravar o novo estado.

**Idempotência.** Propriedade de repetir o mesmo pedido e obter o mesmo efeito,
sem duplicação. Reutilizar a chave com conteúdo diferente é recusado.

**`requestId`.** Identidade da repetição segura. Não é identidade de Curso nem
permissão.

**Recibo de idempotência.** Registro temporário da impressão digital e do
resultado mínimo. Não substitui evento, histórico ou estado corrente.

**Rebase de estado pessoal.** Releitura do estado remoto seguida da aplicação
das operações locais pendentes. Conflito persistente encerra o ciclo e pede nova
leitura.

**Bloqueio consultivo transacional (`advisory lock`).** Bloqueio PostgreSQL por
chave lógica durante uma transação. Serializa operações concorrentes sem criar
uma entidade de produto.

**Evento de Curso.** Registro somente de acréscimo que conserva metadados e um
resumo da mudança quando há consumidor de histórico ou pesquisa. Não copia o
conteúdo nem registra endereço de correio eletrônico.

## Autenticação, acesso e segurança

**Autenticação.** Verificação da identidade de uma conta.

**Autorização.** Decisão sobre uma operação específica e um Curso específico.

**Proprietário (`owner`).** Conta que possui o Curso. A Autoria, a Pesquisa e o
MCP sobre esse Curso pertencem ao proprietário.

**Acesso direto.** Relação Curso-pessoa que concede Estudo. Não cria grupo,
organização, papel autoral ou coautoria.

**Perfil de pessoa.** Nome e referência opcional de avatar associados à conta.
Perfil não define autorização.

**Segurança por linha (`Row Level Security`, RLS).** Políticas PostgreSQL que
filtram linhas segundo a sessão autenticada. A proteção permanece necessária
mesmo quando uma função remota também valida autoridade.

**Menor privilégio.** Cada papel recebe apenas tabelas e funções exigidas. Uma
função nova não se torna acessível até entrar na lista explícita de permissões.

**Papel de serviço (`service_role`).** Papel administrativo usado dentro das
funções remotas para chamar funções internas. Nunca é entregue ao navegador ou
ao cliente MCP.

**Compartimento privado (`bucket`).** Conjunto de objetos sem endereço público.
Avatar e PDF de Fonte exigem autorização antes da emissão de um endereço
temporário.

**Exclusão de conta com limpeza física.** O aplicativo envia uma solicitação
confirmada, e a API deriva os Cursos e caminhos privados da pessoa autenticada.
A credencial administrativa permanece dentro da API enquanto ela remove PDFs e
avatares. A função transacional confirma que nenhum desses objetos permanece
antes de excluir a conta e os dados relacionais. Uma limpeza incompleta
interrompe a operação sem excluir a conta e permite repeti-la.

## API, banco e funções remotas

**PostgreSQL.** Autoridade remota para Curso, composição, planejamento,
propriedade, acesso, perfil, estado pessoal, Observações, Fontes, auditoria,
variantes e fatos de Pesquisa.

**PostgREST.** Camada que expõe funções PostgreSQL por HTTP conforme as
permissões do banco.

**Chamada de procedimento remoto (`Remote Procedure Call`, RPC).** Função de
banco chamada pela rede. Mantém transação, autorização e regras próximas aos
dados.

**Função remota (`Edge Function`).** Função HTTP executada na infraestrutura do
Supabase. A API de Curso e o servidor MCP autenticam o transporte e delegam
mutações às funções canônicas do banco.

**Roteador de Curso.** Camada compartilhada que transforma rotas HTTP em casos
de uso. Evita que interface visual e MCP implementem regras diferentes.

## MCP e assistência conversacional

**Model Context Protocol (MCP).** Protocolo pelo qual um cliente descobre
ferramentas e recursos e os chama com argumentos tipados.

**Ferramenta MCP.** Operação tipada, com esquema e indicação de leitura ou
escrita. Não oferece acesso direto ao banco.

**Recurso MCP.** Conhecimento carregado sob demanda. Invariantes estáveis podem
ficar num recurso; planejamento, parâmetros e demais dados mutáveis permanecem
no Curso.

**MCP Apps.** Extensão opcional que apresenta conteúdo estruturado dentro do
cliente. Pesquisa e Variantes podem usar um componente visual; a representação
textual continua disponível com os elementos canônicos do resultado quando o
cliente não oferece essa extensão. Um
endereço permanece disponível somente nos contratos que o fornecem.

**OAuth.** Protocolo de autorização usado para conectar a conta individual ao
cliente MCP.

**PKCE.** Vínculo criptográfico entre a solicitação de autorização e a troca do
código. O AraLearn exige o método S256.

**Escopo OAuth.** Limite declarado no token. Um escopo de escrita permite
solicitar uma ferramenta de mutação, mas a propriedade do Curso ainda é
verificada em cada chamada.

**Instrução de sistema (`system prompt`).** Instruções estáveis do cliente.
Dados mutáveis do Curso são lidos pelas ferramentas e não copiados para esse
texto.

**Pedido levado à conversa.** Texto que a interface copia para uso num cliente
conectado. A cópia não altera o Curso nem informa progresso até que operações
confirmadas ocorram.

**Comando de plano.** Operação fechada para atualizar campos, itens, Partes e
vínculos de produção. Interface e MCP usam o mesmo domínio.

**Comando de composição.** Operação separada que cria, altera ou remove
entidades didáticas. Reorganizar uma Parte não substitui conteúdo
implicitamente.

**Canal de autoria.** Origem persistida da mutação, `application` para a
interface ou `mcp` para o cliente conectado. O canal descreve o transporte, sem
mudar autoridade ou validação.

**Endereço direto.** Endereço que abre Curso, área e objeto reconhecível sem expor
um identificador técnico como linguagem principal para a pessoa.

## Observações situadas

**Observação.** Nome apresentado à pessoa para uma manifestação voluntária
ligada a um alvo do Curso.

**Anotação ancorada.** Registro técnico da Observação, com corpo, alvo,
identidade protegida, canal, revisão, estado e datas. Várias podem coexistir no
mesmo alvo.

**Reformulação de Fonte.** Resposta autoral a uma solicitação ligada a Fonte ou
Âncora. O registro identifica as revisões de Fonte e Âncora consideradas, sem
copiar o PDF ou seu conteúdo para a Observação.

**Versão do conjunto de Observações.** Contador crescente que protege leituras
e mutações. Para o proprietário cobre o Curso; em Estudo cobre somente a
projeção privada da própria pessoa.

**Pessoa protegida.** Forma pseudonimizada apresentada ao proprietário. O
contrato não entrega UUID ou endereço de correio eletrônico de quem registrou a
Observação.

## Fontes, Âncoras e PDFs

**Fonte.** Objeto interno ou externo do qual uma afirmação ou representação
deriva. Possui identidade estável e revisões somente de acréscimo.

**Revisão de Fonte.** Estado imutável dos metadados de uma Fonte em determinado
momento. Título, autoria, data, idioma, origem, disponibilidade, relações e
identificadores pertencem à revisão.

**Âncora de Fonte.** Seletor versionado que localiza página, seção, parágrafo,
intervalo temporal, fragmento de endereço ou trecho textual numa revisão exata.

**Atribuição de Fonte.** Conjunto ordenado de vínculos entre um item do plano ou
uma Unidade, revisões de Fontes, relações declaradas e Âncoras exatas.

**Proveniência.** Relação verificável entre Fonte, planejamento, produção e
Unidade. Identidade, revisão, relação, localização e aplicação podem ser
comprovadas; correção factual e autoria científica exigem outras evidências.

**Referência importada não resolvida (`unresolved_legacy`).** Referência preservada
sem metadados ou Âncora inventados. Fica oculta em Estudo até receber uma revisão
ativa na mesma identidade.

**Anexo PDF de Fonte.** Objeto privado e imutável ligado à revisão exata da
Fonte. O envio ocorre diretamente ao armazenamento de objetos por endereço
assinado e só se torna válido depois da confirmação transacional.

**Deduplicação por conteúdo.** Reutilização dos mesmos bytes quando o SHA-256,
tamanho e tipo coincidem dentro do Curso e da política de acesso. Cada revisão
mantém seu vínculo próprio.

**Cota de PDFs.** Cada arquivo aceita até 20 MiB; uma revisão de Fonte aceita
até oito PDFs; o Curso aceita 64 MiB de conteúdo PDF único.

## Auditoria e correções

**Auditoria instrucional focal.** Verificação de uma Unidade nas dimensões
estrutural, pedagógica, factual e editorial, usando contexto derivado pelo
servidor. Diagnostica sem alterar o Curso.

**Rodada de auditoria.** Registro imutável dos critérios, resultados e
evidências de uma execução. Uma rodada sem achados continua enumerável.

**Verificação de critério.** Aplicação de uma regra pública com resultado
aprovado, reprovado, incerto, não aplicável ou não verificado.

**Evidência factual.** Referência a uma revisão e Âncora ativas. Relações como
`supported_by` e `quoted_from` possuem sentidos diferentes e não podem ser
trocadas.

**Achado de auditoria.** Identidade estável de uma divergência ou incerteza,
com versões somente de acréscimo e estado próprio. Achado não é Observação nem
alteração do Curso.

**Versão do conjunto de auditoria.** Contador crescente que identifica a
revisão consultada por páginas e exigida pelos comandos do ciclo. Distingue-se
da revisão do Curso.

**Vínculo entre achado e Observação.** Relação que guarda identidade e versão da
Observação sem copiar texto ou pessoa. Uma Observação retirada aparece como
indisponível enquanto o vínculo existir.

**Correção autoral.** Proposta versionada para substituir somente conteúdo e
Fontes da Unidade focal. Não move, cria ou exclui entidades.

**Registro de correção.** Par de estados anterior e posterior usado para
conferir aplicação e reversão. Cada lado possui limite próprio e não copia o
Curso inteiro.

**Verificação de achado.** Nova rodada ligada ao achado e à correção aplicada.
O estado resolvido exige aprovação do critério focal; resultado contrário reabre
o achado.

**Reversão de correção.** Restauração confirmada do estado anterior, permitida
somente enquanto a Unidade ainda corresponde ao estado posterior registrado.

## Variantes comparáveis

**Variante comparável.** Curso independente criado a partir do mesmo
planejamento registrado que outros Cursos. Possui identidade, revisão,
composição, acesso e estado pessoal próprios.

**Ponto comum de planejamento.** Cópia imutável do plano, da revisão e da
impressão digital de configuração usada como origem da comparação.

**Conjunto de comparação.** Relação entre o Curso de origem, o ponto comum e de
duas a oito variantes pertencentes à mesma pessoa.

**Diferença declarada.** Parâmetro ou política de componentes que a pessoa
decidiu variar. Diferenças atuais podem coincidir com a declaração, aparecer
sem declaração ou refletir apenas fatos de composição e proveniência.

**Comparação factual.** Leitura de revisões, plano, parâmetros, política,
Partes, Unidades, componentes, Fontes, Âncoras e PDFs. É descritiva e não produz
inferência causal.

**Desvinculação.** Remoção da relação entre um Curso e o conjunto. O Curso não é
excluído.

## Pesquisa sobre a Autoria

**Fato de Autoria.** Linha identificável e redigida que descreve uma mudança ou
estado relevante do processo, com instante, revisão, canal, origem, estado,
objeto e valores escalares. Texto privado e identidade de conta não são
copiados para a projeção.

**Conjunto de fatos.** Recorte temático de atividade, materialização, desenho,
Fontes, Observações, auditorias ou variantes.

**Consulta versionada.** Recorte que fixa Curso, revisão, filtros, instante e
cursor. Um cursor não pode ser reutilizado com outros filtros.

**Dados ausentes.** Campo ou fato que não está disponível no recorte. Ausência
permanece explícita e não vira zero.

**Métrica.** Regra de cálculo com unidade, denominador, filtros e tratamento de
ausências. A medida resultante não é sinônimo de construto educacional.

**Exportação.** Representação CSV ou JSON de todas as páginas de uma consulta,
acompanhada pelo recorte, dicionário e limitações. A exportação não substitui a
consulta autorizada que a originou.

**Representação equivalente.** Gráfico, tabela, texto e componente MCP que
derivam das mesmas linhas e contagens. Divergência entre formas constitui falha
de contrato.
