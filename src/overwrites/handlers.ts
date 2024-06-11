import { hash } from 'ohash'
import type { Nitro, NitroRouteRules, NitroEventHandler } from 'nitropack/types'
import { virtual } from './virtual'

export function handlers(nitro: Nitro) {
  const getHandlers = () => {
    const handlers: NitroEventHandler[] = [
      ...nitro.scannedHandlers,
      ...nitro.options.handlers,
    ]

    const envConditions = new Set(
      [
        nitro.options.dev ? 'dev' : 'prod',
        nitro.options.preset,
        nitro.options.preset === 'nitro-prerender' ? 'prerender' : undefined,
      ].filter(Boolean) as string[],
    )

    return handlers.filter((h) => {
      const envs = (Array.isArray(h.env) ? h.env : [h.env]).filter(
        Boolean,
      ) as string[]
      return envs.length === 0 || envs.some((env) => envConditions.has(env))
    })
  }

  return virtual(
    {
      '#nitro-internal-virtual/server-handlers': () => {
        const handlers = getHandlers()
        if (nitro.options.serveStatic) {
          handlers.unshift({
            middleware: true,
            handler: 'nitropack/runtime/internal/static',
          })
        }
        if (nitro.options.renderer) {
          handlers.push({
            route: '/**',
            lazy: true,
            handler: nitro.options.renderer,
          })
        }

        // If this handler would render a cached route rule then we can also inject a cached event handler
        extendMiddlewareWithRuleOverlaps(handlers, nitro.options.routeRules)

        // Imports take priority
        const imports: Record<string, NitroEventHandler> = {}
        // Lazy imports should fill in the gaps
        const lazyImports: Record<string, NitroEventHandler> = {}

        // TODO: At least warn if a handler is imported both lazy and non lazy
        for (const handler of handlers) {
          handler.export ||= 'default'
          const map = handler.lazy ? lazyImports : imports

          map[getImportId(handler.handler, handler.export, handler.lazy)] =
            handler
        }

        const code = /* js */ `
${Object.entries(imports)
  .map(
    ([importId, handler]) =>
      `import {${handler.export} as ${importId}} from '${handler.handler}';`,
  )
  .join('\n')}

${Object.entries(lazyImports)
  .map(
    ([importId, handler]) =>
      `const ${importId} = async () => (await import('${handler.handler}')).${handler.export};`,
  )
  .join('\n')}

export const handlers = [
${handlers
  .map(
    (h) =>
      `  { route: '${h.route || ''}', handler: ${getImportId(
        h.handler,
        h.export,
        h.lazy,
      )}, lazy: ${!!h.lazy}, middleware: ${!!h.middleware}, method: ${JSON.stringify(
        h.method?.toLowerCase(),
      )} }`,
  )
  .join(',\n')}
];
  `.trim()
        return code
      },
      '#nitro-internal-virtual/server-handlers-meta': () => {
        const handlers = getHandlers()
        return /* js */ `
  ${handlers
    .map(
      (h) => `import ${getImportId(h.handler)}Meta from "${h.handler}?meta";`,
    )
    .join('\n')}
export const handlersMeta = [
  ${handlers
    .map(
      (h) =>
        /* js */ `{ route: ${JSON.stringify(h.route)}, method: ${JSON.stringify(
          h.method?.toLowerCase(),
        )}, meta: ${getImportId(h.handler)}Meta }`,
    )
    .join(',\n')}
  ];
        `
      },
    },
    nitro.vfs,
  )
}

function getImportId(p: string, exportName = 'default', lazy = false) {
  return (lazy ? '_lazy_' : '_') + hash(p).slice(0, 6) + '_' + exportName
}

const WILDCARD_PATH_RE = /\/\*\*.*$/

function extendMiddlewareWithRuleOverlaps(
  handlers: NitroEventHandler[],
  routeRules: Record<string, NitroRouteRules>,
) {
  const rules = Object.entries(routeRules)
  for (const [path, rule] of rules) {
    // We can ignore this rule if it is not cached and it isn't nested in a cached route
    if (!rule.cache) {
      // If we are nested 'within' a cached route, we want to inject a non-cached event handler
      const isNested = rules.some(
        ([p, r]) =>
          r.cache &&
          WILDCARD_PATH_RE.test(p) &&
          path.startsWith(p.replace(WILDCARD_PATH_RE, '')),
      )
      if (!isNested) {
        continue
      }
    }
    for (const [index, handler] of handlers.entries()) {
      // Skip middleware
      if (!handler.route || handler.middleware) {
        continue
      }
      // We will correctly register this rule as a cached route anyway
      if (handler.route === path) {
        break
      }
      // We are looking for handlers that will render a route _despite_ not
      // having an identical path to it
      if (!WILDCARD_PATH_RE.test(handler.route)) {
        continue
      }
      if (!path.startsWith(handler.route.replace(WILDCARD_PATH_RE, ''))) {
        continue
      }
      handlers.splice(index, 0, {
        ...handler,
        route: path,
      })
      break
    }
  }
}
