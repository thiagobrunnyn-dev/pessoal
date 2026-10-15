# Mobiliza — Controle de climatização

Exportação sanitizada do código da versão publicada **v72**, baseada no commit de origem `87b89c5c2b45331ad8b98e35f0d17d059889d533` (15/10/2026).

## Estado desta cópia

Este repositório contém uma cópia do código atual para desenvolvimento. Não está conectado à publicação automática do Sites. Alterações ou commits aqui não atualizam o site publicado.

Inclui aplicação React/TypeScript, backend Vinext/Cloudflare Workers, esquema e migrações D1, testes e assets de marca. Não inclui registros de produção, banco de dados, fotos operacionais, uploads, segredos, credenciais ou histórico anterior.

## Privacidade e configuração obrigatória

A cópia pública foi sanitizada: nomes e e-mails de operadores viraram exemplos fictícios, o identificador do proprietário foi substituído por `CONFIGURE_VERIFIED_SITE_OWNER_ID`, e o vínculo do projeto Sites foi removido do manifesto. O README operacional original e o cache TypeScript foram omitidos. Seis comandos de backfill específicos de imóveis reais foram removidos da migração 0012; a estrutura e os triggers foram preservados. A lista de pessoas autorizadas no diretório público inicia vazia, e os identificadores fixos de centros de custo foram substituídos por exemplos.

Antes de usar em outro ambiente, configure um principal verificado de proprietário em `lib/owner-access.ts` e os convites autorizados em `lib/app-access.ts`. O e-mail regional deve ser configurado de forma consistente em `lib/regional-access.ts`, `lib/request-intake-management.ts` e `app/member-access.tsx`. Nunca use um e-mail ou a primeira pessoa que acessa como prova de propriedade. Preserve todos os guards, confirmação de identidade e limites de acesso.

Configure também o proprietário em `lib/regional-access.ts`, os perfis explicitamente autorizados em `lib/request-directory-policy.ts` e qualquer regra específica de centro de custo em `lib/request-directory-model.ts`. As origens do painel, solicitações e lavanderia usam domínios `example.invalid`: substitua-os pelas origens do seu ambiente, incluindo a política CORS e as configurações de mapas. Ajuste as fixtures de testes correspondentes quando alterar essa configuração.

Os placeholders não liberam acesso a usuários reais. Não publique esta cópia sobre a produção sem revisão de configuração, testes e aprovação. Configurações reais de pessoas devem permanecer em configuração privada, não neste repositório público.

## Desenvolvimento

Requer Node.js >= 22.13.0 e npm. Execute `npm ci`, depois `npm run dev`. Para gerar a aplicação, execute `npm run build`. As dependências exatas estão em `package-lock.json`.

O backend depende de serviços Sites/Cloudflare e dos bindings D1 `DB` e R2 `BUCKET`. Um clone isolado não reproduz autenticação, armazenamento nem dados de produção. Provisionamento, credenciais, migrações em ambiente remoto e deploy devem ser configurados separadamente. Não há workflow de deploy ou sincronização automática instalado.

## Configurações, API e n8n

A área `/configuracoes` reúne visão geral, gestão de chaves, documentação da API e integração com n8n. A documentação inclui métodos GET, POST e DELETE, permissões, exemplos de requisição e resposta, download do OpenAPI e um workflow inicial para importação no n8n.

- Gateway da API: `/api/integrations/v1/`, implementado em `app/api/integrations/v1/[...path]/route.ts`.
- Administração de chaves: `app/api/settings/integrations/route.ts`, restrita ao proprietário verificado.
- Contrato, exemplos e workflow: arquivos `lib/integration-*`.
- Migração de chaves: `drizzle/0042_dusty_gwen_stacy.sql`.
- Testes: `node tests/integrations.cjs`.

As chaves têm permissões de leitura/escrita, validade e revogação. O segredo é exibido na criação e somente seu hash é armazenado. Configure a chave nas credenciais do n8n e a URL do ambiente antes de executar o workflow. Nenhuma chave de produção acompanha esta cópia. As operações DELETE de registros documentadas fazem arquivamento reversível; DELETE `/access` revoga a própria chave.

## Git e publicação

O histórico já existente deste repositório foi preservado. O código v72 é importado como um novo snapshot; o histórico original do Sites não faz parte desta exportação pública. O site e os dados em produção permanecem no ambiente original.

## Verificação

A exportação passa por varredura de segredos e dados pessoais conhecidos. Essa revisão não substitui uma auditoria completa de segurança. As migrações descrevem a estrutura e transformações do banco, sem exportação de dados operacionais.

Verificação local desta exportação: `npm run build` aprovado, `tsc --noEmit` sem erros e os 12 arquivos executáveis de testes com saída 0, usando as dependências já disponíveis no ambiente. O carregador de `tests/hub-requests.cjs` foi ajustado para distinguir TypeScript, TSX e JSON. A política do diretório foi testada com a lista pública vazia. Nenhum deploy faz parte desta transferência.
