-- ==========================================================================
-- MARWAN EL-NGDY PORTFOLIO — لوحة التحكم
-- شغّل الكود ده كله مرة واحدة في Supabase: Project → SQL Editor → New query
-- ==========================================================================

-- 1) جدول أعضاء لوحة التحكم (يرتبط بمستخدمي Supabase Auth)
create table if not exists public.profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text not null,
  full_name text,
  role text not null default 'editor' check (role in ('owner','editor')),
  is_active boolean not null default true,
  created_at timestamptz not null default now()
);

-- لو الجدول كان موجود من قبل، ضيف عمود "نشط/موقوف" (المدير يقدر يوقف عضو من غير ما يحذفه)
alter table public.profiles add column if not exists is_active boolean not null default true;

-- كل ما حد يعمل تسجيل (عن طريق دعوة)، يتضاف تلقائيًا هنا كـ editor
create or replace function public.handle_new_user()
returns trigger
language plpgsql
security definer set search_path = public
as $$
begin
  insert into public.profiles (id, email, full_name, role)
  values (new.id, new.email, coalesce(new.raw_user_meta_data->>'full_name', new.email), 'editor')
  on conflict (id) do nothing;
  return new;
end;
$$;

drop trigger if exists on_auth_user_created on auth.users;
create trigger on_auth_user_created
  after insert on auth.users
  for each row execute procedure public.handle_new_user();

-- 2) جدول المقالات
create table if not exists public.articles (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  slug text not null unique,
  excerpt text,
  cover_image_url text,
  cover_image_alt text,
  content text not null default '',
  status text not null default 'draft' check (status in ('draft','published')),
  author_id uuid references public.profiles(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  published_at timestamptz
);

-- لو الجدول كان موجود من قبل، ضيف عمود alt text لصورة الغلاف
alter table public.articles add column if not exists cover_image_alt text;

-- عمود Title منفصل لصورة الغلاف (يظهر كـ tooltip عند تمرير الماوس، مختلف عن Alt text)
alter table public.articles add column if not exists cover_image_title text;

-- اسم الكاتب (مخزّن مع المقال وقت الحفظ، عشان الموقع العام يقدر يعرضه من غير ما يحتاج يقرأ جدول profiles)
alter table public.articles add column if not exists author_name text;

-- التحكم فيما يظهر للجمهور: اسم الكاتب وتاريخ النشر، كل مقال على حدة
alter table public.articles add column if not exists show_author boolean not null default true;
alter table public.articles add column if not exists show_date boolean not null default true;

-- عنوان السيو (Meta Title) ووصف السيو (Meta Description): يظهروا في نتائج جوجل بدل
-- عنوان المقال (H1) لو اتكتبوا. لو سايبهم فاضيين، الموقع بيستخدم عنوان المقال والمقتطف تلقائيًا.
alter table public.articles add column if not exists meta_title text;
alter table public.articles add column if not exists meta_description text;

-- الكلمة المفتاحية المستهدفة للمقال (Focus Keyword) — تستخدم في تحليل السيو داخل لوحة التحكم
alter table public.articles add column if not exists focus_keyword text;

-- 3) جدول محتوى الموقع (نصوص قابلة للتعديل من اللوحة)
create table if not exists public.site_content (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

-- ==========================================================================
-- دوال مساعدة للصلاحيات (Roles & Permissions)
-- ==========================================================================
-- is_owner(): هل المستخدم الحالي "مدير" ونشط؟ المدير بس اللي يقدر يضيف/يدير أعضاء
-- ويشوف/يعدّل كل المقالات (مش بس مقالاته)
create or replace function public.is_owner()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and role = 'owner' and is_active = true
  );
$$;

-- is_active_member(): هل المستخدم الحالي عضو مفعّل (مش موقوف)؟
create or replace function public.is_active_member()
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.profiles
    where id = auth.uid() and is_active = true
  );
$$;

-- تمنع إزالة صلاحية "مدير" من آخر مدير نشط في النظام (عشان محد يقفل نفسه برة بالغلط)
create or replace function public.prevent_last_owner_change()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  if old.role = 'owner' and (new.role <> 'owner' or new.is_active = false) then
    if (select count(*) from public.profiles where role = 'owner' and is_active = true and id <> old.id) = 0 then
      raise exception 'مينفعش تشيل صلاحية آخر مدير نشط في النظام';
    end if;
  end if;
  return new;
end;
$$;

drop trigger if exists profiles_prevent_last_owner on public.profiles;
create trigger profiles_prevent_last_owner
  before update on public.profiles
  for each row execute procedure public.prevent_last_owner_change();

-- ==========================================================================
-- Row Level Security
-- ==========================================================================
alter table public.profiles enable row level security;
alter table public.articles enable row level security;
alter table public.site_content enable row level security;

-- profiles: كل عضو يشوف بياناته بس، والمدير يشوف كل الأعضاء (لصفحة الفريق)
drop policy if exists "profiles are viewable by logged-in admins" on public.profiles;
drop policy if exists "profiles visible to owner or self" on public.profiles;
create policy "profiles visible to owner or self"
  on public.profiles for select
  using (auth.role() = 'authenticated' and (id = auth.uid() or public.is_owner()));

-- profiles: المدير بس اللي يقدر يعدّل بيانات الأعضاء (الدور، التفعيل/الإيقاف...)
drop policy if exists "owner can update profiles" on public.profiles;
create policy "owner can update profiles"
  on public.profiles for update
  using (public.is_owner())
  with check (public.is_owner());

-- articles: الزوار يشوفوا المقالات المنشورة بس. الأعضاء المسجلين يشوفوا مقالاتهم هم،
-- والمدير يشوف كل المقالات (منشورة أو مسودة، لأي عضو)
drop policy if exists "published articles are public" on public.articles;
drop policy if exists "read articles" on public.articles;
create policy "read articles"
  on public.articles for select
  using (
    status = 'published'
    or (
      auth.role() = 'authenticated' and public.is_active_member()
      and (author_id = auth.uid() or public.is_owner())
    )
  );

-- articles: أي عضو مفعّل يقدر يضيف مقال يكون هو كاتبه، والمدير يقدر يضيف مقال لأي كاتب
drop policy if exists "admins can insert articles" on public.articles;
drop policy if exists "members can insert own articles" on public.articles;
create policy "members can insert own articles"
  on public.articles for insert
  with check (
    auth.role() = 'authenticated' and public.is_active_member()
    and (author_id = auth.uid() or public.is_owner())
  );

-- articles: كل عضو يعدّل مقالاته هو بس، والمدير يقدر يعدّل أي مقال
drop policy if exists "admins can update articles" on public.articles;
drop policy if exists "members can update own articles" on public.articles;
create policy "members can update own articles"
  on public.articles for update
  using (
    auth.role() = 'authenticated' and public.is_active_member()
    and (author_id = auth.uid() or public.is_owner())
  );

-- articles: كل عضو يحذف مقالاته هو بس، والمدير يقدر يحذف أي مقال
drop policy if exists "admins can delete articles" on public.articles;
drop policy if exists "members can delete own articles" on public.articles;
create policy "members can delete own articles"
  on public.articles for delete
  using (
    auth.role() = 'authenticated' and public.is_active_member()
    and (author_id = auth.uid() or public.is_owner())
  );

-- site_content: أي حد يقرأ (عشان يظهر في الموقع العام)، الأعضاء بس يعدلوا
drop policy if exists "site content is public to read" on public.site_content;
create policy "site content is public to read"
  on public.site_content for select
  using (true);

-- ملحوظة أمان مهمة: النسخة القديمة من الـ policies دي كانت بتتحقق بس من auth.role() = 'authenticated'
-- من غير ما تتأكد إن العضو نشط (is_active). ده معناه إن عضو "موقوف" من المدير كان لسه
-- يقدر يعدّل نصوص وصور الموقع العام لو بعت الطلب مباشرة لـ Supabase (حتى لو اللوحة نفسها مخفية عنه).
-- التحديث ده بيضيف شرط is_active_member() عشان العضو الموقوف يتمنع فعليًا من أي تعديل.
drop policy if exists "admins can upsert site content" on public.site_content;
create policy "admins can upsert site content"
  on public.site_content for insert
  with check (auth.role() = 'authenticated' and public.is_active_member());

drop policy if exists "admins can update site content" on public.site_content;
create policy "admins can update site content"
  on public.site_content for update
  using (auth.role() = 'authenticated' and public.is_active_member());

-- ==========================================================================
-- Storage bucket لصور المقالات (غلاف المقال)
-- ==========================================================================
insert into storage.buckets (id, name, public)
values ('article-images', 'article-images', true)
on conflict (id) do nothing;

drop policy if exists "public can view article images" on storage.objects;
create policy "public can view article images"
  on storage.objects for select
  using (bucket_id = 'article-images');

drop policy if exists "admins can upload article images" on storage.objects;
create policy "admins can upload article images"
  on storage.objects for insert
  with check (bucket_id = 'article-images' and auth.role() = 'authenticated' and public.is_active_member());

drop policy if exists "admins can delete article images" on storage.objects;
create policy "admins can delete article images"
  on storage.objects for delete
  using (bucket_id = 'article-images' and auth.role() = 'authenticated' and public.is_active_member());

-- ==========================================================================
-- Storage bucket لصور الموقع العامة (صورة نبذة عني، وأي صور تانية في محتوى الموقع)
-- ==========================================================================
insert into storage.buckets (id, name, public)
values ('site-images', 'site-images', true)
on conflict (id) do nothing;

drop policy if exists "public can view site images" on storage.objects;
create policy "public can view site images"
  on storage.objects for select
  using (bucket_id = 'site-images');

drop policy if exists "admins can upload site images" on storage.objects;
create policy "admins can upload site images"
  on storage.objects for insert
  with check (bucket_id = 'site-images' and auth.role() = 'authenticated' and public.is_active_member());

drop policy if exists "admins can update site images" on storage.objects;
create policy "admins can update site images"
  on storage.objects for update
  using (bucket_id = 'site-images' and auth.role() = 'authenticated' and public.is_active_member());

drop policy if exists "admins can delete site images" on storage.objects;
create policy "admins can delete site images"
  on storage.objects for delete
  using (bucket_id = 'site-images' and auth.role() = 'authenticated' and public.is_active_member());

-- ==========================================================================
-- تحديث updated_at تلقائيًا
-- ==========================================================================
create or replace function public.set_updated_at()
returns trigger language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end;
$$;

drop trigger if exists articles_set_updated_at on public.articles;
create trigger articles_set_updated_at
  before update on public.articles
  for each row execute procedure public.set_updated_at();

drop trigger if exists site_content_set_updated_at on public.site_content;
create trigger site_content_set_updated_at
  before update on public.site_content
  for each row execute procedure public.set_updated_at();
