import { join } from 'pathe'
import { watch } from 'chokidar'
import { handlers } from './overwrites/handlers'
import { extendTypes } from './overwrites/extend-types'
import { scanHandlers, watchExportsPlugin } from './scan'
import type { Nitro } from 'nitropack'

export default defineNitroModule({
  setup(nitro) {
    configureOptions(nitro)
    
    nitro.hooks.hook('rollup:before', async (nitro, rollupConfig) => {
      rollupConfig.plugins ||= []
      if (!Array.isArray(rollupConfig.plugins))
        rollupConfig.plugins = [rollupConfig.plugins]

      rollupConfig.plugins.unshift(handlers(nitro)) // put custom handler implementation in front of native handlers
      rollupConfig.plugins.unshift(watchExportsPlugin(nitro))

      await setupFileWatcher(nitro)
    })

    nitro.hooks.hook('types:extend', (types) => extendTypes(nitro, types))
  },
})

function configureOptions(nitro: Nitro) {
  nitro.options.nitroConciseRouting ||= {}
  nitro.options.nitroConciseRouting.exportsMapping ||= {
    default: 'get',
    GET: 'get',
    POST: 'post',
    PUT: 'put',
    DELETE: 'delete',
    PATCH: 'patch',
    HEAD: 'head',
    OPTIONS: 'options',
    CONNECT: 'connect',
    TRACE: 'trace',
  } as const

  // overwriting native dirs to avoid double scanning
  if (!nitro.options.nitroConciseRouting.routesDir) {
    nitro.options.routesDir ||= 'routes'
    nitro.options.nitroConciseRouting.routesDir = nitro.options.routesDir
    nitro.options.routesDir = `_${nitro.options.routesDir}`
  }
  if (!nitro.options.nitroConciseRouting.apiDir) {
    nitro.options.apiDir ||= 'api'
    nitro.options.nitroConciseRouting.apiDir = nitro.options.apiDir
    nitro.options.apiDir = `_${nitro.options.apiDir}`
  }

  // adds nitroConciseRouting option to nitroConfig
  nitro.options.typescript.tsConfig ??= {}
  nitro.options.typescript.tsConfig.compilerOptions ??= {}
  nitro.options.typescript.tsConfig.compilerOptions.types ??= []
  nitro.options.typescript.tsConfig.compilerOptions.types.push(
    'nitro-concise-routing/schema',
  )
}

async function setupFileWatcher(nitro: Nitro) {
  const watchPatterns = nitro.options.scanDirs.flatMap((dir) => [
    join(dir, nitro.options.nitroConciseRouting!.apiDir!),
    join(dir, nitro.options.nitroConciseRouting!.routesDir!),
  ])

  const watchReloadEvents = new Set(['add', 'addDir', 'unlink', 'unlinkDir'])

  const reloadWatcher = watch(watchPatterns, { ignoreInitial: true }).on(
    'all',
    async (event) => {
      if (!watchReloadEvents.has(event)) return

      await scanHandlers(nitro)
      nitro.hooks.callHook('rollup:reload')
    },
  )

  nitro.hooks.hook('close', () => {
    reloadWatcher.close()
  })

  await scanHandlers(nitro) // initialize handlers
}
