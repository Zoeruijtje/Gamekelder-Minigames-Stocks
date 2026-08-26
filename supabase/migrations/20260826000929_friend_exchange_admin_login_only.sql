-- Remove the public first-owner setup surface. Administrator accounts are
-- provisioned privately and authenticate through the normal email/password flow.

drop function if exists friend_exchange.admin_bootstrap_owner(uuid, text);
drop table if exists friend_exchange.admin_bootstrap_state;

-- No anonymous or authenticated routine may create administrators.
revoke all on friend_exchange.app_admins from public, anon, authenticated;
grant all privileges on friend_exchange.app_admins to service_role;

notify pgrst, 'reload schema';
