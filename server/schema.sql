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

-- ---- Social (friends, posts, groups) ----

-- Two-way friendships: a row per accepted pair keeps queries simple.
create table if not exists friendships (
  user_a bigint not null references users(id) on delete cascade,
  user_b bigint not null references users(id) on delete cascade,
  created_at bigint not null,
  primary key (user_a, user_b),
  check (user_a < user_b)
);

-- Friend requests pending acceptance.
create table if not exists friend_requests (
  id bigserial primary key,
  requester_id bigint not null references users(id) on delete cascade,
  addressee_id bigint not null references users(id) on delete cascade,
  created_at bigint not null
);
create unique index if not exists friend_requests_pair_uniq on friend_requests (requester_id, addressee_id);

create table if not exists posts (
  id text primary key,
  user_id bigint not null references users(id) on delete cascade,
  recipe_id text,
  recipe_json text not null default '',
  title text not null default '',
  description text not null default '',
  image text not null default '',
  created_at bigint not null
);
create index if not exists posts_user_created_idx on posts (user_id, created_at desc);
create index if not exists posts_created_idx on posts (created_at desc);

create table if not exists likes (
  post_id text not null references posts(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  created_at bigint not null,
  primary key (post_id, user_id)
);

create table if not exists comments (
  id text primary key,
  post_id text not null references posts(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  text text not null,
  created_at bigint not null
);
create index if not exists comments_post_created_idx on comments (post_id, created_at asc);

create table if not exists groups (
  id text primary key,
  name text not null,
  owner_id bigint not null references users(id) on delete cascade,
  avatar text,
  created_at bigint not null
);

create table if not exists group_members (
  group_id text not null references groups(id) on delete cascade,
  user_id bigint not null references users(id) on delete cascade,
  is_admin integer not null default 0,
  added_by bigint not null references users(id) on delete cascade,
  last_read_at bigint not null default 0,
  created_at bigint not null,
  primary key (group_id, user_id)
);
create index if not exists group_members_user_idx on group_members (user_id);

create table if not exists group_messages (
  id text primary key,
  group_id text not null references groups(id) on delete cascade,
  sender_id bigint not null references users(id) on delete cascade,
  type text not null default 'text',
  text text not null default '',
  image text not null default '',
  recipe_json text not null default '',
  reply_to text,
  edited_at bigint,
  deleted_at bigint,
  created_at bigint not null
);
create index if not exists group_messages_group_created_idx on group_messages (group_id, created_at asc);

-- ---- Migration for older-but-obsolete gaps ----
-- Columns added later to the group tables. Safe to re-run on any database.
alter table groups add column if not exists avatar text;
alter table group_members add column if not exists last_read_at bigint not null default 0;
alter table group_messages add column if not exists reply_to text;
alter table group_messages add column if not exists edited_at bigint;
alter table group_messages add column if not exists deleted_at bigint;