# Roadmap after this MVP

## 1. Dedicated Supabase project

Provision the backend, apply migrations, deploy functions and connect the public runtime configuration.

## 2. Online lobby UX

Wire the existing `OnlineGameAdapter` into the landing and lobby screens:

- anonymous identity;
- create/join code;
- QR code;
- ready state;
- host/cohost transfer;
- presence/reconnect banners.

## 3. Authoritative online round conductor

Move shared phase transitions to server timestamps and host-authorized functions. Persist every round so a reconnecting phone can resume from a complete snapshot.

## 4. Market-data provider

Compare provider display/licensing terms, add a production symbol allowlist and verify quote freshness/market-hours behavior.

## 5. Expanded playtesting

Run repeated 4–8 player sessions to tune:

- expectation model;
- rating K-factor;
- standard/chaos volatility;
- trading duration;
- game instructions and timing;
- session length;
- own-stock restrictions.

## 6. Release polish

- audio and haptics;
- tutorial;
- PWA offline cache;
- shareable result cards;
- season history;
- friend groups;
- moderation controls;
- accessibility review;
- load tests and observability.
