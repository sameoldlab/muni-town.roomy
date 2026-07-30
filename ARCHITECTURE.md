# Roomy Architecture

## Bootstrapping flow

1. user logs in with atproto
2. roomy requests `space.roomy.space.personal.dev/self` from user's PDS
3. that record contains the ID for a 'personal stream', which roomy then requests from the appserver's local event store
4. roomy reads a backfill of events for the personal stream from the appserver's SQLite events DB
5. some of those are space join events, and when we materialise them, roomy requests the corresponding streams from the local event store
6. roomy reads backfill events for each of these streams from the local event store
7. roomy materialises state for each space
