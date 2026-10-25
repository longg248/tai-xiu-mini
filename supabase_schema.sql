-- =====================================================================
-- SCHEMA DATABASE SUPABASE CHO TÀI XỈU MINI
-- Copy toàn bộ nội dung file này dán vào SQL Editor trên Supabase rồi nhấn "Run"
-- =====================================================================

-- 1. Bảng tài khoản người chơi & số dư (users)
create table if not exists users (
  id text primary key,
  email text unique not null,
  name text not null,
  pass_hash text not null,
  balance bigint default 3960000,
  wagered bigint default 0,
  rounds integer default 0,
  is_guest boolean default false,
  created_at timestamptz default now()
);

-- 2. Bảng phiên đăng nhập (sessions)
create table if not exists sessions (
  token text primary key,
  user_id text references users(id) on delete cascade,
  created_at timestamptz default now()
);

-- 3. Bảng lịch sử ván cược (round_history)
create table if not exists round_history (
  round_id bigint primary key,
  dice jsonb not null,
  sum integer not null,
  result char(1) not null,
  server_seed text not null,
  server_seed_hash text not null,
  hmac text not null,
  created_at timestamptz default now()
);

-- 4. Bảng đồng bộ tiến trình (game_saves)
create table if not exists game_saves (
  user_id text primary key,
  data jsonb not null,
  updated_at timestamptz default now()
);

-- Bật Row Level Security (RLS) cho game_saves
alter table game_saves enable row level security;
drop policy if exists "Allow read and write on game_saves" on game_saves;
create policy "Allow read and write on game_saves"
  on game_saves for all
  using (true)
  with check (true);
