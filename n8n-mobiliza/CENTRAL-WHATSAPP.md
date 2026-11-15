# Central do WhatsApp

A Central registra no painel o que acontece nos grupos de WhatsApp da operação: mensagens dos grupos acompanhados, solicitações detectadas, resumos diários e mensagens enviadas pela gestão. A tela fica em `/whatsapp` (menu Serviços → Central do WhatsApp).

## Como funciona

O painel não fala com o WhatsApp. O n8n faz a ponte entre o WAHA e a API de integrações do painel:

| Fluxo no n8n | Quando roda | O que faz |
| --- | --- | --- |
| Mobiliza \| Central WhatsApp \| Captura | A cada minuto | Busca no painel a lista de grupos acompanhados, lê no WAHA as mensagens novas de cada um e grava no painel |
| Mobiliza \| Central WhatsApp \| Sincronizar grupos | A cada hora | Atualiza a lista de grupos da sessão do WAHA |
| Mobiliza \| Central WhatsApp \| Análise | A cada 10 minutos | Classifica as mensagens com a OpenAI e cria as solicitações detectadas |
| Mobiliza \| Central WhatsApp \| Resumo diário | Todo dia às 20h | Resume o dia de cada grupo |
| Mobiliza \| Central WhatsApp \| Envio | A cada minuto | Envia pelo WAHA as mensagens escritas no painel e os avisos de solicitações |

Todos usam o endpoint `/api/integrations/v1/whatsapp`, implementado em `lib/whatsapp-api.ts`. Nenhum deles depende de webhook no WAHA: a captura consulta o WAHA por conta própria, então a sessão do WAHA não precisa ser alterada.

A captura lê até 60 grupos por rodada. Ela relê os últimos cinco minutos (o painel descarta mensagens repetidas pelo identificador) e, depois de uma parada do n8n, relê o período desde a última leitura completa, até 6 horas.

## Regras de privacidade

- Um grupo novo entra como "não registrado". Nenhuma mensagem dele é guardada até um administrador marcá-lo como acompanhado no painel, confirmando que os participantes foram avisados.
- Só entram mensagens escritas depois de o grupo passar a ser acompanhado. A captura relê alguns minutos para trás (e horas, depois de uma parada), mas o painel recusa o que for anterior ao momento em que o grupo foi marcado.
- Conversas individuais nunca são registradas, só grupos.
- Após 90 dias (`WHATSAPP_RETENTION_DAYS` em `lib/whatsapp.ts`) são apagados o texto e o remetente de cada mensagem, o texto dos envios já finalizados, o nome do solicitante das solicitações encerradas e, nos avisos de solicitações já finalizados, o texto e o número do solicitante. Categorias, resumos e o registro das solicitações e dos avisos permanecem.
- A limpeza roda junto das ações agendadas do n8n (captura, sincronização de grupos e fila de envio). Antes mesmo de ela rodar, as consultas do painel e da API já não devolvem o que venceu. Com o n8n parado, o dado vencido fica oculto, mas só sai do banco quando um fluxo voltar a rodar.
- Mídias (fotos, áudios, documentos) não são baixadas nem armazenadas; fica só o registro de que houve mídia.
- A análise envia o texto das mensagens para a OpenAI. Nomes e telefones dos participantes não são enviados: na classificação vai só o nome do grupo e o texto; no resumo os participantes viram "Participante 1, 2…".
- O acesso regional (por UF) não enxerga a Central.

## Ativação

1. **Banco:** aplique as migrações `drizzle/0045_whatsapp_central.sql` e `drizzle/0046_request_notices.sql` no ambiente e publique esta versão do painel.
2. **Chave do painel:** em Configurações → Credenciais, crie uma chave com permissão de **escrita**.
3. **Credencial no n8n:** crie uma credencial do tipo Header Auth, com o campo Name `Authorization` e o campo Value `Bearer mbl_...`, e selecione-a em todos os nós HTTP dos cinco fluxos.
4. **URL do painel:** os nós HTTP apontam para `https://mobilizafacilities.com.br`. Troque se o ambiente for outro.
5. **Sessão do WAHA:** os nós do WAHA (fluxos de captura, de grupos, de envio e do agente) precisam do nome real da sessão. Confira o nome no painel do WAHA; uma sessão inexistente faz o WAHA responder erro 422.
6. **Fuso horário:** defina o fuso (por exemplo `America/Sao_Paulo`) nas configurações dos fluxos com horário fixo, Resumo diário e Agente da gestão, porque o fuso padrão do n8n costuma ser outro.
7. **Ordem para ligar:** Sincronizar grupos → marque os grupos no painel → Captura → Análise → Resumo diário → Envio.
8. **Execuções guardadas:** um fluxo configurado para não guardar execuções não mostra falhas no n8n. Para acompanhar os primeiros dias, deixe ao menos as execuções com erro guardadas; elas contêm o texto das mensagens daquela rodada.

## Limites

- A API de integrações aceita 120 chamadas por minuto por chave. A captura faz uma consulta de grupos por minuto e grava as mensagens em lotes de até 30; com os outros fluxos na mesma chave, o uso normal fica longe do limite.
- Um envio que o n8n retirou da fila e não confirmou em 10 minutos é marcado como falha e **não** é reenviado sozinho, para o grupo não receber a mesma mensagem duas vezes. A regra vale também para os avisos de solicitações, que têm limites próprios (veja a seção deles).
- A detecção de solicitações é automática e pode errar. A gestão confere cada uma antes de assumir, concluir ou descartar.
- As solicitações detectadas têm ciclo próprio na Central; ainda não viram ordens de serviço nem solicitações gerais automaticamente.

## Avisos de solicitações

Toda solicitação de manutenção, de material ou de compra gera mensagens automáticas de WhatsApp em dois momentos: quando é **registrada** (formulários gerais `/formularios/manutencao` e `/formularios/compra`, e canal por QR `/canal/...` de cada imóvel) e quando é **encerrada** no painel ("Encerrar pedido" nas solicitações gerais, "Encerrar triagem" nas do canal do imóvel). A avaliação de hospedagem é uma opinião, não uma solicitação: não gera aviso nenhum, nem para grupo nem para quem avaliou.

O código fica em `lib/request-notices.ts` (regras e textos) e `lib/request-notices-api.ts` (fila). A fila é a tabela `request_notices`.

### Quem recebe

- **O grupo de WhatsApp.** É o grupo vinculado ao imóvel na Central (campo "Imóvel relacionado" do grupo). Se o imóvel não tiver grupo, ou a solicitação não tiver imóvel, o aviso vai para o **grupo geral de solicitações**. Sem nenhum dos dois, não há aviso de grupo, e nada falha por isso.
  - Nos formulários gerais o imóvel só é conhecido depois da triagem. Por isso o aviso de registro vai para o grupo geral, e o de encerramento vai para o grupo do imóvel vinculado na triagem, quando houver.
  - Com dois grupos vinculados ao mesmo imóvel, recebe o que é acompanhado pela Central e, em caso de empate, o cadastrado há mais tempo.
- **O solicitante**, no número que informou no campo "WhatsApp para receber avisos", desde que tenha marcado "Autorizo receber no WhatsApp os avisos desta solicitação". O campo é opcional; número sem autorização, ou inválido, é recusado no envio do formulário. O campo livre "Contato para retorno" continua existindo e não é usado para avisos.

### O que vai e o que não vai na mensagem

| Mensagem | Conteúdo |
| --- | --- |
| Grupo, no registro | Protocolo, tipo (Manutenção, Material ou Compra), assunto e imóvel do cadastro quando houver e, rotulado como informado por quem pediu: local, itens (material e compra) e um trecho da descrição (até 280 caracteres), mais a data do recebimento |
| Grupo, no encerramento | Protocolo, tipo, assunto, imóvel do cadastro, local informado e as datas de recebimento e de encerramento |
| Solicitante, no registro e no encerramento | Protocolo, tipo, assunto, imóvel do cadastro quando houver e as datas. **Nenhum texto digitado no formulário** |

O assunto existe só nos pedidos de manutenção feitos pelo QR do imóvel e é o nome da opção escolhida na lista fixa do formulário (por exemplo "Ar-condicionado"). Por não ser texto digitado, pode ir também ao solicitante.

Nunca vão, em nenhuma mensagem: nome, função, empresa, contato e WhatsApp de quem pediu; a observação interna do encerramento; fotos; links. No texto informado que vai ao grupo, endereços de sites são desfeitos ("site.com" vira "site. com") e toda sequência de 8 ou mais dígitos (telefones, CPF, chaves PIX), com ou sem espaços, pontos, hífens e parênteses, vira `[número omitido]`. As datas seguem o horário de Belém.

A mensagem do solicitante usa só dados do próprio painel porque o número de destino é digitado em um formulário público: assim ninguém consegue fazer o WhatsApp da empresa entregar um texto escolhido por ele a um número qualquer.

Exemplo de aviso ao grupo (registro pelo QR de um imóvel):

```
*Nova solicitação*
Protocolo: *SOL-1A2B3C4D5E6F7A8B*
Tipo: Manutenção
Assunto: Ar-condicionado
Imóvel: República Alfa 01
Local informado: Quarto 3
Descrição informada: O ar-condicionado parou de gelar ontem à noite. Já desliguei e liguei de novo.
Recebida em 13/11/2026 às 14:32
_Horário de Belém._
```

Exemplo de aviso ao solicitante (encerramento):

```
*MOBILIZA FACILITIES*
O atendimento da sua solicitação foi encerrado.

Protocolo: *SOL-1A2B3C4D5E6F7A8B*
Tipo: Manutenção
Assunto: Ar-condicionado
Imóvel: República Alfa 01
Recebida em 13/11/2026 às 14:32
Encerrada em 14/11/2026 às 09:10
_Horário de Belém._
```

### Como marcar o grupo geral

Na Central, aba **Grupos**, abra o grupo e use **Usar como grupo geral de solicitações** (só administradores do painel; chaves de integração não podem). Só um grupo tem a função por vez: marcar outro tira a função do anterior. O grupo geral não precisa ser um grupo acompanhado. Para um imóvel ter grupo próprio, abra o grupo e escolha o imóvel em **Imóvel relacionado**.

### Entrega

Não há fluxo novo no n8n nem mudança no contrato. O fluxo **Envio** retira os avisos da fila junto com os envios do painel: `outbox_claim` devolve os dois no mesmo formato (`id`, `chat_jid`, `body`), do mais antigo para o mais novo e respeitando o `limit`; `outbox_result` aceita o `id` de qualquer uma das duas filas. No aviso ao solicitante, o `chat_jid` é o número no formato `55DDDNÚMERO@c.us`.

**Envio a uma pessoa.** Quando o `chat_jid` termina em `@c.us`, o fluxo Envio pergunta primeiro ao WAHA (operação *Contacts → Check Exists*) qual é o identificador daquele número e envia para o identificador devolvido. No Brasil o identificador pode não ter o nono dígito, e enviar direto para o número digitado pode não chegar. Se o número não tem WhatsApp, o fluxo devolve a falha "O número informado não tem WhatsApp." e o aviso fica como falha no painel.

Os avisos aparecem na aba **Envios**, seção **Avisos de solicitações**: protocolo, momento (registro ou encerramento), destino (nome do grupo, ou o número do solicitante mostrando só os 4 últimos dígitos), situação, datas e erro. A lista é somente leitura e não mostra o texto da mensagem. Os totais de envios da Visão geral (na fila e com falha em 24 h) somam os avisos.

O aviso entregue a um grupo **acompanhado** entra também no histórico da conversa desse grupo na Central, com o remetente "Aviso de solicitação", como acontece com as mensagens escritas no painel. Em grupo não acompanhado o texto não é guardado no histórico, só o registro do aviso.

O aviso nunca impede o registro nem o encerramento: se a criação falhar, a solicitação é salva do mesmo jeito e o erro vai para o log do servidor (sem número de telefone). Repetir o mesmo envio do formulário, ou a mesma ação de encerrar, cria o aviso que faltou e nunca duplica um que já existe. Reabrir e encerrar de novo gera um novo aviso de encerramento.

### Limites

Os formulários são públicos; os limites existem para que um uso indevido deles não vire mensagem em massa saindo do número da operação. Um aviso barrado por limite fica registrado como **Cancelado**, com o motivo, sem texto e sem número, e a solicitação é salva normalmente.

| Limite | Valor |
| --- | --- |
| Avisos para o mesmo grupo | 30 por hora |
| Avisos para o mesmo número | 6 por dia |
| Avisos a solicitantes, somando todos os números | 60 por hora |
| Avisos aguardando o n8n | 200 |
| Tempo na fila | 24 horas; depois disso o aviso é cancelado, para não chegar fora de hora |
| Confirmação do n8n | 10 minutos depois de retirado; sem confirmação vira falha e não é reenviado |

Outros pontos:

- O aviso de grupo confere, na hora em que o n8n retira, se o grupo ainda está cadastrado; se não estiver, vira falha e não é entregue.
- O painel não confere se o número informado existe no WhatsApp; quem confere é o fluxo Envio, antes de enviar. Número sem WhatsApp, ou envio recusado pelo WAHA, deixa o aviso como falha, com o motivo devolvido pelo n8n.
- Após 90 dias, os avisos finalizados perdem o texto, o número do solicitante e o identificador da mensagem no WAHA (que também carrega o número). O número que a pessoa digitou continua na solicitação original, que é imutável, e as telas e a API só o mostram mascarado.
- A troca de sequências de 8 ou mais dígitos também esconde, no aviso ao grupo, datas escritas com hífen ou ponto (por exemplo `14-11-2026`) e listas como `101 102 103`. O texto completo continua no painel.

**Risco que permanece.** Como o formulário é público, alguém pode informar o número de outra pessoa e marcar a autorização no lugar dela. O efeito é o número da empresa enviar a quem não pediu o aviso-padrão (protocolo, tipo e data, sem nenhum texto livre), no máximo 6 vezes por dia para o mesmo número e 60 por hora somando todos. Quem recebe pode bloquear ou denunciar o número; se isso se repetir, vale reduzir os limites em `lib/request-notices.ts` ou retirar o campo do formulário.

## Grupo da gestão e grupos que o n8n acompanha

O **grupo da gestão** é onde o assistente Mobi conversa com os gestores. Ele é escolhido na Central: aba **Grupos**, abra o grupo e use **Usar como grupo da gestão (assistente Mobi)** (só administradores do painel; chaves de integração não podem). Só um grupo tem a função por vez, e o grupo marcado ganha o selo **Gestão**. O painel não faz mais nada com essa marca: não envia nada sozinho para esse grupo, e os avisos de solicitações continuam indo só para o grupo do imóvel ou para o grupo geral.

Para o n8n saber quais grupos importam sem pagar o custo do resumo completo, há uma consulta leve, que aceita chave de leitura:

```
GET /api/integrations/v1/whatsapp?view=targets
```

Ela devolve `{"chats":[{"id","chat_jid","name","monitored","requests_default","management_default"}]}` só com os grupos acompanhados (`monitored`), o grupo geral de solicitações (`requests_default`) e o grupo da gestão (`management_default`), em ordem de nome, no máximo 300. As mesmas duas marcas também vêm em cada grupo de `view=overview` e `view=chat`. O acesso regional continua sem enxergar a Central.

Quem usa a consulta: o fluxo do agente Mobi, para achar o grupo da gestão, e o fluxo de captura, para saber quais grupos ler. Enquanto o painel publicado não tiver `view=targets`, a captura lê a mesma lista em `view=overview`; depois da publicação, vale trocar a URL do nó "Listar grupos acompanhados" para `?view=targets`, que é mais leve.

## Testes

`node tests/whatsapp.cjs` exercita os handlers reais com as migrações em SQLite em memória: captura, deduplicação, análise, resumo, fila de envio, retenção e permissões. `node tests/request-notices.cjs` faz o mesmo para os avisos de solicitações, o grupo geral, o grupo da gestão e a consulta `view=targets`.

## Agente da gestão (Mobi)

O fluxo `Mobiliza | Agente da gestão | WhatsApp` é um assistente de consulta para os gestores, dentro de um grupo de WhatsApp só da gestão:

- **Perguntas:** no grupo, escreva `Mobi, ...` seguido da pergunta ("Mobi, o que está pendente hoje?"). Ele lê o grupo a cada 30 segundos, consulta o painel e responde no grupo, em geral em até um minuto.
- **Resumo do dia:** todo dia às 7h posta o que está urgente ou atrasado, o que vence hoje e os números gerais.
- **Somente leitura:** usa uma chave de consulta do painel. Não altera registros nem escreve em outros grupos.
- **Fontes:** resumo geral, tarefas de hoje, indicadores, solicitações gerais, solicitações dos imóveis e Central do WhatsApp.

Para ativar:

1. Crie o grupo da gestão com o número da operação e marque-o na Central como grupo da gestão (veja "Grupo da gestão e grupos que o n8n acompanha"). O fluxo descobre o grupo pela consulta `view=targets`; sem grupo marcado, o agente não lê nem responde nada.
2. No painel, crie uma chave **somente leitura**; no n8n, crie uma credencial do tipo Header Auth, com Name `Authorization` e Value `Bearer mbl_...`, e selecione-a no nó "Buscar grupo da gestão" e nas seis ferramentas.
3. Publique o fluxo. Não é preciso webhook no WAHA nem identificador de grupo escrito no fluxo.
4. Não marque o grupo da gestão como acompanhado na Central, para as perguntas e respostas não entrarem na análise dos grupos.

Cada rodada lê uma janela fixa de 30 segundos, com 10 segundos de folga, e atende no máximo três perguntas. Pergunta feita com o n8n parado não é respondida depois; basta repetir.

O agente responde com o que as consultas devolvem, mas a redação é de um modelo de IA e pode errar; para decisões importantes, confira no painel. As perguntas e os dados consultados são enviados à OpenAI.
