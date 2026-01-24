-- AutoWealth Supabase schema

-- Chat storage (used by ai-service)
create table if not exists public.chats (
  id text primary key,
  user_id uuid references auth.users on delete cascade,
  title text,
  system_prompt text,
  model text,
  created_at timestamptz default now(),
  updated_at timestamptz default now()
);

create table if not exists public.chat_messages (
  id text primary key,
  chat_id text references public.chats on delete cascade,
  user_id uuid references auth.users on delete cascade,
  role text not null,
  content text not null,
  metadata jsonb,
  created_at timestamptz default now()
);

create index if not exists chat_messages_chat_id_idx on public.chat_messages (chat_id, created_at);

-- User settings (used by frontend via ai-service)
create table if not exists public.user_settings (
  user_id uuid primary key references auth.users on delete cascade,
  display_name text,
  monthly_budget numeric,
  safe_mode boolean,
  auto_budget boolean,
  ui_scale numeric,
  updated_at timestamptz default now()
);

-- Policy storage (used by backend)
create table if not exists public.policies (
  id text primary key,
  user_id uuid references auth.users on delete cascade,
  name text not null,
  description text,
  enabled boolean default true,
  rules jsonb not null,
  created_at timestamptz,
  updated_at timestamptz
);

create index if not exists policies_user_id_idx on public.policies (user_id);

-- Treasury transactions (used by backend)
create table if not exists public.transactions (
  id text primary key,
  user_id uuid references auth.users on delete cascade,
  tx_hash text,
  from_address text,
  to_address text,
  amount text,
  currency text,
  status text,
  category text,
  description text,
  policy jsonb,
  created_at timestamptz,
  confirmed_at timestamptz
);

create index if not exists transactions_user_id_idx on public.transactions (user_id, created_at desc);

-- Safety toggles per user (used by backend)
create table if not exists public.safety_state (
  user_id uuid primary key references auth.users on delete cascade,
  safe_mode boolean default false,
  approved_once boolean default false,
  auto_budget boolean default false,
  updated_at timestamptz default now()
);

-- Global app state (used by backend)
create table if not exists public.app_state (
  id text primary key,
  payments_paused boolean default false,
  updated_at timestamptz default now()
);

