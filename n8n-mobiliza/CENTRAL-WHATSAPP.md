# Central do WhatsApp

A Central registra no painel o que acontece nos grupos de WhatsApp da operação: mensagens dos grupos acompanhados, solicitações detectadas, resumos diários e mensagens enviadas pela gestão. A tela fica em `/whatsapp` (menu Serviços → Central do WhatsApp).

## Como funciona

O painel não fala com o WhatsApp. O n8n faz a ponte entre o WAHA e a API de integrações do painel:

| Fluxo no n8n | Quando roda | O que faz |
| --- | --- | --- |
| Mobiliza \| Central WhatsApp \| Captura | A cada mensagem (webhook do WAHA) | Grava no painel as mensagens de grupos |
| Mobiliza \| Central WhatsApp \| Sincronizar grupos | A cada hora | Atualiza a lista de grupos da sessão do WAHA |
| Mobiliza \| Central WhatsApp \| Análise | A cada 10 minutos | Classifica as mensagens com a OpenAI e cria as solicitações detectadas |
| Mobiliza \| Central WhatsApp \| Resumo diário | Todo dia às 20h | Resume o dia de cada grupo |
| Mobiliza \| Central WhatsApp \| Envio | A cada minuto | Envia pelo WAHA as mensagens escritas no painel |

Todos usam o endpoint `/api/integrations/v1/whatsapp`, implementado em `lib/whatsapp-api.ts`. Os cinco fluxos são criados inativos.

## Regras de privacidade

- Um grupo novo entra como "não registrado". Nenhuma mensagem dele é guardada até um administrador marcá-lo como acompanhado no painel, confirmando que os participantes foram avisados.
- Conversas individuais nunca são registradas, só grupos.
- O texto e o remetente de cada mensagem são apagados 90 dias depois (`WHATSAPP_RETENTION_DAYS` em `lib/whatsapp.ts`). Categorias, resumos e solicitações permanecem.
- Mídias (fotos, áudios, documentos) não são baixadas nem armazenadas; fica só o registro de que houve mídia.
- A análise envia o texto das mensagens para a OpenAI. Nomes e telefones dos participantes não são enviados: na classificação vai só o nome do grupo e o texto; no resumo os participantes viram "Participante 1, 2…".
- O acesso regional (por UF) não enxerga a Central.

## Ativação

1. **Banco:** aplique a migração `drizzle/0045_whatsapp_central.sql` no ambiente e publique esta versão do painel.
2. **Chave do painel:** em Configurações → Credenciais, crie uma chave com permissão de **escrita**.
3. **Credencial no n8n:** crie a credencial `Mobiliza · Central WhatsApp (escrita)` com o cabeçalho `Authorization: Bearer mbl_...` e selecione-a em todos os nós HTTP dos cinco fluxos.
4. **URL do painel:** os nós HTTP apontam para `https://mobilizafacilities.com.br`. Troque se o ambiente for outro.
5. **Sessão do WAHA:** os nós do WAHA usam a sessão `default`. Troque nos fluxos de grupos e de envio se a sua tiver outro nome.
6. **Webhook do WAHA:** na sessão do WAHA, adicione um webhook para a URL de produção do nó "Evento do WAHA" (fluxo de captura), com o evento `message.any` e um cabeçalho secreto. Configure o mesmo cabeçalho na credencial desse nó.
7. **Ordem para ligar:** Sincronizar grupos → marque os grupos no painel → Captura → Análise → Resumo diário → Envio.

## Limites

- A API de integrações aceita 120 chamadas por minuto por chave. A captura faz uma chamada por mensagem; grupos muito movimentados podem exigir uma chave só para a captura.
- Um envio que o n8n retirou da fila e não confirmou em 10 minutos é marcado como falha e **não** é reenviado sozinho, para o grupo não receber a mesma mensagem duas vezes.
- A detecção de solicitações é automática e pode errar. A gestão confere cada uma antes de assumir, concluir ou descartar.
- As solicitações detectadas têm ciclo próprio na Central; ainda não viram ordens de serviço nem solicitações gerais automaticamente.

## Testes

`node tests/whatsapp.cjs` exercita os handlers reais com as migrações em SQLite em memória: captura, deduplicação, análise, resumo, fila de envio, retenção e permissões.
