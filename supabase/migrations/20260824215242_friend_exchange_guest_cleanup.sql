create or replace function friend_exchange.delete_own_guest_account()
returns void
language plpgsql
security definer
set search_path = friend_exchange, auth, pg_catalog
as $$
declare
  metadata jsonb;
begin
  if auth.uid() is null then raise exception 'Authentication required'; end if;

  select raw_user_meta_data into metadata
  from auth.users
  where id = auth.uid()
  for update;

  if metadata is null
     or coalesce(metadata ->> 'app', '') <> 'friend-exchange'
     or coalesce((metadata ->> 'guest')::boolean, false) is not true then
    raise exception 'Only temporary Friend Exchange guest accounts can be removed here';
  end if;

  delete from friend_exchange.rooms where host_id = auth.uid();
  delete from auth.users where id = auth.uid();
end;
$$;

revoke all on function friend_exchange.delete_own_guest_account() from public, anon;
grant execute on function friend_exchange.delete_own_guest_account() to authenticated;
