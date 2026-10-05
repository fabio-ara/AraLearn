# Configurações do aplicativo

Abra **Configurações** pelo botão de conta no cabeçalho da tela inicial, em Estudo ou Autoria. O painel separa as escolhas pelo lugar em que produzem efeito: algumas pertencem à conta; outras valem somente no dispositivo atual. Fechar o painel devolve o contexto em que você estava; **Voltar** ou Escape sai primeiro do grupo aberto.

| Grupo | Para que serve | Onde a escolha vale |
| --- | --- | --- |
| **Conta** | Entrar, alterar identificador e foto, sair ou excluir a conta | Conta da pessoa, conforme a ação |
| **Aparência** | Escolher tema do sistema, claro ou escuro | Dispositivo atual |
| **Sincronização e dados deste dispositivo** | Escolher quando enviar e consultar mudanças, reunir progresso sem conta ou limpar dados locais | Dispositivo atual |
| **Preferências de autoria** | Guardar como deseja trabalhar com o assistente | Padrão pessoal salvo na conta |
| **Conectar assistente** | Preparar a conexão e seguir a autorização no aplicativo de conversa escolhido | Conexão autorizada com a conta AraLearn |

Sem conta, os mesmos grupos informam o que está disponível. Aparência permite alterar o tema; Sincronização permite cuidar do progresso local, incluindo remover somente os dados de visitante. Essa limpeza conserva os dados das contas existentes. Para editar preferências pessoais de autoria, é necessário entrar. **Manutenção** aparece apenas para quem tem o papel administrativo autorizado.

Em **Conectar assistente**, você encontra dois canais. O **Model Context Protocol (MCP)** permite que um aplicativo de conversa descubra e utilize as ferramentas do AraLearn. Seu endereço pode ser copiado antes do login. A opção **Conexão por OpenAPI** oferece operações descritas em um formato padronizado e exige uma conta para gerar credenciais e vincular o assistente. O [guia de conexão](conectar-assistente.md) orienta a escolha; o [manual ilustrado do ChatGPT](chatgpt.md) apresenta os dois percursos nesse aplicativo.

## Preferências pessoais

As preferências pessoais orientam o início de um trabalho com o assistente. Você escolhe o tipo de trabalho, o agrupamento das etapas e os momentos em que deseja conferir o resultado. A autorização dada na conversa define o que o assistente pode fazer naquele pedido.

O **foco** distingue duas formas de conduzir a autoria. **Conteúdo** trabalha a explicação e suas fontes. **Ciclo completo** coordena também o desenho e a produção das unidades no recorte autorizado. Assim, você pode desenvolver primeiro a base de um assunto ou conduzir no mesmo trabalho sua passagem para a sequência de estudo.

A **cadência** define a escala acompanhada, da microssequência — um percurso de estudo com objetivo delimitado — ao lote que reúne várias partes de produção. Esses recortes organizam o trabalho conduzido em conjunto; o [planejamento de autoria](planejamento-contextual.md) explica sua relação com o curso. O tamanho de uma parte e a frequência das pausas têm escolhas próprias.

Os **pontos de revisão** indicam se você pretende inspecionar o mapa, a explicação ou as unidades durante o processo. Depois de examinar o material salvo, você pode registrar sua declaração de revisão por uma ação própria. Os parâmetros de **diálogo** ajustam a forma da conversa, como a extensão da resposta e a preferência por concisão, debate ou explicação desenvolvida. A extensão do conteúdo de estudo depende de suas necessidades didáticas.

O painel identifica se o valor veio do padrão inicial ou de uma preferência que você salvou. Uma escolha feita para determinado curso vale naquele contexto; uma condição de pesquisa fixa o que precisa permanecer constante numa comparação. Um trabalho já iniciado conserva o que foi combinado até uma mudança expressa. [Parâmetros de autoria](parametros-de-autoria.md) explica como esses alcances se relacionam.

As preferências salvas orientam os trabalhos seguintes. O material já produzido conserva suas escolhas até que você solicite e inspecione uma alteração nele.

## Guardar e retomar uma edição

O painel conserva o rascunho quando você muda de grupo, fecha e reabre. Se os dados da conta foram alterados em outro acesso, ele apresenta os valores salvos para comparação. Você pode carregar esses valores ou conservar seu rascunho para concluir a decisão.

Se uma gravação ficar sem confirmação, use a recuperação indicada no painel. Ela verifica primeiro se o servidor recebeu a alteração anterior, evitando que outro envio substitua ou duplique o trabalho. As edições feitas depois do envio permanecem no rascunho. [Solução de problemas](solucao-de-problemas.md#o-formulário-reapareceu-depois-de-salvar) explica esse caso.

## Conta, aparência e dados locais

As instruções de cadastro, perfil, tema, saída e exclusão estão em [Uso do aplicativo](uso-do-app.md). Para preparar estudo sem rede e escolher quando sincronizar, veja o [guia do estudante](guia-estudante.md#escolher-quando-sincronizar).

## Verificação técnica

Para quem desenvolve, o teste de [Configurações no navegador](../tests/e2e/common-settings.spec.js) usa a interface e o armazenamento local reais, com respostas controladas do serviço. Ele verifica o retorno ao contexto, a preservação de rascunhos, mudanças vindas de outra sessão e a recuperação de gravações. O teste da [superfície de Autoria](../tests/runtime/course-authoring-surface.test.js) confere também a abertura do painel no curso sem trocar de rota.

Esses testes examinam o comportamento da interface. As verificações de autenticação, gravação no servidor e integração pelos canais têm escopos próprios, reunidos no [guia de desenvolvimento](guia-desenvolvedor.md).
