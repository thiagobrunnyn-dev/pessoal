# Mobiliza no Cloudflare Workers

## 1. Preparar o ambiente

- Use uma conta Cloudflare com acesso administrativo a Workers, D1 e Zero Trust. A conta também precisa administrar a zona quando chegar a hora de associar os domínios definitivos. Use um repositório GitHub privado e autorize a integração Cloudflare somente nesse repositório.
- Separe homologação e produção. Cada ambiente usa dois Workers, um para o painel e os formulários e outro para a administração. O par compartilha o binding `DB` (D1) do próprio ambiente. A produção e a homologação de anexos também exigem o binding `BUCKET` (R2). Use recursos distintos entre ambientes e mantenha os buckets privados.
- Na homologação, use dados sintéticos inicialmente. Esta cópia do projeto traz o esquema e as migrações. A base local tem apenas parte dos registros da origem e não inclui os anexos reais. Preserve a publicação original e seus domínios durante a homologação.

## 2. Configurar o acesso

No Worker do painel, deixe públicos `/entrar`, `/formularios/manutencao` e `/formularios/compra`. A equipe inicia sessão por código individual em `/entrar`. O administrador emite esses códigos em `/equipe`, no hostname administrativo.

Proteja **todo o hostname administrativo** com Cloudflare Access e uma política de permissão exclusiva para o proprietário. O link de acesso administrativo abre a raiz desse hostname, e o Access protege também as páginas e APIs usadas após a entrada. Use um hostname administrativo de homologação ou um segundo Worker de homologação protegido em `workers.dev`. Configure e valide essa proteção antes de ligar o Worker a dados reais. [Proteger Workers com Cloudflare Access](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)

| Variável de execução | Onde configurar | Valor |
| --- | --- | --- |
| `MOBILIZA_AUTH_MODE` | Ambos os Workers | `cloudflare-access` |
| `MOBILIZA_ADMIN_URL` | Worker do painel | Origem HTTPS do Worker administrativo protegido |
| `MOBILIZA_ACCESS_TEAM_URL` | Worker administrativo | Origem HTTPS da equipe Zero Trust |
| `MOBILIZA_ACCESS_AUD` | Worker administrativo | Identificador de audiência da aplicação Access |
| `MOBILIZA_ACCESS_OWNER_SUB` | Worker administrativo | `sub` do proprietário, obtido de uma identidade Access verificada |

O Worker administrativo valida o JWT de Access antes de mapear a identidade para o proprietário do Mobiliza. Preserve o `SITE_OWNER_ID` dos dados originais e configure os convites e o escopo regional no checkout privado. Revise também as origens permitidas de formulários e mapas e a lista do diretório público. Guarde credenciais no Cloudflare e mantenha `MOBILIZA_TRUST_SITES_AUTH` desativado nesses Workers. [Validação de JWTs](https://developers.cloudflare.com/cloudflare-one/access-controls/applications/http-apps/authorization-cookie/validating-json/)

## 3. Compilar e conectar a branch

Configure as variáveis de build por Worker. O nome deve coincidir com o Worker correspondente no painel Cloudflare.

- `CLOUDFLARE_WORKER_NAME`
- `CLOUDFLARE_D1_DATABASE_ID` e `CLOUDFLARE_D1_DATABASE_NAME`
- `CLOUDFLARE_R2_BUCKET_NAME`, obrigatório exceto no modo de homologação sem R2 descrito abaixo.
- Na homologação, use `CLOUDFLARE_DEPLOY_ENV=staging`. Se precisar de endereço temporário `workers.dev`, habilite-o explicitamente com `CLOUDFLARE_WORKERS_DEV=1` e proteja o Worker administrativo com Access.
- No build do painel, `MOBILIZA_ADMIN_URL` pode definir o link administrativo na configuração gerada. Use apenas a origem HTTPS.

Para homologar sem ativar o R2, use `CLOUDFLARE_DEPLOY_ENV=staging` e `CLOUDFLARE_STAGING_WITHOUT_R2=1`. Deixe `CLOUDFLARE_R2_BUCKET_NAME` sem valor. Use dados sintéticos para validar o login, o painel e o envio de formulários de texto. O envio e a leitura de fotos e anexos armazenados no R2 ficam indisponíveis. Para validar esses fluxos, remova `CLOUDFLARE_STAGING_WITHOUT_R2` e configure um bucket de homologação.

### Entrada com e-mail e senha

Aplique a migração D1 `0045_password_access` no banco do ambiente que receberá a nova entrada. Em **Variables & Secrets** do Worker, configure a URL do projeto em `MOBILIZA_SUPABASE_URL`, a chave publicável em `MOBILIZA_SUPABASE_PUBLISHABLE_KEY` e o UUID verificado do sócio-administrador em `MOBILIZA_SUPABASE_OWNER_ID`. Guarde a chave secreta do projeto como segredo de execução `MOBILIZA_SUPABASE_SECRET_KEY`. Essa chave autoriza a criação de usuários no servidor. [Chaves da API do Supabase](https://supabase.com/docs/guides/getting-started/api-keys)

Para vincular uma conta existente, use `MOBILIZA_SUPABASE_MEMBERS` com um objeto JSON que associa o UUID do Supabase ao ID do membro ativo no D1. Confira o e-mail e a função do cadastro antes de vincular. O perfil de encarregado de manutenção mantém o acesso aos registros do Pará.

Use o perfil **Administrador (ADM)** na área **Equipe** para conceder acesso integral ao painel, inclusive ao cadastro de outros administradores. Cada ADM tem seu próprio cadastro e pode ter seu acesso revogado na mesma área. Preserve o `SITE_OWNER_ID` e o vínculo do primeiro administrador para manter a referência dos dados existentes.

Em um projeto dedicado ao Mobiliza, desative o cadastro público em **Authentication → Sign In / Providers** e mantenha a confirmação de e-mail. Defina `MOBILIZA_SUPABASE_AUTH=1` depois de preparar o administrador. Valide a entrada dele e o cadastro de um usuário fictício em **Equipe**. O administrador repassa a senha inicial diretamente, e a pessoa define sua própria senha no primeiro acesso. Revogue a conta fictícia ao terminar. [Configuração de autenticação](https://supabase.com/docs/guides/auth/general-configuration)

Com Node.js 22.13 ou superior, valide localmente:

```sh
npm ci
npm run build
npm run cloudflare:prepare
npm run cloudflare:dry-run
```

No Workers Builds, conecte os dois Workers de homologação à branch de homologação do GitHub. Use `npm run build && npm run cloudflare:prepare` como comando de build e `npm run cloudflare:deploy` como comando de deploy de homologação. O script exige `CLOUDFLARE_DEPLOY_ENV=staging`. As variáveis de build selecionam o Worker e seus recursos. Configure as variáveis de execução separadamente em **Variables & Secrets**. Para a produção, prepare a branch protegida e um deploy separado após validar os recursos definitivos. Mantenha dumps, objetos R2, credenciais e estado local fora do Git. [Configuração do Workers Builds](https://developers.cloudflare.com/workers/ci-cd/builds/configuration/)

## 4. Migrar e conferir os dados

1. Obtenha um backup autorizado e completo do D1 da origem, com esquema, registros e histórico de migrações. Obtenha também a cópia dos objetos do R2 original. Se a origem for gerenciada pelo Sites, confirme o meio de exportação com o administrador da origem antes de marcar a troca. Use a cópia parcial local apenas para desenvolvimento.
2. Restaure em recursos isolados e confira o histórico de migrações antes de aplicar só as migrações pendentes. Preserve IDs e relações entre imóveis, pessoas, centrais, solicitações, ordens, manutenções e fotos. Compare totais por tabela e verifique a integridade referencial.
3. Copie os objetos R2 preservando chave, bytes e tipo de conteúdo. Compare totais e tamanhos, confira os objetos referenciados pelo banco e abra uma amostra de fotos e anexos pelos endpoints autenticados. [Exportação e importação D1](https://developers.cloudflare.com/d1/best-practices/import-export-data/) · [Migração de dados R2](https://developers.cloudflare.com/r2/data-migration/)
4. Valide o painel com manutenções pendentes, a entrada do proprietário, a recusa de uma identidade não autorizada e os convites de uso único com expiração, saída e revogação. Confira que o perfil do Pará acessa somente os registros autorizados e que o público envia manutenção e compras sem login. Use dados de teste nessas gravações de homologação.

## 5. Trocar e poder voltar

Agende uma janela curta para suspender gravações na origem, sincronizar a diferença final do D1 e R2 e repetir as conferências. Registre a versão ativa dos dois Workers e a configuração anterior dos domínios. Só associe domínios definitivos ou altere DNS depois de validar a restauração, a autenticação e os formulários nos endereços temporários. Após a troca, confirme os três fluxos nos endereços definitivos e mantenha a origem preservada durante a janela de retorno.

Se a troca falhar, interrompa novas gravações e reconcilie as entradas recebidas no destino antes de voltar o tráfego à origem. Para falha apenas de código, reverta os Workers às últimas versões compatíveis com o banco ativo. A reversão de versão do Worker não restaura D1 ou R2. Use os backups para recuperar os dados quando necessário e confira o estado restaurado antes de abrir novamente para gravações. [Reversão de Workers](https://developers.cloudflare.com/workers/versions-and-deployments/rollbacks/)
