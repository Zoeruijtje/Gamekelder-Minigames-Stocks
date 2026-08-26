import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const read = (relative) => fs.readFileSync(path.join(root, relative), 'utf8');

const expectedMigrations = [
  '20260824203917_friend_exchange_core_schema.sql',
  '20260824204026_friend_exchange_room_functions.sql',
  '20260824204123_friend_exchange_authoritative_market.sql',
  '20260824204209_friend_exchange_rls_snapshot_realtime.sql',
  '20260824204628_friend_exchange_snapshot_hardening_and_finish.sql',
  '20260824214918_friend_exchange_performance_indexes.sql',
  '20260824214933_friend_exchange_guest_rate_limits.sql',
  '20260824215242_friend_exchange_guest_cleanup.sql',
  '20260824220348_friend_exchange_guest_limit_deny_policy.sql',
  '20260824221453_friend_exchange_routine_privilege_hardening.sql',
  '20260824231059_friend_exchange_trading_deadline.sql',
  '20260825210020_public_rls_and_market_history.sql',
  '20260826000815_friend_exchange_admin_control_center.sql',
  '20260826000911_friend_exchange_advanced_portfolio_controls.sql',
  '20260826000929_friend_exchange_admin_login_only.sql',
  '20260826002931_friend_exchange_admin_deny_policies.sql',
  '20260826003403_friend_exchange_admin_risk_indexes.sql',
];

test('the complete deployed Supabase migration ledger is versioned', () => {
  const directory = path.join(root, 'supabase', 'migrations');
  const migrations = fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
  assert.deepEqual(migrations, expectedMigrations);
});

test('browser configuration contains only a publishable Supabase key', () => {
  const config = read('supabase-config.js');
  const executableConfig = config.replace(/^\s*\/\/.*$/gm, '');
  assert.match(executableConfig, /knndezzbjzcykysasfnw\.supabase\.co/);
  assert.match(executableConfig, /sb_publishable_/);
  assert.doesNotMatch(executableConfig, /sb_secret_/);
  assert.doesNotMatch(executableConfig, /service[_-]?role/i);
  assert.doesNotMatch(executableConfig, /database password/i);
});

test('guest identities are rate limited and authoritative settlement is server-side', () => {
  const guest = read('supabase/functions/guest-auth-v2/index.ts');
  const settlement = read('supabase/functions/settle-round/index.ts');
  const authoritativeSql = read('supabase/migrations/20260824204123_friend_exchange_authoritative_market.sql');

  assert.match(guest, /consume_guest_auth_attempt/);
  assert.match(guest, /p_limit:\s*20/);
  assert.match(settlement, /Host permission required/);
  assert.match(settlement, /apply_round_settlement/);
  assert.match(authoritativeSql, /previous_price = asset\.price/);
  assert.match(authoritativeSql, /old_price, new_price/);
  assert.match(authoritativeSql, /Market move exceeds circuit breaker/);
});

test('the Friend Market trading deadline is enforced by Postgres, not only by the browser', () => {
  const deadlineSql = read('supabase/migrations/20260824231059_friend_exchange_trading_deadline.sql');
  assert.match(deadlineSql, /locks_at\s+is\s+null\s+or\s+trading_round\.locks_at\s*<=\s*now\(\)/i);
  assert.match(deadlineSql, /Friend Market trading deadline has passed/);
  assert.match(deadlineSql, /create or replace function friend_exchange\.expire_trading_window/i);
  assert.match(deadlineSql, /if now\(\) < round_row\.locks_at then/i);
  assert.match(deadlineSql, /set status = 'locked'/i);
});


test('advanced portfolio protection is server-authoritative and owner-scoped', () => {
  const sql = read('supabase/migrations/20260826000911_friend_exchange_advanced_portfolio_controls.sql');
  assert.match(sql, /create table friend_exchange\.protective_orders/i);
  assert.match(sql, /enable row level security/i);
  assert.match(sql, /owner_id = \(select auth\.uid\(\)\)/i);
  assert.match(sql, /process_protective_orders/i);
  assert.match(sql, /apply_round_settlement_legacy_20260826_risk/i);
  assert.match(sql, /Friend Market protection can only be changed while trading is open/i);
  assert.match(sql, /protective_order_id/i);
});

test('the public first-owner bootstrap surface is removed', () => {
  const sql = read('supabase/migrations/20260826000929_friend_exchange_admin_login_only.sql');
  const template = read('src/ui/templates-admin.js');
  const adapter = read('src/services/admin-adapter.js');
  assert.match(sql, /drop function if exists friend_exchange\.admin_bootstrap_owner/i);
  assert.match(sql, /drop table if exists friend_exchange\.admin_bootstrap_state/i);
  assert.doesNotMatch(template, /INITIAL ADMIN SETUP|admin-bootstrap/);
  assert.doesNotMatch(adapter, /bootstrapOwner|admin-bootstrap/);
  const provision = read('supabase/functions/admin-login-provision/index.ts');
  assert.match(provision, /OWNER_PASSWORD_HASH/);
  assert.doesNotMatch(provision, /TempPass123/);
  assert.match(template, /admin-change-password|REPLACE THE TEMPORARY PASSWORD/);
});


test('public schema hardening and genuine portfolio history are versioned', () => {
  const sql = read('supabase/migrations/20260825210020_public_rls_and_market_history.sql');
  assert.match(sql, /alter table %s enable row level security/i);
  assert.match(sql, /force row level security/i);
  assert.match(sql, /create table friend_exchange\.portfolio_equity_events/i);
  assert.match(sql, /portfolio_equity_events_read_own/i);
  assert.match(sql, /capture_friend_trade_equity/i);
  assert.match(sql, /capture_friend_settlement_equity/i);
});

test('private admin tables have explicit deny policies', () => {
  const sql = read('supabase/migrations/20260826002931_friend_exchange_admin_deny_policies.sql');
  assert.match(sql, /app_admins_deny_browser/);
  assert.match(sql, /for all to anon, authenticated using \(false\)/i);
});
