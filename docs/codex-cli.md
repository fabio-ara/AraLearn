# Codex CLI local no AraLearn

O AraLearn suporta um provider local via `Codex CLI`. Esse caminho permite executar parte dos fluxos do app sem depender apenas de providers por API.

## Como a integração funciona

O app conversa com um bridge HTTP local, e esse bridge aciona o `Codex CLI`. A interface continua simples, enquanto a execução local fica encapsulada como provider do produto.

## O que precisa existir

Para esse modo funcionar, o ambiente precisa ter:

- bridge local ativo;
- endpoint acessível;
- `Codex CLI` instalado;
- ambiente Node funcional para o bridge.

## Em quais plataformas

O princípio é o mesmo em Windows, Linux e Android. No Android, a operação costuma passar por `Termux`; no desktop, pelo ambiente local do sistema.

## Quando esse modo faz mais sentido

Esse provider tende a ser útil quando o usuário quer:

- reduzir dependência de API externa;
- ampliar autonomia operacional;
- experimentar fluxos locais com mais controle do ambiente.

## Limite prático

Esse caminho continua exigindo preparação técnica do dispositivo. Ele amplia a autonomia do app, mas não elimina a necessidade de setup local.
