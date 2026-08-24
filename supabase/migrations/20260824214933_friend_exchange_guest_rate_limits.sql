create table if not exists friend_exchange.guest_auth_limits (
  fingerprint text primary key,
  window_started_at timestamptz not null default now(),
  attempts integer not null default 0 check (attempts >= 0),
  updated_at timestamptz not null default now()
);

alter table friend_exchange.guest_auth_limits enable row level security;

create or replace function friend_exchange.consume_guest_auth_attempt(
  p_fingerprint text,
  p_limit integer default 20,
  p_window interval default interval '1 hour'
)
returns boolean
language plpgsql
security definer
set search_path = friend_exchange, pg_catalog
as $$
declare
  row_data friend_exchange.guest_auth_limits;
begin
  if nullif(trim(p_fingerprint), '') is null then return false; end if;

  insert into friend_exchange.guest_auth_limits (fingerprint, attempts)
  values (p_fingerprint, 1)
  on conflict (fingerprint) do update
  set attempts = case
        when friend_exchange.guest_auth_limits.window_started_at < now() - p_window then 1
        else friend_exchange.guest_auth_limits.attempts + 1
      end,
      window_started_at = case
        when friend_exchange.guest_auth_limits.window_started_at < now() - p_window then now()
        else friend_exchange.guest_auth_limits.window_started_at
      end,
      updated_at = now()
  returning * into row_data;

  return row_data.attempts <= p_limit;
end;
$$;

revoke all on friend_exchange.guest_auth_limits from anon, authenticated;
revoke all on function friend_exchange.consume_guest_auth_attempt(text, integer, interval)
from public, anon, authenticated;
grant all privileges on friend_exchange.guest_auth_limits to service_role;
grant execute on function friend_exchange.consume_guest_auth_attempt(text, integer, interval)
to service_role;
