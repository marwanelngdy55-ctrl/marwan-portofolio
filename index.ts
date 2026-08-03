// ==========================================================================
// Edge Function: invite-admin
// بتستخدم الـ Service Role Key (سري، متخزن كـ secret في Supabase، مش في الكود)
// عشان المالك (owner) يضيف عضو جديد للوحة التحكم مباشرة بإيميل وكلمة مرور
// (الحساب بيتفعّل فورًا، من غير ما ننتظر إيميل دعوة).
// لو اتبعت من غير password، بترجع لسلوكها القديم وتبعت دعوة بالإيميل.
// ==========================================================================
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization') ?? '';

    // عميل بصلاحية المستخدم اللي بعت الطلب — نستخدمه للتأكد إنه عضو مسجل دخول فعلاً
    const supabaseAuthClient = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_ANON_KEY')!,
      { global: { headers: { Authorization: authHeader } } }
    );
    const { data: { user }, error: userError } = await supabaseAuthClient.auth.getUser();
    if (userError || !user) {
      return new Response(JSON.stringify({ error: 'غير مصرح لك. سجّل الدخول أولاً.' }), {
        status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const { email, full_name, password } = await req.json();
    if (!email) {
      return new Response(JSON.stringify({ error: 'الإيميل مطلوب.' }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // عميل بصلاحية كاملة (service role) — بيستخدم بس هنا جوه الفنكشن، مش في المتصفح
    const supabaseAdmin = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    let data, error;
    if (password) {
      // إضافة مباشرة: بيتعمل الحساب فورًا بكلمة المرور دي، ويقدر يدخل على طول
      ({ data, error } = await supabaseAdmin.auth.admin.createUser({
        email,
        password,
        email_confirm: true,
        user_metadata: { full_name: full_name || email },
      }));
    } else {
      // السلوك القديم: بعت دعوة بالإيميل يعمل بيها كلمة مرور بنفسه
      ({ data, error } = await supabaseAdmin.auth.admin.inviteUserByEmail(email, {
        data: { full_name: full_name || email },
      }));
    }

    if (error) {
      return new Response(JSON.stringify({ error: error.message }), {
        status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    return new Response(JSON.stringify({ success: true, user: data.user }), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
