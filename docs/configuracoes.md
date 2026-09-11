# Configurações do aplicativo

Abra **Configurações** pelo botão de conta no cabeçalho da tela inicial, de Estudo ou de Autoria. O painel reúne escolhas pessoais: sua identificação, a aparência, os dados deste dispositivo e o modo de conduzir a autoria. Fechar o painel devolve o contexto em que você estava; **Voltar** ou Escape sai primeiro do grupo aberto.

| Grupo | Para que serve | Onde a escolha vale |
| --- | --- | --- |
| **Conta** | Entrar, alterar identificador e foto, sair ou excluir a conta | Conta da pessoa, conforme a ação |
| **Aparência** | Escolher tema do sistema, claro ou escuro | Dispositivo atual |
| **Sincronização e dados deste dispositivo** | Escolher quando enviar e consultar mudanças, reunir progresso sem conta ou limpar dados locais | Dispositivo atual |
| **Preferências de autoria** | Guardar como deseja trabalhar com o assistente | Padrão pessoal salvo na conta |

Sem conta, os mesmos grupos informam o que está disponível. Aparência permite alterar o tema; Sincronização permite cuidar do progresso local, incluindo remover somente os dados de visitante. Essa limpeza conserva os dados das contas existentes. Para editar preferências pessoais de autoria, é necessário entrar. **Manutenção** aparece apenas para quem tem o papel administrativo autorizado.

## Preferências pessoais

O **foco** indica que trabalho deseja desenvolver. **Conteúdo** trata explicações e fontes. **Ciclo completo** inclui também o desenho e a produção das unidades. Essa escolha permite, por exemplo, trabalhar primeiro a explicação de um assunto antes de pedir sua organização em atividades.

A **cadência** indica como o trabalho será agrupado: por microssequência, parte ou lote. Uma microssequência desenvolve um objetivo do curso; uma parte reúne microssequências para produção, e um lote pode agrupar várias partes, conforme o [planejamento de autoria](planejamento-contextual.md). Escolher um agrupamento não determina sozinho seu tamanho nem a frequência das pausas. O recorte e os limites de continuidade precisam acompanhar o trabalho combinado.

Os **pontos de revisão** indicam onde você quer inspecionar propostas ou resultados. Os parâmetros de **diálogo** orientam a forma da conversa. Você pode ajustar essas escolhas separadamente; selecionar um ponto de inspeção não registra automaticamente que o conteúdo foi revisado.

O padrão inicial do aplicativo e suas preferências salvas têm sua origem indicada. Escolhas expressas no curso e condições de pesquisa prevalecem sobre o padrão pessoal. Um trabalho já combinado conserva seu acordo até uma mudança explícita. [Parâmetros de autoria](parametros-de-autoria.md) explica como essas preferências se relacionam às decisões de cada curso.

Salvar preferências não altera o currículo, as explicações, as unidades ou suas marcas de revisão. Para mudar conteúdo já produzido, é necessário solicitar e inspecionar essa alteração.

## Guardar e retomar uma edição

O painel conserva o rascunho quando você muda de grupo, fecha e reabre. Se os dados da conta foram alterados em outro acesso, ele apresenta os valores salvos para comparação. Você pode carregar esses valores ou conservar seu rascunho para concluir a decisão.

Se uma gravação ficar sem confirmação, siga a recuperação indicada no mesmo painel antes de iniciar outro pedido. O aplicativo procura conferir o resultado e preserva as edições feitas depois do envio. [Solução de problemas](solucao-de-problemas.md#o-formulário-reapareceu-depois-de-salvar) explica esse caso.

## Conta, aparência e dados locais

As instruções de cadastro, perfil, tema, saída e exclusão estão em [Uso do aplicativo](uso-do-app.md). Para preparar estudo sem rede e escolher quando sincronizar, veja o [guia do estudante](guia-estudante.md#escolher-quando-sincronizar).

## Verificação

Os testes de [Configurações no navegador](../tests/e2e/common-settings.spec.js) exercitam retorno ao contexto, preservação de rascunhos, alterações por outra sessão e recuperação de gravação. Usam a interface e o armazenamento local reais com respostas de serviço controladas. O [teste de Autoria](../tests/runtime/course-authoring-surface.test.js) também confere a abertura do painel sem trocar de rota.

Essas verificações examinam a interface. Autenticação, gravação no servidor e integração pelos canais têm verificações próprias, descritas no [guia de desenvolvimento](guia-desenvolvedor.md).
