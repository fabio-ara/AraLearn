# Configurações do aplicativo

**Configurações** abre pelo botão de conta no cabeçalho da tela inicial, de
Estudo e de Autoria. O botão tem o mesmo nome acessível, **Configurações**, e abre uma folha sobre o contexto corrente. Fechar devolve o foco ao acionador; Voltar e Escape saem primeiro do grupo aberto. O conteúdo de origem e os campos de edição permanecem abertos por baixo do painel.

O painel organiza **Conta**, **Aparência**, **Sincronização e dados deste dispositivo** e **Preferências de autoria**. Manutenção aparece somente depois de uma leitura autorizada confirmar o papel administrativo; as operações continuam submetidas ao controle de acesso do serviço. A foto de perfil abre como detalhe de Conta e retorna ao mesmo grupo.

A pessoa sem conta encontra os mesmos quatro grupos. Conta oferece entrada e Aparência altera o tema deste dispositivo. Sincronização explica a conservação local do progresso e permite remover somente os dados sem conta mediante confirmação expressa. A limpeza conserva os dados locais das contas existentes. Preferências de autoria explica o alcance pessoal e oferece entrada para editar as escolhas salvas na conta.

## Preferências pessoais

O foco define o trabalho: **Conteúdo** desenvolve explicações e fontes;
**Ciclo completo** continua também o desenho e a produção das unidades. A
cadência agrupa esse trabalho por microssequência, parte ou lote. Os pontos de
revisão indicam o que a pessoa deseja inspecionar ao longo do processo, e os
parâmetros de diálogo orientam a conversa. Cada escolha tem controle próprio. Os campos reutilizam o catálogo de parâmetros do produto. Escolher a cadência não define tamanhos nem frequência de pausa. Selecionar um ponto de revisão indica onde inspecionar e não declara revisão de conteúdo.

A origem identifica o padrão inicial do aplicativo ou as preferências salvas na conta. Escolhas expressas no curso e condições de pesquisa têm precedência sobre o padrão pessoal. Um processo já combinado com o assistente permanece vigente até uma mudança explícita. Salvar essas preferências não modifica bases, unidades, currículo ou marcas de revisão. O contrato de resolução está em [Parâmetros de autoria](parametros-de-autoria.md).

A folha preserva o rascunho ao trocar de grupo, fechar e reabrir. Uma consulta ou gravação tardia atualiza a informação correspondente sem trocar o painel ativo ou retirar o foco. A releitura das preferências conserva as alterações locais; se a conta mudou em outro acesso, mostra os valores salvos para comparação. A pessoa pode conservar seu rascunho sobre a revisão consultada ou carregar os valores salvos expressamente.

Depois de uma resposta de gravação incerta, a interface relê a conta na mesma tentativa. Se os valores enviados estão confirmados na revisão posterior, encerra a pendência sem repetir a escrita. Se a leitura ainda não confirma o efeito, conserva o pedido e o rascunho; a recuperação consulta novamente e reutiliza a identidade original. Edições feitas depois do envio continuam abertas para uma próxima gravação.

O identificador de perfil também conserva sua edição entre reaberturas. Leituras anteriores não substituem uma leitura mais recente. A confirmação de um envio só normaliza o campo quando a pessoa não o editou depois daquele envio; a edição posterior permanece no campo.

## Verificação

O teste focal de [Autoria](../tests/runtime/course-authoring-surface.test.js) verifica que a entrada chama Configurações sem nova renderização ou mudança de rota. Os testes de [Configurações no navegador](../tests/e2e/common-settings.spec.js)
usam os componentes reais de interface com respostas de serviço controladas: grupos e papel, foco, retorno, rascunho reaberto, leituras concorrentes, confirmação tardia, dimensões independentes, conflito e recuperação por releitura. A limpeza usa o armazenamento local real do navegador, IndexedDB, em um
ambiente isolado e verifica a conservação dos dados de outra conta de teste.

Esses testes isolam o comportamento da interface. Autenticação, persistência remota e operação pelos canais são verificadas separadamente nas [validações de integração](guia-desenvolvedor.md).
