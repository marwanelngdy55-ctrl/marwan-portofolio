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
  created_at timestamptz not null default now()
);

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

-- 3) جدول محتوى الموقع (نصوص قابلة للتعديل من اللوحة)
create table if not exists public.site_content (
  key text primary key,
  value text not null default '',
  updated_at timestamptz not null default now()
);

-- ==========================================================================
-- Row Level Security
-- ==========================================================================
alter table public.profiles enable row level security;
alter table public.articles enable row level security;
alter table public.site_content enable row level security;

-- profiles: أي عضو مسجل دخول يقدر يشوف كل الأعضاء (لعرضهم في صفحة الفريق)
drop policy if exists "profiles are viewable by logged-in admins" on public.profiles;
create policy "profiles are viewable by logged-in admins"
  on public.profiles for select
  using (auth.role() = 'authenticated');

-- articles: أي حد (حتى الزوار) يقدر يقرأ المقالات المنشورة فقط
drop policy if exists "published articles are public" on public.articles;
create policy "published articles are public"
  on public.articles for select
  using (status = 'published' or auth.role() = 'authenticated');

-- articles: الأعضاء المسجلين بس يقدروا يضيفوا/يعدلوا/يحذفوا
drop policy if exists "admins can insert articles" on public.articles;
create policy "admins can insert articles"
  on public.articles for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "admins can update articles" on public.articles;
create policy "admins can update articles"
  on public.articles for update
  using (auth.role() = 'authenticated');

drop policy if exists "admins can delete articles" on public.articles;
create policy "admins can delete articles"
  on public.articles for delete
  using (auth.role() = 'authenticated');

-- site_content: أي حد يقرأ (عشان يظهر في الموقع العام)، الأعضاء بس يعدلوا
drop policy if exists "site content is public to read" on public.site_content;
create policy "site content is public to read"
  on public.site_content for select
  using (true);

drop policy if exists "admins can upsert site content" on public.site_content;
create policy "admins can upsert site content"
  on public.site_content for insert
  with check (auth.role() = 'authenticated');

drop policy if exists "admins can update site content" on public.site_content;
create policy "admins can update site content"
  on public.site_content for update
  using (auth.role() = 'authenticated');

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
  with check (bucket_id = 'article-images' and auth.role() = 'authenticated');

drop policy if exists "admins can delete article images" on storage.objects;
create policy "admins can delete article images"
  on storage.objects for delete
  using (bucket_id = 'article-images' and auth.role() = 'authenticated');

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
  with check (bucket_id = 'site-images' and auth.role() = 'authenticated');

drop policy if exists "admins can update site images" on storage.objects;
create policy "admins can update site images"
  on storage.objects for update
  using (bucket_id = 'site-images' and auth.role() = 'authenticated');

drop policy if exists "admins can delete site images" on storage.objects;
create policy "admins can delete site images"
  on storage.objects for delete
  using (bucket_id = 'site-images' and auth.role() = 'authenticated');

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
