# Atendimento privado pelo WhatsApp

O webhook publicado do n8n recebe o evento `message` da sessão WAHA. A API
`/api/request-agent` grava pedidos de manutenção e de compra no mesmo painel
dos formulários. O fluxo **Central WhatsApp — Envio** entrega o protocolo pela
fila de avisos.

## Configurar a API

Aplique `0047_whatsapp_request_agent` ao banco do Site, depois de confirmar
`0046_request_notices`. Configure no Site `MOBILIZA_WHATSAPP_REQUEST_SESSION`
com a sessão autorizada e configure dois segredos distintos de 32 bytes,
representados em hexadecimal minúsculo.

- `MOBILIZA_WHATSAPP_REQUEST_TOKEN` autentica apenas esta rota. No n8n, use uma
  credencial de cabeçalho com nome `Authorization` e valor `Bearer <segredo>`.
- `MOBILIZA_WHATSAPP_REQUEST_IDENTITY_KEY` assina internamente o vínculo entre a
  conversa e o protocolo. Mantenha essa chave no ambiente do Site. A troca do
  token de acesso preserva os vínculos desde que esta chave permaneça estável.

Faça uma consulta com a credencial do n8n a
`GET https://mobiliza.example.invalid/api/request-agent`. A resposta esperada
é `200 {"ready":true}`. Ela verifica a configuração e as tabelas, sem criar
uma solicitação.

## Ligar o fluxo de atendimento

O fluxo antigo enviava todas as operações para `www` na mesma rota. Adapte os
nós de criação e consulta ao contrato abaixo. O webhook do WAHA continua
autenticado por um cabeçalho próprio, separado da credencial do Mobiliza.

1. No nó que valida o remetente, aceite somente a sessão configurada, eventos
   `message` recebidos em conversa individual e mensagens com
   `fromMe === false`. Se o WAHA entregar um `@lid`, resolva o telefone no
   próprio WAHA antes de avançar.
2. Defina `session`, `sender` e `messageId` em nós determinísticos a partir da
   mensagem verificada. Use o ID da mensagem em que a pessoa confirmou o pedido
   como chave de reenvio. Os campos coletados na conversa vêm do solicitante.
3. Mostre o resumo e registre a confirmação de que os dados serão enviados à
   gestão do Mobiliza para tratar o pedido e que o protocolo chegará ao mesmo
   WhatsApp. Abra a solicitação somente depois desse aceite.
4. Envie um POST em JSON para `https://mobiliza.example.invalid/api/request-agent`
   com `action: "create"`, `session`, `sender`, `messageId`, `kind`
   (`maintenance` ou `purchase`) e `values`. Use `@c.us` ou
   `@s.whatsapp.net` no remetente. Em `values`, passe
   `privacy_accepted: true`, `privacy_version: "whatsapp-agent-v1"`,
   `name`, `job_title`, `company`, `location`, `description` e `items`.
   Manutenção exige `address` e `items: []`. Compra exige pelo menos um item
   com `name` e `quantity` numérica, com `unit` opcional. O contrato de compra
   também aceita `cost_center` e `needed_on` opcional em `AAAA-MM-DD`.
5. Use o protocolo devolvido para rastrear o pedido. A fila do Mobiliza é
   responsável pelo comprovante privado de criação. Em falhas transitórias
   ou resposta perdida, repita o mesmo POST e os mesmos campos. O serviço
   devolve o protocolo original e enfileira no máximo um comprovante.

Para uma consulta solicitada na conversa, faça POST com `action: "status"`,
`session`, `sender` e `protocol`. O serviço devolve protocolo, situação e
data de recebimento quando a conversa é a mesma que abriu o pedido. Use a
resposta do n8n apenas para as consultas de situação.

## Validar de ponta a ponta

Faça um pedido marcado como teste, vindo do remetente autorizado. Confira a
solicitação na aba **Solicitações** do Mobiliza e o aviso correspondente na
**Central do WhatsApp → Envios**. Confirme no aparelho que o protocolo
recebido corresponde ao do painel. O recibo do atendimento privado tem como
destino o próprio remetente. Acompanhe o resultado pelo protocolo e pelo
horário, sem registrar o texto da conversa nos relatórios de diagnóstico.
