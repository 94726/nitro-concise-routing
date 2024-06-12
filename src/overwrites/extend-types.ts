import type { Nitro, NitroTypes } from 'nitropack'
import { resolveNitroPath } from 'nitropack/kit'
import { relative, resolve } from 'pathe'

export function extendTypes(nitro: Nitro, types: NitroTypes) {
  const middleware = [...nitro.scannedHandlers, ...nitro.options.handlers]

  // clear native route types
  types.routes = {}

  for (const mw of middleware) {
    if (typeof mw.handler !== 'string' || !mw.route) {
      continue
    }

    const typesDir = resolve(nitro.options.buildDir, 'types')

    const relativePath = relative(
      typesDir,
      resolveNitroPath(mw.handler, nitro.options),
    ).replace(/\.(js|mjs|cjs|ts|mts|cts|tsx|jsx)$/, '')

    const method = mw.method || 'default'
    const fileExport = mw.export || 'default'

    types.routes[mw.route] ??= {}
    types.routes[mw.route][method] ??= []
    types.routes[mw.route][method]!.push(
      `Simplify<Serialize<Awaited<ReturnType<typeof import('${relativePath}').${fileExport}>>>>`,
    )
  }
}
