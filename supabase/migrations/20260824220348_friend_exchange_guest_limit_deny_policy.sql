create policy guest_auth_limits_deny_clients
on friend_exchange.guest_auth_limits
for all
to anon, authenticated
using (false)
with check (false);
