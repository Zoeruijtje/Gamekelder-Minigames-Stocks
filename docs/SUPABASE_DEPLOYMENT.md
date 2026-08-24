# Supabase deployment

## Safety decision

Do not apply these migrations to the currently connected project named `Zoeruijtje's Project`. That project contains unrelated building-inspection data and an existing `profiles` table.

Use a dedicated new project in the intended organization.

## Required configuration

- Region: recommended `eu-central-1` for the Netherlands.
- Anonymous Auth enabled.
- Optional CAPTCHA/Turnstile before a public launch.
- Private Realtime channels enabled.
- `MARKET_DATA_API_KEY` set only as an Edge Function secret.
- Frontend contains only the project URL and publishable key.

## Apply

```bash
supabase link --project-ref <new-project-ref>
supabase db push
supabase functions deploy market-quotes --verify-jwt
supabase functions deploy settle-round --verify-jwt
```

Set the provider secret:

```bash
supabase secrets set MARKET_DATA_API_KEY=... MARKET_DATA_BASE_URL=https://api.twelvedata.com
```

Then update `supabase-config.js`:

```js
window.__FE_SUPABASE__ = {
  url: "https://<project-ref>.supabase.co",
  publishableKey: "sb_publishable_..."
};
```

Never put `sb_secret_...`, `service_role` or a provider credential in the frontend.

## Database security tests

Before enabling online mode, verify:

1. User A cannot read User B’s portfolio.
2. A member of Room A cannot read Room B.
3. Players cannot update final scores or Friend Market prices.
4. Players cannot read other private submissions before settlement.
5. A duplicate submission nonce is rejected.
6. A duplicate order key returns the existing fill rather than filling twice.
7. Non-hosts cannot call authoritative settlement.
8. Friend orders fail after trading locks.
9. Real orders fail on stale/unavailable quotes.
10. Edge Function secret keys are absent from repository and browser bundles.
