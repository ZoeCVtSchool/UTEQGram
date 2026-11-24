
const SUPABASE_URL = 'https://xqpzzxbwdcrrgmbvnpvz.supabase.co';
const SUPABASE_KEY = 'sb_publishable_qsGWltUuPI1-LE6s1Li1jg_TJJIOHaW';

const supabaseClient = window.supabase.createClient(
  SUPABASE_URL,
  SUPABASE_KEY
);

console.log('[PWA] Supabase conectado.');
