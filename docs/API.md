# API Reference

This document summarizes the implemented routes in the current codebase.

## Conventions

- Auth header: `Authorization: Bearer <token>`
- Legacy auth header: `Authorization: <token>`
- Permission labels:
  - `Public`: no auth required
  - `USER`: authenticated player
  - `SERVER`: elevated service user
  - `ADMIN`: full admin

## Public and Ops

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/` | Public | API title, version, environment |
| `GET` | `/health` | Public | Liveness plus gameplay-store, ops-store, Mongo, and transport state |
| `GET` | `/ready` | Public | Returns `503` until gameplay and ops stores are ready |
| `GET` | `/version` | Public | API version only |
| `GET` | `/online` | Public | Online user summary based on recent activity |
| `GET` | `/setup` | Public | Serves the first-run installer UI while datastore or bootstrap-user setup is incomplete; otherwise redirects to `/admin` |
| `GET` | `/admin` | Public | Serves the admin dashboard UI shell when setup is complete; otherwise redirects to `/setup` |
| `GET` | `/admin/players/:userId` | Public | Serves the dedicated player profile UI shell when setup is complete; otherwise redirects to `/setup` |

## Installer

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/setup/api/status` | Public | Installer status, supported drivers, current setup reason, and bootstrap-user state |
| `POST` | `/setup/api/validate` | Public while setup or bootstrap is incomplete | Body: datastore config payload; validates gameplay/ops connections without writing `.env` |
| `POST` | `/setup/api/apply` | Public while setup or bootstrap is incomplete | Body: datastore config, JWT secret, optional admin bootstrap; writes `.env` and activates the full runtime |

## Trades

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/trades` | USER | Lists the caller's trades; admins can pass `?all=true` with proper RBAC |
| `GET` | `/trades/:tradeId` | USER | Reads one trade if involved or authorized as admin |
| `POST` | `/trades` | USER | Create trade with `target_username`, `offer`, `request`, optional `note` |
| `POST` | `/trades/:tradeId/accept` | USER | Accept a pending trade as the recipient |
| `POST` | `/trades/:tradeId/decline` | USER | Decline a pending trade as the recipient |
| `POST` | `/trades/:tradeId/cancel` | USER | Cancel a pending trade as the initiator |

## Auth

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `POST` | `/auth` | Public | Body: `username` or `email`, plus `password` |
| `POST` | `/auth/refresh` | Public | Body: `refresh_token`, auth header required |
| `GET` | `/auth/keep` | USER | Updates last online time |
| `GET` | `/auth/validate` | USER | Validates current token |
| `GET` | `/auth/proof/create` | USER | Creates proof key for external verification |
| `GET` | `/auth/proof/:username/:proof` | USER | Validates a proof key |

## Users

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `POST` | `/users/register` | Public | Body: `username`, `email`, `password`, optional `avatar`. The first registered user becomes `ADMIN` and is auto-validated unless an admin was already created through `/setup`. |
| `GET` | `/users` | USER | Returns user list with fields filtered by caller role |
| `GET` | `/users/:userId` | USER | `:userId` can be user id or username |
| `POST` | `/users/edit/:userId` | Same user or ADMIN | Body: editable profile fields |
| `POST` | `/users/permission/edit/:userId` | ADMIN | Body: `permission_level` |
| `POST` | `/users/email/edit` | USER | Body: `email` |
| `POST` | `/users/password/edit` | USER | Body: `password_previous`, `password_new` |
| `POST` | `/users/password/reset` | Public | Body: `email` |
| `POST` | `/users/password/reset/confirm` | Public | Body: `email`, `code`, `password` |
| `GET` | `/users/email/confirm/:userId/:code` | Public | Browser-friendly email confirmation route |
| `POST` | `/users/email/resend` | USER | Resends confirmation email |
| `POST` | `/users/email/send` | ADMIN | Test email route, body: `title`, `text`, `email` |

## User Inventory and Social

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `POST` | `/users/packs/open/` | USER | Open owned pack(s) |
| `POST` | `/users/packs/buy/` | USER | Buy pack(s) from configured catalog |
| `POST` | `/users/packs/sell/` | USER | Sell owned pack(s) |
| `POST` | `/users/cards/buy/` | USER | Buy single card |
| `POST` | `/users/cards/sell/` | USER | Sell single card |
| `POST` | `/users/cards/sell/duplicate` | USER | Sell duplicate cards |
| `POST` | `/users/cards/variants/fix/` | Same user or SERVER | Repairs stored card variants |
| `POST` | `/users/avatar/buy` | USER | Buy avatar cosmetic |
| `POST` | `/users/cardback/buy` | USER | Buy cardback cosmetic |
| `POST` | `/users/deck/:deckId` | USER | Update owned deck data |
| `DELETE` | `/users/deck/:deckId` | USER | Delete owned deck |
| `POST` | `/users/friends/add/` | USER | Body: `username` |
| `POST` | `/users/friends/remove/` | USER | Body: `username` |
| `GET` | `/users/friends/list/` | USER | List friends |

## User Rewards

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `POST` | `/users/rewards/give/:userId` | SERVER | Body: `reward` object, direct grant; admins require `admin.users.manage` |
| `POST` | `/users/rewards/gain/:userId` | Same user or SERVER | Body: reward id from reward catalog; admins require `admin.users.manage` |

## Cards

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/cards` | Public | List all cards |
| `GET` | `/cards/:tid` | Public | Fetch one card |
| `POST` | `/cards/add` | ADMIN | Upsert one card |
| `POST` | `/cards/add/list` | ADMIN | Bulk upsert cards |
| `DELETE` | `/cards/:tid` | ADMIN | Delete one card |
| `DELETE` | `/cards` | ADMIN | Delete all cards |

## Packs

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/packs` | Public | List all packs |
| `GET` | `/packs/:tid` | Public | Fetch one pack |
| `POST` | `/packs/add` | ADMIN | Upsert pack definition |
| `DELETE` | `/packs/:tid` | ADMIN | Delete one pack |
| `DELETE` | `/packs` | ADMIN | Delete all packs |

## Deck Templates

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/decks` | Public | List all deck templates |
| `GET` | `/decks/:tid` | Public | Fetch one deck template |
| `POST` | `/decks/add` | ADMIN | Upsert deck template |
| `DELETE` | `/decks/:tid` | ADMIN | Delete one deck template |
| `DELETE` | `/decks` | ADMIN | Delete all deck templates |

## Variants

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/variants` | Public | List all variants |
| `GET` | `/variants/:tid` | Public | Fetch one variant |
| `POST` | `/variants/add` | ADMIN | Upsert variant |
| `DELETE` | `/variants/:tid` | ADMIN | Delete one variant |
| `DELETE` | `/variants` | ADMIN | Delete all variants |

## Rewards Catalog

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/rewards/:tid` | USER | Fetch one reward definition |
| `GET` | `/rewards` | SERVER | List all reward definitions |
| `POST` | `/rewards/add` | ADMIN | Upsert reward definition |
| `DELETE` | `/rewards/:tid` | ADMIN | Delete one reward definition |
| `DELETE` | `/rewards` | ADMIN | Delete all rewards |

## Matches

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `POST` | `/matches/add` | SERVER | Create match |
| `POST` | `/matches/complete` | SERVER | Complete match and apply results |
| `POST` | `/matches/:tid/phase` | SERVER | Advance a match to the next saved turn-phase node and publish websocket phase events |
| `GET` | `/matches` | SERVER | List all matches |
| `GET` | `/matches/:tid` | USER | Read one match |

## Market

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `POST` | `/market/cards/add` | USER | Add market offer |
| `POST` | `/market/cards/remove` | USER | Remove market offer |
| `POST` | `/market/cards/trade` | USER | Buy/trade an offer |
| `GET` | `/market/cards/` | USER | List all offers |
| `GET` | `/market/cards/user/:username` | USER | List offers by seller |
| `GET` | `/market/cards/card/:tid` | USER | List offers by card id |
| `GET` | `/market/cards/offer/:username/:tid` | USER | Read a single offer |

## Activity

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/activity` | ADMIN | List activity log entries |

## Admin Dashboard API

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/admin/api/summary` | ADMIN | Aggregated monitoring payload used by the UI |
| `POST` | `/admin/api/reset-database` | Admin with `admin.system.reset` | Clears gameplay and ops-store data, then re-seeds built-in RBAC roles |
| `GET` | `/admin/api/players` | Admin with `admin.users.manage` | Lists non-staff players; supports `?limit=` and `?page=` |
| `GET` | `/admin/api/players/:userId/profile` | Admin with `admin.users.manage` | Player analytics payload with collection density, decks, recent matches, message history, friends, and activity history |
| `GET` | `/admin/api/staff` | Admin with `admin.roles.read` | Lists staff and admin accounts; supports `?limit=` and `?page=` |
| `POST` | `/admin/api/players/:userId` | Admin with `admin.users.manage` | Update player state fields such as `coins`, `xp`, `elo`, `validation_level`, `avatar`, and `cardback` |
| `POST` | `/admin/api/players/:userId/ban` | Admin with `admin.users.manage` | Ban a player with `type`, `reason`, optional `notes`, and `linked_chats` |
| `POST` | `/admin/api/players/:userId/unban` | Admin with `admin.users.manage` | Remove an active ban and restore player access |
| `POST` | `/admin/api/players/:userId/kick` | Admin with `admin.users.manage` | Emit a realtime kick event with optional `reason` |
| `GET` | `/admin/api/players/:userId/history` | Admin with `admin.audit.read` | Combined player activity history plus ban record, newest first |
| `GET` | `/admin/api/players/:userId/friends` | Admin with `admin.users.manage` | Lists the player's friends with basic presence info |
| `GET` | `/admin/api/players/:userId/decks/:deckTid` | Admin with `admin.users.manage` | Returns one owned deck with expanded card details |
| `POST` | `/admin/api/players/:userId/reward` | Admin with `admin.users.manage` | Grant a direct reward object to a player |
| `GET` | `/admin/api/games` | Admin with `admin.games.manage` | List recent matches; supports `?limit=` |
| `GET` | `/admin/api/games/:matchId/events` | Admin with `admin.games.manage` | Lists stored match events for one match |
| `DELETE` | `/admin/api/games/:matchId` | Admin with `admin.games.manage` | Delete a stored match record |
| `GET` | `/admin/api/offers` | Admin with `admin.market.manage` | List recent market offers; supports `?limit=`, `?seller=`, `?card=` |
| `DELETE` | `/admin/api/offers/:offerId` | Admin with `admin.market.manage` | Remove a market offer and restore cards to the seller when possible |
| `GET` | `/admin/api/cards` | Admin with `admin.content.manage` | Lists cards for the control room editor; supports `?limit=`, `?pack=`, `?set=`, `?type=` |
| `GET` | `/admin/api/cards/:tid` | Admin with `admin.content.manage` | Get one card document |
| `POST` | `/admin/api/cards` | Admin with `admin.content.manage` | Create or update a card document |
| `DELETE` | `/admin/api/cards/:tid` | Admin with `admin.content.manage` | Delete one card document |
| `GET` | `/admin/api/suite/keywords` | Admin with `admin.content.manage` | Lists keyword definitions |
| `POST` | `/admin/api/suite/keywords` | Admin with `admin.content.manage` | Create or update a keyword definition |
| `GET` | `/admin/api/suite/sets` | Admin with `admin.content.manage` | Lists set definitions |
| `POST` | `/admin/api/suite/sets` | Admin with `admin.content.manage` | Create or update a set definition |
| `DELETE` | `/admin/api/suite/sets/:tid` | Admin with `admin.content.manage` | Delete one set definition |
| `GET` | `/admin/api/suite/packs` | Admin with `admin.content.manage` | Lists pack definitions |
| `POST` | `/admin/api/suite/packs` | Admin with `admin.content.manage` | Create or update a pack definition |
| `DELETE` | `/admin/api/suite/packs/:tid` | Admin with `admin.content.manage` | Delete one pack definition |
| `GET` | `/admin/api/suite/types` | Admin with `admin.content.manage` | Lists card-type definitions |
| `POST` | `/admin/api/suite/types` | Admin with `admin.content.manage` | Create or update a card-type definition |
| `DELETE` | `/admin/api/suite/types/:tid` | Admin with `admin.content.manage` | Delete one card-type definition |
| `GET` | `/admin/api/studio/frames` | Admin with `admin.content.manage` | Lists frame templates used by Card Studio |
| `POST` | `/admin/api/studio/frames` | Admin with `admin.content.manage` | Create or update one frame template |
| `DELETE` | `/admin/api/studio/frames/:tid` | Admin with `admin.content.manage` | Delete one frame template |
| `GET` | `/admin/api/studio/backs` | Admin with `admin.content.manage` | Lists card-back templates used by Card Studio |
| `POST` | `/admin/api/studio/backs` | Admin with `admin.content.manage` | Create or update one card-back template |
| `DELETE` | `/admin/api/studio/backs/:tid` | Admin with `admin.content.manage` | Delete one card-back template |
| `GET` | `/admin/api/flows` | Admin with `admin.game_flows.manage` | Lists game-flow definitions |
| `GET` | `/admin/api/flows/:tid` | Admin with `admin.game_flows.manage` | Get one game-flow definition |
| `POST` | `/admin/api/flows` | Admin with `admin.game_flows.manage` | Create or update a game-flow graph |
| `DELETE` | `/admin/api/flows/:tid` | Admin with `admin.game_flows.manage` | Delete one game-flow definition |

## RBAC

RBAC applies to admin users and scopes named permissions on top of the legacy `ADMIN` permission level.

| Method | Path | Access | Notes |
| --- | --- | --- | --- |
| `GET` | `/admin/roles` | Admin with `admin.roles.read` | Lists roles and available permissions |
| `POST` | `/admin/roles` | Admin with `admin.roles.manage` | Create or update a role |
| `DELETE` | `/admin/roles/:roleId` | Admin with `admin.roles.manage` | Delete a non-system role |
| `GET` | `/admin/users/:userId/access` | Admin with `admin.roles.read` | Read a user and their RBAC access context |
| `POST` | `/admin/users/:userId/roles` | Admin with `admin.roles.manage` | Replace a user's assigned roles |

Notes:

- `/admin` and `/admin/api/summary` require `admin.dashboard.read` for admin users.
- `/admin/api/players` is player-only; staff and admin users are intentionally excluded from that roster.
- The Operators view in `/admin` is backed by `/admin/api/staff`, `/admin/roles`, and `/admin/users/:userId/access`.
- Card Studio inside `/admin` is template-only and uses `/admin/api/suite/types`, `/admin/api/studio/frames`, and `/admin/api/studio/backs`.
- In Card Studio, zone names are the canonical property names for card data; the separate manual field schema is no longer edited directly.
- The visual Catalog view inside `/admin` uses `/admin/api/cards` plus the template endpoints to preview cards, create a single card, or bulk import a JSON list against a selected type template, with zone inputs ordered by their template positions.
- Saved turn-phase flows can be attached to matches through `flow_tid`, and runtime phase changes publish websocket events using the generic `game.phase.changed` event plus any custom `event_name` configured on the phase node.
- There is no seeded default admin username/password.
- Bootstrap admin access can be created in `/setup`, or by registering the first user if the installer bootstrap step is skipped.
- `/admin` redirects to `/setup` until the datastore is configured and at least one user exists.
- `/setup` redirects to `/admin` once setup and bootstrap are complete.
- Reward grants for other users now require `admin.users.manage` for admin users.
- Match moderation now requires `admin.games.manage`.
- Market-offer moderation now requires `admin.market.manage`.
- Game-flow management requires `admin.game_flows.manage`.
- Database reset requires `admin.system.reset`.
- `OPS_DB_DRIVER` also accepts `myql` as an alias for `mysql`, and `sql` / `sqlserver` as aliases for `mssql`.
- `GAME_DB_DRIVER` accepts the same aliases as `OPS_DB_DRIVER`.

## Dev Seed

- Command: `npm run seed:dev-demo`
- Demo player:
  - Username: `DevPlayer`
  - Email: `dev.player@example.test`
  - Password: `DevPlayer123!`
- The seed also creates `DevRival` as supporting player data for messages, matches, and friends.

## Websocket

- Path: `WEBSOCKET_PATH` (default `/ws`)
- Auth: JWT access token via query string or `{"type":"auth","token":"..."}` message
- Event examples: `trade.created`, `trade.updated`, `system.broadcast`

## RCON

- Protocol: TCP JSON-lines server
- Auth:
  - `{"command":"auth","token":"<jwt>"}`
  - `{"command":"auth","password":"<rcon-password>"}`
- Example commands:
  - `help`
  - `summary`
  - `trades`
  - `activity`
  - `roles.list`
  - `roles.assign`
  - `roles.remove`
  - `users.find`
  - `broadcast`
