This is a [Next.js](https://nextjs.org) project bootstrapped with [`create-next-app`](https://nextjs.org/docs/app/api-reference/cli/create-next-app).

## Getting Started

First, run the development server:

```bash
npm run dev
# or
yarn dev
# or
pnpm dev
# or
bun dev
```

Open [http://localhost:3000](http://localhost:3000) with your browser to see the result.

You can start editing the page by modifying `app/page.tsx`. The page auto-updates as you edit the file.

This project uses [`next/font`](https://nextjs.org/docs/app/building-your-application/optimizing/fonts) to automatically optimize and load [Geist](https://vercel.com/font), a new font family for Vercel.

## Media extraction and downloads

The built-in extractor currently supports public YouTube URLs only and requires Node.js `^22.22.2`, `^24.15.0`, or `>=26.0.0`. YouTube may deny metadata requests from a server or change its player response; bot checks, rate limits, and unsupported player responses are reported as upstream errors rather than bypassed or retried when retrying cannot help. For deployments where direct extraction is denied or the current player response is unsupported, configure an authorized `MEDIA_BACKEND_URL` (or its compatibility alias `EXTERNAL_MEDIA_BACKEND_URL`). It receives the same `/api/info` and `/api/media/download` POST requests and must also implement matching `/api/media/progress/:jobId` and `/api/media/file/:jobId` GET routes. Backend download failures are returned directly; the app does not silently switch to local extraction. Use HTTPS for a deployed backend; plain HTTP is accepted only for localhost development. The backend URL is operator-controlled and must not contain credentials or redirects.

These optional environment variables configure conservative per-process limits. Values must be positive integers within the documented maximum; invalid values are reported as configuration errors.

| Variable | Default | Maximum | Purpose |
| --- | ---: | ---: | --- |
| `MEDIA_INFO_CACHE_TTL_MS` | `300000` | `3600000` | Successful local metadata cache TTL. |
| `MEDIA_MAX_CONCURRENT_EXTRACTIONS` | `2` | `20` | Concurrent local metadata extractions. |
| `MEDIA_MAX_CONCURRENT_DOWNLOADS` | `2` | `20` | Active local download jobs. |
| `MEDIA_REQUEST_TIMEOUT_MS` | `30000` | `300000` | Metadata and backend request timeout; local downloader socket timeout follows it. |
| `MEDIA_JOB_TTL_MS` | `900000` | `86400000` | Retention for completed/failed jobs and their temporary files. |

Local concurrency limits, rate-limit cooldowns, metadata cache, job state, and temporary files are process-local. They are not shared across instances, and the local download path is disabled in Vercel/AWS Lambda serverless runtimes. A single-instance persistent Node.js deployment is required for local downloads to remain available through polling and file delivery. For serverless or horizontally scaled deployments, run a separate persistent worker behind a shared queue, store job state in a shared database/Redis, and place completed artifacts in shared object storage; the backend must expose the route contract above.

Submitted URLs are restricted to HTTP(S), checked for public DNS/IP destinations, and normalized before local metadata caching. This initial check cannot pin DNS for all downstream requests or validate redirects followed internally by the extractor/backend. Public deployments should isolate worker egress from private, link-local, and cloud-metadata networks and require the backend to validate every redirect destination. Do not forward cookies or authentication tokens. Upstream throttling or restrictions can still prevent a request; rate-limited and denied requests are not disguised as successful requests or retried using alternate client identities/formats. Prefer official APIs and sources that explicitly permit downloading. A desktop/local companion may help with sources that permit client-side fetching, but does not guarantee access or bypass restrictions.

## Learn More

To learn more about Next.js, take a look at the following resources:

- [Next.js Documentation](https://nextjs.org/docs) - learn about Next.js features and API.
- [Learn Next.js](https://nextjs.org/learn) - an interactive Next.js tutorial.

You can check out [the Next.js GitHub repository](https://github.com/vercel/next.js) - your feedback and contributions are welcome!

## Deploy on Vercel

The easiest way to deploy your Next.js app is to use the [Vercel Platform](https://vercel.com/new?utm_medium=default-template&filter=next.js&utm_source=create-next-app&utm_campaign=create-next-app-readme) from the creators of Next.js.

Check out our [Next.js deployment documentation](https://nextjs.org/docs/app/building-your-application/deploying) for more details.
