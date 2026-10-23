// One codebase, two targets (same as shanti-ops' SB Ops):
//   - Render (the live Savistar app): `next build` / `next start`, nothing below applies.
//   - Cloudflare Workers (the public demo, interiors-erp.ahromlabs.com): `npm run cf:build` sets
//     SAV_TARGET=workers, which swaps in libsql's web client and traces its files.
const WORKERS = process.env.SAV_TARGET === 'workers';

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // @react-pdf/renderer and @muhammara/native must run as real Node modules (native/font deps),
  // not be bundled — on Workers, pdfPassword.js itself gets swapped out below instead.
  serverExternalPackages: ['@react-pdf/renderer', '@muhammara/native'],
  // Commit this build came from (GET /api/version): Render sets RENDER_GIT_COMMIT, the GitHub deploy
  // workflow sets GITHUB_SHA. The workflow waits until each server reports the pushed commit.
  env: { BUILD_COMMIT: process.env.RENDER_GIT_COMMIT || process.env.GITHUB_SHA || '' },
  ...(WORKERS ? {
    outputFileTracingIncludes: { '/**': ['./node_modules/@libsql/**/*'] },
    webpack(config, { webpack }) {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/[\\/]db-client\.js$/, (r) => { r.request = r.request.replace(/db-client\.js$/, 'db-client.workers.js'); }));
      // @muhammara/native (PDF password decryption) is a compiled Node addon — can't load in a
      // Workers isolate, and bank-statement AI extraction is already off in the demo.
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/[\\/]pdfPassword(\.js)?$/, (r) => { r.request = r.request.replace(/pdfPassword(\.js)?$/, 'pdfPassword.workers.js'); }));
      return config;
    },
  } : {}),
};
