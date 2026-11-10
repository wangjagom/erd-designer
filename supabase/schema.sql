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

-- =====================================================================
-- 자동 저장 · 버전 기록 · 사용자 설정  (2026-11 추가, 위와 함께 다시 실행해도 안전해요)
-- =====================================================================

-- 저장 종류: 앱이 저장할 때마다 함께 보내요. manual = 직접 저장, auto = 자동 저장, restore = 버전 되돌리기
alter table public.erds add column if not exists save_kind text not null default 'manual';
alter table public.erds drop constraint if exists erds_save_kind_check;
alter table public.erds add constraint erds_save_kind_check check (save_kind in ('manual', 'auto', 'restore'));

-- 버전 기록: 앱이 아니라 DB 트리거가 남겨서 빠지지 않아요. 앱에서는 읽기·지우기만 할 수 있어요.
create table if not exists public.erd_versions (
  id          bigint generated always as identity primary key,
  erd_id      uuid not null references public.erds (id) on delete cascade,
  owner_id    uuid not null references auth.users (id) on delete cascade,
  kind        text not null check (kind in ('manual', 'auto', 'restore', 'before_restore')),
  title       text not null,
  data        jsonb not null,
  data_hash   text not null,
  created_at  timestamptz not null default now()
);
create index if not exists erd_versions_erd_created_idx on public.erd_versions (erd_id, created_at desc);

alter table public.erd_versions enable row level security;
drop policy if exists "erd_versions_select_own" on public.erd_versions;
drop policy if exists "erd_versions_delete_own" on public.erd_versions;
create policy "erd_versions_select_own" on public.erd_versions for select to authenticated
  using (owner_id = (select auth.uid()));
create policy "erd_versions_delete_own" on public.erd_versions for delete to authenticated
  using (owner_id = (select auth.uid()));

-- 기록 규칙
--  * 직접 저장(manual)·되돌리기(restore): 항상 남겨요.
--  * 자동 저장(auto): 마지막 기록보다 10분 넘게 지났을 때만 남겨요. (몇 초마다 쌓이지 않아요)
--  * 바로 전 기록과 내용이 같으면 건너뛰어요. 이름·공유 설정만 바뀐 저장은 트리거가 돌지 않아요.
--  * 되돌리기 직전 상태는 'before_restore'로 따로 남겨서, 잘못 되돌려도 다시 돌아갈 수 있어요.
--  * ERD마다 최근 50개만 남기고 오래된 기록은 지워요.
create or replace function public.erds_snapshot() returns trigger
language plpgsql security definer set search_path = '' as $$
declare
  v_hash      text := md5(new.data::text);
  v_last_hash text;
  v_last_at   timestamptz;
begin
  -- 내용이 그대로인 자동 저장은 건너뛰어요. 직접 저장은 자동 저장이 이미 올린 내용이라도 기록으로 남길 수 있어요.
  if tg_op = 'UPDATE' and new.data is not distinct from old.data and new.save_kind <> 'manual' then
    return null;
  end if;

  select v.data_hash, v.created_at into v_last_hash, v_last_at
  from public.erd_versions v where v.erd_id = new.id
  order by v.created_at desc, v.id desc limit 1;

  if tg_op = 'UPDATE' and new.save_kind = 'restore' and md5(old.data::text) is distinct from v_last_hash then
    insert into public.erd_versions (erd_id, owner_id, kind, title, data, data_hash)
    values (new.id, new.owner_id, 'before_restore', old.title, old.data, md5(old.data::text));
    v_last_hash := md5(old.data::text); v_last_at := now();
  end if;

  if v_hash is not distinct from v_last_hash then
    return null;
  end if;
  if new.save_kind = 'auto' and v_last_at is not null and v_last_at > now() - interval '10 minutes' then
    return null;
  end if;

  insert into public.erd_versions (erd_id, owner_id, kind, title, data, data_hash)
  values (new.id, new.owner_id, new.save_kind, new.title, new.data, v_hash);

  delete from public.erd_versions v
  where v.erd_id = new.id
    and v.id not in (select k.id from public.erd_versions k where k.erd_id = new.id order by k.created_at desc, k.id desc limit 50);
  return null;
end $$;

revoke all on function public.erds_snapshot() from public, anon, authenticated;

drop trigger if exists erds_snapshot on public.erds;
create trigger erds_snapshot after insert or update of data on public.erds
  for each row execute function public.erds_snapshot();

-- 사용자 설정: 자동 저장 켜기/끄기, 선 모양 등. 계정마다 한 줄이라 어느 기기에서 로그인해도 같아요.
create table if not exists public.user_settings (
  user_id     uuid primary key default auth.uid() references auth.users (id) on delete cascade,
  prefs       jsonb not null default '{}'::jsonb,
  updated_at  timestamptz not null default now()
);

alter table public.user_settings enable row level security;
drop policy if exists "user_settings_select_own" on public.user_settings;
drop policy if exists "user_settings_insert_own" on public.user_settings;
drop policy if exists "user_settings_update_own" on public.user_settings;
create policy "user_settings_select_own" on public.user_settings for select to authenticated
  using (user_id = (select auth.uid()));
create policy "user_settings_insert_own" on public.user_settings for insert to authenticated
  with check (user_id = (select auth.uid()));
create policy "user_settings_update_own" on public.user_settings for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

drop trigger if exists user_settings_touch on public.user_settings;
create trigger user_settings_touch before update on public.user_settings
  for each row execute function public.erds_touch();
