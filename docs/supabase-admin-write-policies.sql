-- Let signed-in blog admins write from the admin panel with their own login.
--
-- Why: admin.js signs in with Supabase Auth, but the tables below have no policy
-- that allows the "authenticated" role to write. Saving only worked when someone
-- pasted the service_role key into Settings -> Database Write Key, otherwise it
-- failed with: new row violates row-level security policy for table "blogs".
-- The service_role key bypasses every policy and must not live in a browser.
--
-- Run once in Supabase -> SQL Editor. Safe to re-run. It only ADDS permissive
-- policies, so the existing public read policies keep working unchanged.
--
-- BEFORE RUNNING: put every admin login email in the list below.
-- AFTER RUNNING:  Authentication -> Providers -> Email -> turn OFF "Allow new users to
--                 sign up", so nobody can create a login that the email check trusts.

create or replace function public.is_blog_admin()
returns boolean
language sql
stable
as $$
  select lower(coalesce(auth.jwt() ->> 'email', '')) in (
    'admin@airmedical24x7.com',
    'nitin@airmedical24x7.com'
  );
$$;

-- blogs: admins can read drafts too (the insert's RETURNING needs this) and write.
drop policy if exists "blog admins read all"  on public.blogs;
drop policy if exists "blog admins insert"    on public.blogs;
drop policy if exists "blog admins update"    on public.blogs;
drop policy if exists "blog admins delete"    on public.blogs;
create policy "blog admins read all" on public.blogs for select to authenticated using (public.is_blog_admin());
create policy "blog admins insert"   on public.blogs for insert to authenticated with check (public.is_blog_admin());
create policy "blog admins update"   on public.blogs for update to authenticated using (public.is_blog_admin()) with check (public.is_blog_admin());
create policy "blog admins delete"   on public.blogs for delete to authenticated using (public.is_blog_admin());

-- reviews: same as blogs.
drop policy if exists "blog admins read all" on public.reviews;
drop policy if exists "blog admins insert"   on public.reviews;
drop policy if exists "blog admins update"   on public.reviews;
drop policy if exists "blog admins delete"   on public.reviews;
create policy "blog admins read all" on public.reviews for select to authenticated using (public.is_blog_admin());
create policy "blog admins insert"   on public.reviews for insert to authenticated with check (public.is_blog_admin());
create policy "blog admins update"   on public.reviews for update to authenticated using (public.is_blog_admin()) with check (public.is_blog_admin());
create policy "blog admins delete"   on public.reviews for delete to authenticated using (public.is_blog_admin());

-- comments: the admin panel only deletes (moderation).
drop policy if exists "blog admins delete" on public.comments;
create policy "blog admins delete" on public.comments for delete to authenticated using (public.is_blog_admin());

-- blog_audit_logs: every save writes an audit row.
drop policy if exists "blog admins read"   on public.blog_audit_logs;
drop policy if exists "blog admins insert" on public.blog_audit_logs;
create policy "blog admins read"   on public.blog_audit_logs for select to authenticated using (public.is_blog_admin());
create policy "blog admins insert" on public.blog_audit_logs for insert to authenticated with check (public.is_blog_admin());

-- Check: list the policies now on these tables.
select tablename, policyname, cmd, roles
from pg_policies
where schemaname = 'public' and tablename in ('blogs', 'reviews', 'comments', 'blog_audit_logs')
order by tablename, cmd;
