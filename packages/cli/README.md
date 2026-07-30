# Roomy CLI

CLI tool for Roomy — space management and agent testing via the appserver XRPC interface.

## Setup

```bash
pnpm install --filter @roomy/cli
pnpm --filter @roomy/cli build
```

## Configuration

Set these environment variables (or copy `.env.example` to `.env` and source it):

| Variable | Required | Default | Description |
|---|---|---|---|
| `ATPROTO_IDENTIFIER` | yes | — | Bluesky handle or DID |
| `ATPROTO_APP_PASSWORD` | yes | — | App password (generate at bsky.app/settings/app-passwords) |
| `APPSERVER_URL` | no | `http://localhost:8080` | Roomy appserver URL |
| `APPSERVER_DID` | no | `did:web:api.roomy.space` | Appserver DID |

## Usage

```bash
# Via pnpm
pnpm --filter @roomy/cli start <command>

# Via tsx directly
npx tsx packages/cli/src/cli.ts <command>

# Via the built binary
./packages/cli/bin/roomy-cli.ts <command>
```

## Commands

### `spaces`

List all spaces the authenticated user is a member of.

```bash
roomy-cli spaces
```

### `create-space`

Create a new Roomy space.

```bash
roomy-cli create-space --name "My Space" [--description "A description"]
```

### `rooms`

List channels (rooms) in a space, grouped by sidebar category.

```bash
roomy-cli rooms --space <space-did>
```

### `send`

Send a message to a room. Accepts text inline or piped via stdin.

```bash
roomy-cli send --space <space-did> --room <room-id> --text "Hello!"
echo "Piped content" | roomy-cli send --space <space-did> --room <room-id>
```

### `read`

Read recent messages from a room.

```bash
roomy-cli read --room <room-id> [--limit 20]
```

## Agent Testing

The CLI is designed for agent-driven workflows. Example with Claude Code:

```bash
# Create a space for agent testing
roomy-cli create-space --name "Agent Test"

# List spaces to get the space DID
roomy-cli spaces

# List rooms to find the lobby channel ID
roomy-cli rooms --space <space-did>

# Send a message
roomy-cli send --space <space-did> --room <room-id> --text "Agent message"

# Read responses
roomy-cli read --room <room-id> --limit 10
```
