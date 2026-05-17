# Codex CLI local no AraLearn

O AraLearn suporta um provider local via `Codex CLI`. Esse caminho permite executar parte dos fluxos do app sem depender apenas de providers por API.

## Como a integração funciona

O app conversa com um bridge HTTP local, e esse bridge aciona o `Codex CLI`. A interface continua simples, enquanto a execução local fica encapsulada como provider do produto.

## Por que isso importa

Esse modo amplia a autonomia operacional do app e reforça uma dimensão importante do projeto: a possibilidade de combinar persistência local, autoria do usuário e assistência não inteiramente subordinada a serviços remotos.

## O que precisa existir

Para esse modo funcionar, o ambiente precisa ter:

- bridge local ativo;
- endpoint acessível;
- `Codex CLI` instalado;
- ambiente Node funcional para o bridge.

## Em quais plataformas

O princípio é o mesmo em Windows, Linux e Android. No Android, a operação costuma passar por `Termux`; no desktop, pelo ambiente local do sistema.

## Limite prático

Esse caminho continua exigindo preparação técnica do dispositivo. Ele amplia a autonomia do app, mas não elimina a necessidade de setup local.
