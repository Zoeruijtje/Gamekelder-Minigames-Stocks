import assert from 'node:assert/strict';

const response = await fetch('https://knndezzbjzcykysasfnw.supabase.co/functions/v1/guest-auth', {
  method: 'POST',
  headers: {
    apikey: 'sb_publishable_g-TmoO3QGY9RcH7maF27Xw_7gwqrnMl',
    'Content-Type': 'application/json',
  },
  body: JSON.stringify({ display_name: 'Retired endpoint check' }),
});

const payload = await response.json();
assert.equal(response.status, 410);
assert.match(payload.error, /retired/i);
console.log('PASS legacy guest-auth endpoint is retired');
