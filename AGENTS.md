# ShieldMail Dashboard

Operational console for ShieldMail private email aliases, forwarding, PGP
protection and threat filtering.

## Stack

- **Framework**: TanStack Start (SSR) + Vite
- **UI**: React 19, TypeScript, Tailwind CSS 4, shadcn/ui
- **Server**: Nitro (node preset)
- **Data**: TanStack Query (mock data for now — real API wiring is a follow-up)

## Development

```sh
npm install
npm run dev
```

## Build

```sh
npm run build
```

Produces a node-target Nitro server output plus the static client bundle under
`dist/`.

## Conventions

- Components live in `src/components/`, routes in `src/routes/`.
- UI primitives are in `src/components/ui/` (shadcn/ui).
- `@` path alias maps to `src/`.
- Format with `npm run format` (Prettier), lint with `npm run lint` (ESLint).