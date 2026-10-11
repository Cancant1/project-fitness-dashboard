-- Apple Watch import: per-device tokens for the iOS Shortcut that posts to the `health-ingest` Edge Function.
--
-- The app creates the token in the browser and stores only its SHA-256 hash (hex). The Edge Function hashes the
-- `x-ingest-token` header, looks the hash up with the service role and writes `health_daily` for that user.
--
-- Not a synced table (no server_updated_at / soft delete): the settings page reads and writes it directly.
-- "Delete" = revoke (revoked_at); there is no DELETE grant.

create table if not exists public.ingest_tokens (
  id            uuid primary key default gen_random_uuid(),
  user_id       uuid not null references auth.users(id) on delete cascade default auth.uid(),
  token_hash    text not null unique check (token_hash ~ '^[0-9a-f]{64}$'),
  label         text not null default '',
  created_at    timestamptz not null default now(),
  last_used_at  timestamptz,
  revoked_at    timestamptz
);
create index if not exists ingest_tokens_user_idx on public.ingest_tokens (user_id, created_at desc);

alter table public.ingest_tokens enable row level security;

drop policy if exists "own rows: select" on public.ingest_tokens;
drop policy if exists "own rows: insert" on public.ingest_tokens;
drop policy if exists "own rows: update" on public.ingest_tokens;
create policy "own rows: select" on public.ingest_tokens for select to authenticated using (user_id = (select auth.uid()));
create policy "own rows: insert" on public.ingest_tokens for insert to authenticated with check (user_id = (select auth.uid()));
create policy "own rows: update" on public.ingest_tokens for update to authenticated
  using (user_id = (select auth.uid())) with check (user_id = (select auth.uid()));

revoke all on public.ingest_tokens from anon, authenticated;
grant select, insert on public.ingest_tokens to authenticated;
-- The app only renames or revokes; the hash, owner and usage stamp are not editable from the browser.
grant update (label, revoked_at) on public.ingest_tokens to authenticated;
grant all on public.ingest_tokens to service_role;
