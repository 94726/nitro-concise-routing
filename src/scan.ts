import { globby } from 'globby'
import { join, relative } from 'pathe'
import { scanExports } from 'unimport'
import { withBase, withLeadingSlash, withoutTrailingSlash } from 'ufo'
import type { Plugin } from 'rollup'
import type { Nitro, NitroEventHandler } from 'nitropack'

export const GLOB_SCAN_PATTERN = '**/*.{js,mjs,cjs,ts,mts,cts,tsx,jsx}'
type FileInfo = { path: string; fullPath: string }

/** allows calling rollup:reload only when necessary */
let exportsCache: Record<string, Set<string>> = {}
type MatchedMethodSuffix =
  | 'connect'
  | 'delete'
  | 'get'
  | 'head'
  | 'options'
  | 'patch'
  | 'post'
  | 'put'
  | 'trace'
type MatchedEnvSuffix = 'dev' | 'prod' | 'prerender'
const suffixRegex =
  /(\.(connect|delete|get|head|options|patch|post|put|trace))?(\.(dev|prod|prerender))?$/

export function watchExportsPlugin(nitro: Nitro): Plugin {
  return {
    name: 'nitro-concise-routing-watch-exports',
    async watchChange(fullPath) {
      const previousExports = exportsCache[fullPath]
      if (!previousExports) return

      const newExports = new Set(
        (await scanExports(fullPath, false)).map((e) => e.name),
      )

      const sameExports = areSetsEqual(previousExports, newExports)
      if (sameExports) return

      await scanHandlers(nitro)
      nitro.hooks.callHook('rollup:reload')
    },
  }
}

export async function scanHandlers(nitro: Nitro) {
  const handlers = await Promise.all([
    scanServerRoutes(
      nitro,
      nitro.options.nitroConciseRouting!.apiDir!,
      nitro.options.apiBaseURL || '/api',
    ),
    scanServerRoutes(nitro, nitro.options.nitroConciseRouting!.routesDir!),
  ]).then((r) => r.flat())

  nitro.options.handlers = handlers.filter((h, index, array) => {
    return (
      array.findIndex(
        (h2) =>
          h.route === h2.route && h.method === h2.method && h.env === h2.env,
      ) === index
    )
  })

  return handlers
}

export async function scanServerRoutes(
  nitro: Nitro,
  dir: string,
  prefix = '/',
) {
  const files = await scanFiles(nitro, dir)
  exportsCache = {}
  return (
    await Promise.all(
      files.map(async (file) => {
        return await extractHandlers(nitro, file, {
          prefix,
          lazy: true,
          middleware: false,
        })
      }),
    )
  ).flat()
}

async function extractHandlers(
  nitro: Nitro,
  file: FileInfo,
  options: { lazy: boolean; middleware: boolean; prefix: string },
) {
  let route = file.path
    .replace(/\.[A-Za-z]+$/, '')
    .replace(/\[\.{3}]/g, '**')
    .replace(/\[\.{3}(\w+)]/g, '**:$1')
    .replace(/\[(\w+)]/g, ':$1')
  route = withLeadingSlash(
    withoutTrailingSlash(withBase(route, options.prefix)),
  )

  const suffixMatch = route.match(suffixRegex)
  let forcedMethod: MatchedMethodSuffix | undefined
  let env: MatchedEnvSuffix | undefined
  if (suffixMatch?.index) {
    route = route.slice(0, Math.max(0, suffixMatch.index))
    forcedMethod = suffixMatch[2] as MatchedMethodSuffix
    env = suffixMatch[4] as MatchedEnvSuffix
  }

  route = route.replace(/\/index$/, '') || '/'

  let scannedExports = await scanExports(file.fullPath, false)
  exportsCache[file.fullPath] = new Set(scannedExports.map((e) => e.name))
  const handlers: NitroEventHandler[] = []

  // make sure we have at least one handler so we can watch the file
  // and if method suffix is provided, fall back to default export
  if (!scannedExports.length || forcedMethod) {
    scannedExports = [{ name: 'default', from: file.fullPath }]
  }

  for (const scannedExport of scannedExports) {
    const method =
      forcedMethod ||
      nitro.options.nitroConciseRouting!.exportsMapping![scannedExport.name]

    handlers.push({
      handler: file.fullPath,
      lazy: options.lazy,
      middleware: options.middleware,
      route,
      method,
      env,
      export: scannedExport.name,
    })
  }
  return handlers
}

async function scanFiles(nitro: Nitro, name: string): Promise<FileInfo[]> {
  const files = await Promise.all(
    nitro.options.scanDirs.map((dir) => scanDir(nitro, dir, name)),
  ).then((r) => r.flat())
  return files
}

async function scanDir(
  nitro: Nitro,
  dir: string,
  name: string,
): Promise<FileInfo[]> {
  const fileNames = await globby(join(name, GLOB_SCAN_PATTERN), {
    cwd: dir,
    dot: true,
    ignore: nitro.options.ignore,
    absolute: true,
  })
  return fileNames
    .map((fullPath) => {
      return {
        fullPath,
        path: relative(join(dir, name), fullPath),
      }
    })
    .sort((a, b) => a.path.localeCompare(b.path))
}

function areSetsEqual(set1: Set<unknown>, set2: Set<unknown>) {
  return set1.size === set2.size && [...set1].every((x) => set2.has(x))
}
