revoke usage on schema friend_exchange from anon;
grant usage on schema friend_exchange to authenticated, service_role;

revoke all on function friend_exchange.random_room_code() from public, anon, authenticated;
revoke all on function friend_exchange.room_for_session(uuid) from public, anon;
revoke all on function friend_exchange.room_for_round(uuid) from public, anon;
revoke all on function friend_exchange.is_room_member(uuid, uuid) from public, anon;
revoke all on function friend_exchange.is_room_host(uuid, uuid) from public, anon;
revoke all on function friend_exchange.ensure_profile(text) from public, anon;
revoke all on function friend_exchange.create_room(text, jsonb) from public, anon;
revoke all on function friend_exchange.join_room(text) from public, anon;
revoke all on function friend_exchange.set_room_ready(uuid, boolean) from public, anon;
revoke all on function friend_exchange.heartbeat_room(uuid) from public, anon;
revoke all on function friend_exchange.start_online_session(uuid, jsonb, jsonb) from public, anon;
revoke all on function friend_exchange.create_online_round(uuid, integer, text, text, text, jsonb, integer) from public, anon;
revoke all on function friend_exchange.transition_online_round(uuid, bigint, friend_exchange.round_status, integer) from public, anon;
revoke all on function friend_exchange.submit_round_input(uuid, jsonb, text) from public, anon;
revoke all on function friend_exchange.execute_paper_order(uuid, text, friend_exchange.order_side, numeric, numeric, text) from public, anon;
revoke all on function friend_exchange.complete_round(uuid) from public, anon;
revoke all on function friend_exchange.finish_online_session(uuid) from public, anon;
revoke all on function friend_exchange.room_snapshot(uuid) from public, anon;
revoke all on function friend_exchange.broadcast_room_change() from public, anon, authenticated;

grant execute on function friend_exchange.room_for_session(uuid) to authenticated, service_role;
grant execute on function friend_exchange.room_for_round(uuid) to authenticated, service_role;
grant execute on function friend_exchange.is_room_member(uuid, uuid) to authenticated, service_role;
grant execute on function friend_exchange.is_room_host(uuid, uuid) to authenticated, service_role;

grant execute on function friend_exchange.ensure_profile(text) to authenticated;
grant execute on function friend_exchange.create_room(text, jsonb) to authenticated;
grant execute on function friend_exchange.join_room(text) to authenticated;
grant execute on function friend_exchange.set_room_ready(uuid, boolean) to authenticated;
grant execute on function friend_exchange.heartbeat_room(uuid) to authenticated;
grant execute on function friend_exchange.start_online_session(uuid, jsonb, jsonb) to authenticated;
grant execute on function friend_exchange.create_online_round(uuid, integer, text, text, text, jsonb, integer) to authenticated;
grant execute on function friend_exchange.transition_online_round(uuid, bigint, friend_exchange.round_status, integer) to authenticated;
grant execute on function friend_exchange.submit_round_input(uuid, jsonb, text) to authenticated;
grant execute on function friend_exchange.execute_paper_order(uuid, text, friend_exchange.order_side, numeric, numeric, text) to authenticated;
grant execute on function friend_exchange.complete_round(uuid) to authenticated;
grant execute on function friend_exchange.finish_online_session(uuid) to authenticated;
grant execute on function friend_exchange.room_snapshot(uuid) to authenticated;

notify pgrst, 'reload schema';
