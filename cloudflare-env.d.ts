declare namespace Cloudflare {
  interface Env {
    DB?: D1Database;
    BUCKET?: R2Bucket;
    MOBILIZA_SUPABASE_AUTH?: string;
    MOBILIZA_SUPABASE_URL?: string;
    MOBILIZA_SUPABASE_PUBLISHABLE_KEY?: string;
    MOBILIZA_SUPABASE_OWNER_ID?: string;
    MOBILIZA_SUPABASE_MEMBERS?: string;
    MOBILIZA_SUPABASE_SECRET_KEY?: string;
  }
}
