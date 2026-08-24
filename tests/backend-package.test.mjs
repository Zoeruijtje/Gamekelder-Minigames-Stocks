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
];

test('the complete deployed Supabase migration ledger is versioned', () => {
  const directory = path.join(root, 'supabase', 'migrations');
  const migrations = fs.readdirSync(directory).filter((name) => name.endsWith('.sql')).sort();
  assert.deepEqual(migrations, expectedMigrations);
});

test('browser configuration contains only a publishable Supabase key', () => {
  const config = read('supabase-config.js');
  assert.match(config, /knndezzbjzcykysasfnw\.supabase\.co/);
  assert.match(config, /sb_publishable_/);
  assert.doesNotMatch(config, /sb_secret_/);
  assert.doesNotMatch(config, /service[_-]?role/i);
  assert.doesNotMatch(config, /database password/i);
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
