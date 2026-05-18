# Codex CLI local no AraLearn

O AraLearn pode usar um provedor local por meio do Codex CLI.

Esse caminho permite executar parte dos fluxos de assistência sem depender exclusivamente de serviços remotos por API. Ele é mais técnico, mas amplia a autonomia de quem deseja configurar o próprio ambiente.

## Como a integração funciona

O app se comunica com uma ponte HTTP local. Essa ponte aciona o Codex CLI e devolve a resposta ao AraLearn.

Para o usuário do app, o provedor aparece como uma opção de assistência. A complexidade fica concentrada na configuração local.

## Por que isso importa

O AraLearn foi desenhado para preservar controle do usuário sobre o material. A possibilidade de usar um provedor local reforça essa direção.

Ela não elimina todos os limites operacionais, mas permite combinar:

- projeto salvo no dispositivo;
- autoria humana;
- assistência por IA;
- menor dependência de uma plataforma remota específica.

## Requisitos

Para esse modo funcionar, o ambiente precisa ter:

- Codex CLI instalado;
- Node funcional;
- ponte HTTP local em execução;
- endpoint acessível ao app;
- configuração correta no painel de provedor.

No Windows com Codex instalado pelo VS Code, o executável pode estar exposto como `codex.exe`, sem `codex.cmd`. O script de setup detecta o comando disponível e passa o caminho encontrado ao bridge por `ARALEARN_CODEX_COMMAND`.

## Plataformas

O princípio vale para desktop e Android.

No desktop, a ponte roda no ambiente local do sistema. No Android, o caminho tende a passar por Termux ou solução equivalente.

No fluxo top-down, cada fase do `CourseForge` aparece no popup de progresso. Quando uma fase chama o Codex local, a UI marca explicitamente a chamada ao modelo; fases determinísticas aparecem como etapas locais do motor.

## Limites

Esse modo exige configuração técnica. Ele não é o fluxo mais simples para o usuário comum.

Também não dispensa validação. Mesmo com provedor local, o conteúdo gerado deve passar pelo contrato público, pela revisão do usuário e pelas verificações do app.
