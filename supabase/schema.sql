-- ERD 설계 도구: Supabase 스키마
-- Supabase 대시보드 → SQL Editor 에 붙여넣고 Run 하세요. (여러 번 실행해도 안전해요)

create table if not exists public.erds (
  id          uuid primary key default gen_random_uuid(),
  owner_id    uuid not null default auth.uid() references auth.users (id) on delete cascade,
  title       text not null default '제목 없는 ERD' check (char_length(title) between 1 and 200),
  data        jsonb not null,
  is_public   boolean not null default false,
  share_id    uuid not null unique default gen_random_uuid(),
  created_at  timestamptz not null default now(),
  updated_at  timestamptz not null default now()
);

create index if not exists erds_owner_updated_idx on public.erds (owner_id, updated_at desc);

-- updated_at 자동 갱신
create or replace function public.erds_touch() returns trigger
language plpgsql set search_path = '' as $$
begin
  new.updated_at := now();
  return new;
end $$;

drop trigger if exists erds_touch on public.erds;
create trigger erds_touch before update on public.erds
  for each row execute function public.erds_touch();

-- 행 수준 보안: 로그인한 본인 ERD만 읽고 쓸 수 있어요.
alter table public.erds enable row level security;

drop policy if exists "erds_select_own" on public.erds;
drop policy if exists "erds_insert_own" on public.erds;
drop policy if exists "erds_update_own" on public.erds;
drop policy if exists "erds_delete_own" on public.erds;

create policy "erds_select_own" on public.erds for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "erds_insert_own" on public.erds for insert to authenticated
  with check (owner_id = (select auth.uid()));
create policy "erds_update_own" on public.erds for update to authenticated
  using (owner_id = (select auth.uid())) with check (owner_id = (select auth.uid()));
create policy "erds_delete_own" on public.erds for delete to authenticated
  using (owner_id = (select auth.uid()));

-- 공유 링크: share_id 를 아는 사람만, 공개로 켠 ERD 한 개를 읽기 전용으로 받아요.
-- (공개 ERD 목록을 훑어볼 수는 없어요)
create or replace function public.get_shared_erd(p_share_id uuid)
returns table (title text, data jsonb, updated_at timestamptz)
language sql stable security definer set search_path = '' as $$
  select e.title, e.data, e.updated_at
  from public.erds e
  where e.share_id = p_share_id and e.is_public;
$$;

revoke all on function public.get_shared_erd(uuid) from public;
grant execute on function public.get_shared_erd(uuid) to anon, authenticated;
