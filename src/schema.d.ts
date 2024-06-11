import type { RouterMethod } from 'h3'
import type { NitroEventHandler, NitroOptions } from 'nitropack'

declare module 'nitropack' {
  interface NitroEventHandler {
    /**
     * Which export to use from the handler file
     */
    export?: string
  }
  interface NitroOptions {
    nitroConciseRouting?: {
      /**
       * Mapping of export names to router methods
       *
       * If you specifiy this, no other exports will be used other than the ones specified here
       * @example { default: 'get', GET: 'get', POST: 'post' }
       */
      exportsMapping?: Record<string, RouterMethod>
      routesDir?: string
      apiDir?: string
    }
  }
}
