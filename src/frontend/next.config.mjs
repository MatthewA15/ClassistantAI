import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

/** @type {import('next').NextConfig} */
const nextConfig = {
  reactStrictMode: true,
  poweredByHeader: false,
  // Pin the trace root to this app. Without it Next walks up and can pick a
  // stray lockfile outside the repo as the workspace root.
  outputFileTracingRoot: dirname(fileURLToPath(import.meta.url)),

  /**
   * Build output directory, overridable per process.
   *
   * `next dev` and `next build` cannot share one .next directory. Running a
   * production build while a dev server is up deletes the chunks that dev
   * server is serving, and the symptom is nasty to diagnose: the page still
   * renders from SSR HTML, but its JavaScript 404s, nothing hydrates, and so
   * every click does nothing while hover states still work.
   *
   * So a build that runs alongside someone's dev server sets its own:
   *   NEXT_DIST_DIR=.next-verify npm run build
   *   NEXT_DIST_DIR=.next-verify npx next start -p 4600
   */
  distDir: process.env.NEXT_DIST_DIR || ".next",
};

export default nextConfig;
