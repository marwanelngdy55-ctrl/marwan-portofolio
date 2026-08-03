/* ==========================================================================
   إعدادات الاتصال بـ Supabase — نفس الملف مستخدم في كل الصفحات
   ========================================================================== */
window.SUPABASE_URL = 'https://uvzcolbxpjsufalgmywz.supabase.co';
window.SUPABASE_PUBLISHABLE_KEY = 'sb_publishable_rnGIT6p56s9aRCGA0rHG_g_3KS9GUa6';

window.getSupabaseClient = function () {
  if (!window.__sbClient) {
    window.__sbClient = window.supabase.createClient(
      window.SUPABASE_URL,
      window.SUPABASE_PUBLISHABLE_KEY
    );
  }
  return window.__sbClient;
};
