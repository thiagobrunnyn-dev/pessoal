# Rascunhos n8n para a Mobiliza

Os quatro workflows vêm desativados. Eles consultam `https://mobilizafacilities.com.br` por GET. Os arquivos não incluem credenciais, destinatários ou ações de gravação de registros operacionais.

| Arquivo | Resultado esperado |
| --- | --- |
| `01-verificar-conexao.json` | `GET /api/integrations/v1/access` confirma `connected: true`, `permission: read` e a versão da API. |
| `02-resumo-solicitacoes.json` | `GET /api/integrations/v1/hub` retorna ao último nó somente totais de manutenção e compras, por status, com `due_today` e `past_due`. O painel aplica os prazos aos pedidos de compra. |
| `03-indicadores-semanais.json` | `GET /api/integrations/v1/dashboard-metrics?period=week` consulta os indicadores agregados da semana no fuso de Belém. |
| `04-saude-publica.json` | Confere Home, entrada e os dois formulários sem credencial. Mostra código HTTP e resultado de cada verificação. Quando há problema, a execução falha e informa somente as rotas, os códigos e os resultados no erro. O gatilho opcional de uma hora vem desabilitado. |

## Importar e verificar

1. Abra um workflow vazio no n8n e importe um JSON pelo menu do editor. O editor também aceita colar o JSON no canvas. Confira o nome e as configurações após a importação.
2. Nos três primeiros workflows, selecione uma credencial **Header Auth** no nó **HTTP Request**. No Mobiliza, use uma chave de **somente leitura** criada em **Configurações → Credenciais**. Preencha o nome do cabeçalho com `Authorization` e o valor com `Bearer ` seguido da chave diretamente no gerenciador de credenciais do n8n. Se disponível, limite os domínios permitidos ao host do Mobiliza.
3. Confira em **Settings** que os três workflows autenticados não salvam execuções manuais, dados de execuções de produção bem-sucedidas ou com erro, nem progresso dos nós. A execução manual ainda mostra os dados intermediários no editor. No resumo de solicitações, consulte a saída do último nó e evite fixar ou compartilhar a saída bruta de `/hub`. A saúde pública é o único workflow que guarda falhas de produção no histórico do n8n.
4. Quando quiser consultar o ambiente de produção, execute manualmente primeiro **Mobiliza — verificar conexão**. A saúde pública pode ser testada separadamente, sem chave. A saída `healthy: true` exige HTTP 200 e os elementos esperados nas quatro páginas.

Os GET autenticados registram o último uso e contam chamadas da credencial. O teste de saúde não envia formulários nem tenta entrar com uma conta. Para agendar esse teste depois, habilite o nó **A cada hora (opcional)** e publique o workflow no n8n. Ele continua sem notificações externas.

[Importação de workflows](https://docs.n8n.io/workflows/export-import/) · [Configurações de execução](https://docs.n8n.io/workflows/settings/)
