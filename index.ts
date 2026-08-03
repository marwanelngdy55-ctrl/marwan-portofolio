// supabase/functions/invite-admin/index.ts
// ==========================================================================
// إضافة عضو جديد للفريق — بصلاحية Service Role (سري، ميتحطش في كود الموقع)
//
// محمية بحيث المدير (owner) بس اللي يقدر ينفذها وينشئ أعضاء جدد، وهو اللي
// بيحدد دور العضو الجديد (مدير owner / عضو editor). أي طلب من عضو مش مدير
// أو موقوف بيترفض فورًا برسالة 403.
// ==========================================================================

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req: Request) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: corsHeaders });

  try {
    const authHeader = req.headers.get('Authorization') || '';
    const jwt = authHeader.replace('Bearer ', '').trim();
    if (!jwt) {
      return json({ error: 'غير مصرح — سجّل الدخول وحاول تاني.' }, 401);
    }

    // عميل بصلاحية المستخدم اللي بيطلب، عشان نتأكد مين هو فعليًا
    const callerClient = createClient(SUPABASE_URL, SUPABASE_ANON_KEY, {
      global: { headers: { Authorization: authHeader } },
    });
    const { data: callerData, error: callerErr } = await callerClient.auth.getUser(jwt);
    const caller = callerData?.user;
    if (callerErr || !caller) {
      return json({ error: 'تعذر التحقق من هويتك. سجّل الدخول تاني.' }, 401);
    }

    // عميل بصلاحية Service Role — للتحقق من دور الطالب ولعمل الإضافة الفعلية
    const adminClient = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const { data: callerProfile, error: profileErr } = await adminClient
      .from('profiles')
      .select('role, is_active')
      .eq('id', caller.id)
      .single();

    if (profileErr || !callerProfile || callerProfile.role !== 'owner' || !callerProfile.is_active) {
      return json({ error: 'إضافة الأعضاء وتحديد صلاحياتهم للمدير فقط.' }, 403);
    }

    const body = await req.json().catch(() => ({}));
    const email = String(body.email || '').trim().toLowerCase();
    const password = String(body.password || '');
    const full_name = String(body.full_name || '').trim();
    // أي قيمة غير "owner" بترجع "editor" أمان إضافي — منع تصعيد صلاحيات غير مقصود
    const role = body.role === 'owner' ? 'owner' : 'editor';

    if (!email || !password || password.length < 6) {
      return json({ error: 'الإيميل وكلمة المرور (6 حروف/أرقام على الأقل) مطلوبين.' }, 400);
    }

    const { data: created, error: createErr } = await adminClient.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { full_name: full_name || email },
    });

    if (createErr || !created?.user) {
      return json({ error: createErr?.message || 'تعذر إنشاء الحساب.' }, 400);
    }

    // التريجر handle_new_user في قاعدة البيانات بيضيف صف في profiles تلقائيًا كـ "editor" نشط
    // دلوقتي نحدّث الدور والاسم حسب ما اختاره المدير وقت الإضافة
    const { error: updateErr } = await adminClient
      .from('profiles')
      .update({ role, full_name: full_name || email, is_active: true })
      .eq('id', created.user.id);

    if (updateErr) {
      return json(
        { error: 'اتعمل الحساب، لكن حصل خطأ وقت تحديد الدور: ' + updateErr.message },
        200
      );
    }

    return json({ success: true, user_id: created.user.id });
  } catch (e) {
    return json({ error: e instanceof Error ? e.message : 'حصل خطأ غير متوقع.' }, 500);
  }
});
