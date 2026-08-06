# ShieldMail Dashboard

Operational console for ShieldMail private email aliases, forwarding, PGP
protection and threat filtering. Built with TanStack Start, React, TypeScript
and Tailwind CSS.

## Stack

- **Framework**: TanStack Start (SSR) + Vite
- **UI**: React 19, Tailwind CSS 4, shadcn/ui
- **Server**: Nitro (node preset)

## Development

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
```

Produces a node-target Nitro server output (`nitro start` / PM2) plus the
static client bundle.

## Environment

Copy `.env.example` to a local `.env` and set real values:

```sh
cp .env.example .env
```