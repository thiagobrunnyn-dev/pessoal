# Mobiliza — Controle de climatização

Exportação sanitizada do código da versão publicada v66, baseada no commit de origem `f518840c31a8f414289ab7c950199785dd666650`.

## Estado desta cópia

Este repositório é uma exportação inicial para desenvolvimento. Não está conectado à publicação automática do Sites. Alterações ou commits aqui não atualizam o site publicado. A versão v67, ainda não publicada, não foi incluída.

Inclui aplicação React/TypeScript, backend Vinext/Cloudflare Workers, esquema e migrações D1, testes e assets de marca. Não inclui registros de produção, banco de dados, fotos operacionais, uploads, segredos, credenciais ou histórico anterior.

## Privacidade e configuração obrigatória

A cópia pública foi sanitizada: nomes e e-mails de operadores viraram exemplos fictícios, o identificador do proprietário foi substituído por `CONFIGURE_VERIFIED_SITE_OWNER_ID`, e o vínculo do projeto Sites foi removido do manifesto. O README operacional original e o cache TypeScript foram omitidos. Seis comandos de backfill específicos de imóveis reais foram removidos da migração 0012; a estrutura e os triggers foram preservados.

Antes de usar em outro ambiente, configure um principal verificado de proprietário em `lib/owner-access.ts` e os convites autorizados em `lib/app-access.ts`. O e-mail regional deve ser configurado de forma consistente em `lib/regional-access.ts`, `lib/request-intake-management.ts` e `app/member-access.tsx`. Nunca use um e-mail ou a primeira pessoa que acessa como prova de propriedade. Preserve todos os guards, confirmação de identidade e limites de acesso.

Os placeholders não liberam acesso a usuários reais. Não publique esta cópia sobre a produção sem revisão de configuração, testes e aprovação. Configurações reais de pessoas devem permanecer em configuração privada, não neste repositório público.

## Desenvolvimento

Requer Node.js >= 22.13.0 e npm. Execute `npm ci`, depois `npm run dev`. Para gerar a aplicação, execute `npm run build`. As dependências exatas estão em `package-lock.json`.

O backend depende de serviços Sites/Cloudflare e dos bindings D1 `DB` e R2 `BUCKET`. Um clone isolado não reproduz autenticação, armazenamento nem dados de produção. Provisionamento, credenciais, migrações em ambiente remoto e deploy devem ser configurados separadamente. Não há workflow de deploy ou sincronização automática instalado.

## Verificação

A exportação passa por varredura de segredos e dados pessoais conhecidos. Essa revisão não substitui uma auditoria completa de segurança. As migrações descrevem a estrutura e transformações do banco, sem exportação de dados operacionais.

Verificação local desta exportação: `npm run build` aprovado, TypeScript sem erros e 11 arquivos de testes com saída 0, usando dependências disponíveis no ambiente. Nenhum deploy foi executado.
