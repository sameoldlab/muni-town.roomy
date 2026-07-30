# Roomy Appserver (a.k.a. AppView)

Mediates access to its own local SQLite event store via the ATProto XRPC interface.

## Development

Most XRPC methods are authenticated by proxying via the PDS. The appserver can be run and used locally but to be accessible to a public PDS, must be tunneled to the public web, e.g. `tailscale funnel 8080`. The tunneled endpoint becomes the DID e.g. `did:web:device.tail12345.ts.net`. These should be set in `.env`. 

The appserver owns its event store locally; no external event-stream server (Leaf) is required as a runtime dependency.

`APPSERVER_PERSONAL_STREAM_NSID` will determine the collection to refer to for the personal stream. The appserver caches the personal stream DID with no TTL, so the `roomy.sqlite` db files need to be deleted to clear that cache. The `roomy-readstate.sqlite` db is only used to store unread count read states. It is meant as a persistent source of truth whereas the `roomy` db is derived data.