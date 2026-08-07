-- Foody Postgres schema (Supabase / Neon / Render).
-- Run this once in your database (e.g. the Supabase SQL Editor).

create table if not exists users (
  id bigserial primary key,
  username text not null,
  password_hash text not null,
  salt text not null,
  security_question text not null default '',
  security_answer_hash text not null default '',
  security_answer_salt text not null default '',
  avatar text,
  created_at bigint not null
);

-- Case-insensitive unique usernames (replaces SQLite's COLLATE NOCASE).
create unique index if not exists users_username_lower_uniq on users (lower(username));

create table if not exists sessions (
  token text primary key,
  user_id bigint not null references users(id) on delete cascade,
  created_at bigint not null
);

create table if not exists recipes (
  user_id bigint not null references users(id) on delete cascade,
  id text not null,
  recipe_json text not null,
  saved integer not null default 0,
  created_at bigint not null,
  primary key (user_id, id)
);

create index if not exists recipes_user_created_idx on recipes (user_id, created_at desc);

create table if not exists preferences (
  user_id bigint primary key references users(id) on delete cascade,
  likes_json text not null default '[]',
  dislikes_json text not null default '[]',
  last_speech text not null default ''
);

create table if not exists fridge (
  user_id bigint primary key references users(id) on delete cascade,
  items_json text not null default '[]',
  use_fridge integer not null default 0,
  updated_at bigint not null
);

-- Uploaded images (avatars + recipe photos) stored as blobs so nothing lives on disk.
create table if not exists uploads (
  id text primary key,
  user_id bigint not null references users(id) on delete cascade,
  mime text not null,
  bytes bytea not null,
  created_at bigint not null
);

create index if not exists uploads_user_idx on uploads (user_id);