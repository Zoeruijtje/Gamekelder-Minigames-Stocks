-- Explicit deny policies make the private administration tables fail closed for
-- browser roles while service_role continues to use the server-authorized RPCs.
create policy app_admins_deny_browser on friend_exchange.app_admins
for all to anon, authenticated using (false) with check (false);
create policy app_settings_deny_browser on friend_exchange.app_settings
for all to anon, authenticated using (false) with check (false);
create policy game_definitions_deny_browser on friend_exchange.game_definitions
for all to anon, authenticated using (false) with check (false);
create policy game_content_deny_browser on friend_exchange.game_content
for all to anon, authenticated using (false) with check (false);
