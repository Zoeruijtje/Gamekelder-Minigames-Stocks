create index if not exists friend_exchange_audit_actor_idx
  on friend_exchange.audit_events(actor_id);
create index if not exists friend_exchange_assets_owner_idx
  on friend_exchange.friend_assets(owner_id);
create index if not exists friend_exchange_events_owner_idx
  on friend_exchange.friend_price_events(owner_id);
create index if not exists friend_exchange_news_round_idx
  on friend_exchange.news_events(round_id);
create index if not exists friend_exchange_news_session_idx
  on friend_exchange.news_events(session_id);
create index if not exists friend_exchange_trades_portfolio_idx
  on friend_exchange.paper_trades(portfolio_id, created_at desc);
create index if not exists friend_exchange_rooms_current_round_idx
  on friend_exchange.rooms(current_round_id);
create index if not exists friend_exchange_rooms_current_session_idx
  on friend_exchange.rooms(current_session_id);
create index if not exists friend_exchange_rooms_host_idx
  on friend_exchange.rooms(host_id);
