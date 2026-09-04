# Contact Bootstrap Tool

Ferramenta OFFLINE para preparar, validar e auditar o primeiro bootstrap real de contatos do Restaurante Prato Mineiro.

## Regras
- Nenhuma operação de rede.
- Zero Update / Zero Delete. Apenas criações com precondição `exists: false`.
- Não envia dados para o Firestore de verdade nesta fase (F1B-05A).
- PII limits: logs não mostram telefones ou nomes.
- Arquivos `.local.json` e `.plan.json` são ignorados no Git.
- O CLI recusa saída de plano sem o sufixo ignorado `.plan.json`.

## Como usar
Para planejar e validar usando o arquivo de exemplo:
```sh
npm run bootstrap:contacts:plan -- --input tools/contact-bootstrap/example-manifest.json --output tools/contact-bootstrap/example.plan.json
```
