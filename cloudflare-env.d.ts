interface ImportMetaEnv {
  readonly MOBILIZA_LOCAL_MOCK_AUTH?: string;
}

declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    MOBILIZA_TRUST_SITES_AUTH?: string;
    MOBILIZA_AUTH_PROXY_SECRET?: string;
    MOBILIZA_AUTH_MODE?: string;
    MOBILIZA_ADMIN_URL?: string;
    MOBILIZA_ACCESS_TEAM_URL?: string;
    MOBILIZA_ACCESS_AUD?: string;
    MOBILIZA_ACCESS_OWNER_SUB?: string;
    MOBILIZA_SUPABASE_AUTH?: string;
    MOBILIZA_SUPABASE_URL?: string;
    MOBILIZA_SUPABASE_PUBLISHABLE_KEY?: string;
    MOBILIZA_SUPABASE_OWNER_ID?: string;
    MOBILIZA_SUPABASE_MEMBERS?: string;
    MOBILIZA_SUPABASE_SECRET_KEY?: string;
  }
}
