// One codebase, two targets (same as shanti-ops' SB Ops):
//   - Render (the live Savistar app): `next build` / `next start`, nothing below applies.
//   - Cloudflare Workers (the public demo, interiors-erp.ahromlabs.com): `npm run cf:build` sets
//     SAV_TARGET=workers, which swaps in libsql's web client and traces its files.
const WORKERS = process.env.SAV_TARGET === 'workers';

/** @type {import('next').NextConfig} */
module.exports = {
  reactStrictMode: true,
  // @react-pdf/renderer must run as a real Node module (fontkit/native deps), not be bundled.
  serverExternalPackages: ['@react-pdf/renderer'],
  ...(WORKERS ? {
    outputFileTracingIncludes: { '/**': ['./node_modules/@libsql/**/*'] },
    webpack(config, { webpack }) {
      config.plugins.push(new webpack.NormalModuleReplacementPlugin(/[\\/]db-client\.js$/, (r) => { r.request = r.request.replace(/db-client\.js$/, 'db-client.workers.js'); }));
      return config;
    },
  } : {}),
};
