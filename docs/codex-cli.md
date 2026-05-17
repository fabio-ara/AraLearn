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

## Plataformas

O princípio vale para desktop e Android.

No desktop, a ponte roda no ambiente local do sistema. No Android, o caminho tende a passar por Termux ou solução equivalente.

## Limites

Esse modo exige configuração técnica. Ele não é o fluxo mais simples para o usuário comum.

Também não dispensa validação. Mesmo com provedor local, o conteúdo gerado deve passar pelo contrato público, pela revisão do usuário e pelas verificações do app.
