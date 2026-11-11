# Mobiliza Facilities

O Mobiliza reúne imóveis e ocupação, solicitações de manutenção e compras, histórico de serviços, gestão de equipe e indicadores operacionais. A página inicial apresenta o sistema, encaminha a equipe para o login e dá acesso aos formulários públicos.

Esta cópia reúne o código da aplicação, o esquema e as migrações D1, os testes e quatro modelos de automação do n8n. Identidades, credenciais e registros operacionais são configurados e mantidos no ambiente de cada instalação.

## Desenvolvimento

Use Node.js 24 e npm. Execute `npm ci` e `npm run dev` para abrir a prévia, ou `npm run build` para gerar a aplicação.

A versão do Sites usa Vinext e os bindings Cloudflare D1 `DB` e R2 `BUCKET`. O manifesto em `.openai/hosting.json` é um modelo. As branches `cloudflare-homologacao` e `producao-vps` mantêm as configurações de implantação daqueles ambientes, com suas próprias sequências de migração.

As páginas só podem ser exibidas em iframe pelo próprio site. Para liberar outro endereço, como a pré-visualização embutida do editor de hospedagem, defina `MOBILIZA_FRAME_ANCESTORS` no ambiente do servidor com as origens confiáveis separadas por espaço (por exemplo `https://editor.example.com`). Só são aceitas origens `https://`, com `*.` opcional no início do domínio; qualquer outro valor é ignorado e o bloqueio padrão continua valendo.

## Visual

O sistema tem dois visuais, escuro (padrão) e claro. A escolha fica no cookie `mobiliza_hub_theme` e é aplicada no `<html data-theme>` pelo `app/layout.tsx`; o botão de visual alterna entre os dois. As telas internas ficam dentro da estrutura do dashboard (menu lateral e cabeçalho) por um `layout.tsx` em cada pasta de rota, que reexporta `app/components/frame-layout.tsx`. A página inicial institucional mantém a paleta própria.

As folhas `*.dark.css` são geradas a partir das folhas claras por `scripts/build-dark-theme.mjs`: depois de alterar cores em um `.css`, rode `npm run theme:dark`. O teste `tests/app-theme.cjs` falha se alguma estiver desatualizada. Ajustes manuais do tema e os tokens ficam em `app/theme.css`.

## Acesso da equipe

Para configurar o login próprio, defina no ambiente do servidor `MOBILIZA_SUPABASE_AUTH=1`, `MOBILIZA_SUPABASE_URL`, `MOBILIZA_SUPABASE_PUBLISHABLE_KEY` e `MOBILIZA_SUPABASE_OWNER_ID` com o UID do primeiro administrador no Supabase. O identificador do proprietário da aplicação em `lib/owner-access.ts` deve corresponder ao ambiente em uso. A variável opcional `MOBILIZA_SUPABASE_MEMBERS` vincula UIDs do Supabase a contas legadas.

A tela **Equipe** permite que administradores criem usuários quando `MOBILIZA_SUPABASE_SECRET_KEY` está configurada como segredo no servidor. As permissões dos demais usuários seguem o perfil atribuído. Para instalações com acesso legado, revise os convites, o acesso regional, os perfis autorizados do diretório e as origens dos mapas e formulários. Os valores de exemplo vêm da versão pública anterior.

A migração `drizzle/0043_password_access.sql` adiciona o armazenamento de sessões de senha à sequência do Sites. Aplique as migrações no ambiente correspondente antes de habilitar o login.

## API e n8n

Em **Configurações → Conectar ao n8n**, o Mobiliza apresenta o catálogo da API e o workflow inicial. A API usa `/api/integrations/v1/`, e a área **Credenciais** permite criar chaves com validade e permissão de consulta ou alteração. Para as consultas, use uma chave de somente leitura no gerenciador de credenciais do n8n.

Os quatro modelos e as instruções de importação estão no [guia do n8n](n8n-mobiliza/README.md). A [Central do WhatsApp](n8n-mobiliza/CENTRAL-WHATSAPP.md) registra no painel os grupos acompanhados pelo WAHA, com análise, resumos e fila de envio. Eles cobrem conexão, solicitações e prazos, indicadores semanais e disponibilidade das páginas públicas.

## Verificação

Para verificar as mudanças de acesso, painel e integração, rode `node tests/password-access.cjs`, `node tests/hub-requests.cjs`, `node tests/request-intakes.cjs` e `node tests/integrations.cjs`.
