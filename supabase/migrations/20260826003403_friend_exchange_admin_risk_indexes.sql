create index if not exists app_admins_created_by_idx
  on friend_exchange.app_admins(created_by) where created_by is not null;
create index if not exists app_settings_updated_by_idx
  on friend_exchange.app_settings(updated_by) where updated_by is not null;
create index if not exists game_definitions_updated_by_idx
  on friend_exchange.game_definitions(updated_by) where updated_by is not null;
create index if not exists game_content_updated_by_idx
  on friend_exchange.game_content(updated_by) where updated_by is not null;
create index if not exists protective_orders_filled_trade_idx
  on friend_exchange.protective_orders(filled_trade_id) where filled_trade_id is not null;
