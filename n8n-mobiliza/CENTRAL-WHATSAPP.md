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
- Após 90 dias (`WHATSAPP_RETENTION_DAYS` em `lib/whatsapp.ts`) são apagados o texto e o remetente de cada mensagem, o texto dos envios já finalizados e o nome do solicitante das solicitações encerradas. Categorias, resumos e o registro das solicitações permanecem.
- A limpeza roda junto das ações agendadas do n8n (captura, sincronização de grupos e fila de envio). Antes mesmo de ela rodar, as consultas do painel e da API já não devolvem o que venceu. Com o n8n parado, o dado vencido fica oculto, mas só sai do banco quando um fluxo voltar a rodar.
- Mídias (fotos, áudios, documentos) não são baixadas nem armazenadas; fica só o registro de que houve mídia.
- A análise envia o texto das mensagens para a OpenAI. Nomes e telefones dos participantes não são enviados: na classificação vai só o nome do grupo e o texto; no resumo os participantes viram "Participante 1, 2…".
- O acesso regional (por UF) não enxerga a Central.

## Ativação

1. **Banco:** aplique a migração `drizzle/0045_whatsapp_central.sql` no ambiente e publique esta versão do painel.
2. **Chave do painel:** em Configurações → Credenciais, crie uma chave com permissão de **escrita**.
3. **Credencial no n8n:** crie a credencial `Mobiliza · Central WhatsApp (escrita)`, do tipo Header Auth, com o campo Name `Authorization` e o campo Value `Bearer mbl_...`, e selecione-a em todos os nós HTTP dos cinco fluxos.
4. **URL do painel:** os nós HTTP apontam para `https://mobilizafacilities.com.br`. Troque se o ambiente for outro.
5. **Sessão do WAHA:** os nós do WAHA (fluxos de grupos, de envio e do agente) precisam do nome real da sessão. Confira o nome no painel do WAHA; uma sessão inexistente faz o WAHA responder erro 422.
6. **Fuso horário:** se o n8n rodar em UTC, defina o fuso (por exemplo `America/Sao_Paulo`) nas configurações dos fluxos com horário fixo: Resumo diário e Agente da gestão.
7. **Webhook do WAHA:** na sessão do WAHA, adicione um webhook para a URL de produção do nó "Evento do WAHA" (fluxo de captura), com o evento `message.any` e um cabeçalho secreto. Configure o mesmo cabeçalho na credencial desse nó.
8. **Ordem para ligar:** Sincronizar grupos → marque os grupos no painel → Captura → Análise → Resumo diário → Envio.

## Limites

- A API de integrações aceita 120 chamadas por minuto por chave. A captura faz uma chamada por mensagem; grupos muito movimentados podem exigir uma chave só para a captura.
- Um envio que o n8n retirou da fila e não confirmou em 10 minutos é marcado como falha e **não** é reenviado sozinho, para o grupo não receber a mesma mensagem duas vezes.
- A detecção de solicitações é automática e pode errar. A gestão confere cada uma antes de assumir, concluir ou descartar.
- As solicitações detectadas têm ciclo próprio na Central; ainda não viram ordens de serviço nem solicitações gerais automaticamente.

## Testes

`node tests/whatsapp.cjs` exercita os handlers reais com as migrações em SQLite em memória: captura, deduplicação, análise, resumo, fila de envio, retenção e permissões.

## Agente da gestão (Mobi)

O fluxo `Mobiliza | Agente da gestão | WhatsApp` é um assistente de consulta para os gestores, dentro de um grupo de WhatsApp só da gestão:

- **Perguntas:** no grupo, escreva `Mobi, ...` seguido da pergunta ("Mobi, o que está pendente hoje?"). Ele consulta o painel na hora e responde no grupo.
- **Resumo do dia:** todo dia às 7h posta o que está urgente ou atrasado, o que vence hoje e os números gerais.
- **Somente leitura:** usa uma chave de consulta do painel. Não altera registros nem escreve em outros grupos.
- **Fontes:** resumo geral, tarefas de hoje, indicadores, solicitações gerais, solicitações dos imóveis e Central do WhatsApp.

Para ativar:

1. Crie o grupo da gestão com o número da operação e copie o identificador dele (termina em `@g.us`; aparece na lista de grupos do WAHA e na Central).
2. No nó "Preparar pedido", preencha `GRUPO_DA_GESTAO`. Enquanto estiver vazio, o agente não responde a ninguém.
3. No painel, crie uma chave **somente leitura**; no n8n, crie a credencial `Mobiliza · Agente da gestão (leitura)`, do tipo Header Auth, com Name `Authorization` e Value `Bearer mbl_...`, e selecione-a nas seis ferramentas.
4. No WAHA, aponte um webhook com o evento `message` (não `message.any`) para a URL de produção do nó "Mensagem do WAHA", com um cabeçalho secreto igual ao da credencial desse nó.
5. Não marque o grupo da gestão como acompanhado na Central, para as perguntas e respostas não entrarem na análise dos grupos.

O agente responde com o que as consultas devolvem, mas a redação é de um modelo de IA e pode errar; para decisões importantes, confira no painel. As perguntas e os dados consultados são enviados à OpenAI.
