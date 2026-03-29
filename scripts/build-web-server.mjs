/**
 * Build script for the OpenCove web server (proxy mode).
 *
 * Bundles src/server/proxy.ts into out/server/proxy.js.
 * The proxy has NO native module dependencies — just express + ws.
 */
import { build } from 'esbuild'
import { resolve, dirname } from 'path'
import { fileURLToPath } from 'url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const root = resolve(__dirname, '..')

async function main() {
  console.log('Building web server proxy...')

  await build({
    entryPoints: [resolve(root, 'src/server/proxy.ts')],
    bundle: true,
    platform: 'node',
    target: 'node22',
    format: 'cjs',
    outfile: resolve(root, 'out/server/proxy.js'),
    // Bundle EVERYTHING — no native modules needed in proxy mode
    external: [],
    sourcemap: true,
    logLevel: 'info',
  })

  console.log('Web server build complete.')
}

main().catch(err => {
  console.error('Build failed:', err)
  process.exit(1)
})
