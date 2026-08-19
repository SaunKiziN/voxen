# VOXEN

VOXEN is an alpha-stage communication platform for small groups that need lightweight voice, persistent chat, and screen sharing without running a large community stack.

The project is desktop-first, built around a Tauri app that connects to a server. During the Alpha, the deployment model is intentionally simple: a centralized server can host the current VOXEN experience while the product, packaging, and desktop flows continue to evolve.

> [!IMPORTANT]
> VOXEN is in active Alpha development. APIs, configuration, desktop packaging, and runtime behavior may change without notice.

## Current Features

- Voice channels
- Persistent text chat
- Screen sharing
- Roles, invites, and permissions
- Desktop app via Tauri
- Lightweight server suitable for small groups

## Architecture

VOXEN is based on the open-source Sharkord codebase and currently keeps several internal Sharkord technical names for compatibility.

Core technologies:

- Bun for the server runtime and workspace tooling
- React and Vite for the web client
- tRPC and WebSocket subscriptions for client/server communication
- mediasoup for voice and real-time media routing
- SQLite and Drizzle for persistence
- Tauri for the desktop shell

## Monorepo Layout

```text
apps/
  client/      React + Vite web client
  server/      Bun server, tRPC, SQLite, Drizzle, mediasoup
  desktop/     Tauri desktop app

packages/
  shared/      Shared types, constants, and helpers
  ui/          Shared presentational UI components
  plugin-sdk/  Plugin API surface
  e2e/         Playwright end-to-end tests
```

Internal package names such as `@sharkord/shared` are intentionally unchanged during this stage.

## Development

Requirements:

- [Bun](https://bun.sh/) 1.3.14
- Rust toolchain for Tauri desktop development
- WebView2 on Windows for the desktop app
- tmux is optional for the helper startup script

Install dependencies from the repository root:

```bash
bun install
```

Run the server and web client:

```bash
# option 1: helper script on supported shells
./start.sh

# option 2: run each app separately
cd apps/server
bun run dev

cd apps/client
bun run dev
```

Run the desktop app:

```bash
cd apps/desktop
bun run dev
```

The desktop app may require a configured remote server URL depending on the current desktop branch and environment.

Run tests from the repository root:

```bash
bun run test
```

Run type checks from the repository root:

```bash
bun run check-types
```

## Docker

Docker support is available through the repository `Dockerfile`. Some runtime paths and binary names still use the inherited Sharkord technical names for compatibility.

Build the image directly from the source tree:

```bash
docker build -t voxen .
```

Run the container:

```bash
docker run \
  -p 4991:4991/tcp \
  -p 40000:40000/tcp \
  -p 40000:40000/udp \
  -v ./data:/home/bun/.config/sharkord \
  --name voxen \
  voxen
```

On first launch, the server may print an owner access token. Treat that token as secret.

## Documentation

Documentation is being prepared. Until then, the source tree is the most accurate reference for the current Alpha behavior.

## License and Acknowledgements

VOXEN is licensed under the MIT License. See [LICENSE](LICENSE) for details.

VOXEN is developed from the open-source Sharkord codebase. We preserve the existing license and acknowledge the original Sharkord project and its contributors.

This project builds on excellent open-source technology, including Bun, React, Vite, tRPC, mediasoup, Drizzle, SQLite, and Tauri.
