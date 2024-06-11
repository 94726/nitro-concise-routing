# Nitro Concise Routing

> [!IMPORTANT]
> This is a rather experimental module, overriding some native nitro behavior and therefore might break easily.

## What does it do?

By default, Nitro uses default exports, paired with file-endings like `.post.ts` and `.patch.ts` to determine the request method.
This can be a bit verbose, especially if you have a lot of routes.

This package allows you to define multiple methods for one route in a single file, [similar to how SolidStart does it](https://docs.solidjs.com/solid-start/building-your-application/api-routes#writing-an-api-route).

So instead of having `users.get.ts`, `users.post.ts`, `users.put.ts`, `users.delete.ts`, you can create `users.ts` and define all the methods in that single file. 

```ts
// index.ts
export const GET = eventHandler(() => 'get') // or default export

export const POST = eventHandler(() => 'post')

export const PUT = eventHandler(() => 'put')

export const DELETE = eventHandler(() => 'delete')
```

But you can still use suffixes like `.dev`, `.prod` and `.prerender` or even all the method-suffixes like `.post` and `.patch`, just as with regular nitro routes (files with a method suffix will only use the default export).
So this is fully compatible with your existing routes.



## Usage

```sh
npm install nitro-concise-routing
```

```ts
export default defineNitroConfig({
  modules: ['nitro-concise-routing'],
})
```

### With Nuxt

```ts
export default defineNuxtConfig({
  nitro: {
    modules: ['nitro-concise-routing'],
  },
})
```

## Configuration

```ts
export default defineNitroConfig({
  modules: ['nitro-concise-routing'],
  nitroConciseRouting: {
    // this is the default, if you specify this you will have to specify *all* desired methods
    exportsMapping: { 
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
    },
  },
})
```

## Why is this experimental?

Nitro does not support specifying handlers with exports other than `default` out of the box.
This modules changes that by overriding the rollup-plugin responsible for collecting all the handlers, and builds the route-types on its own.
Esentially this means that this module might very well break with future versions of Nitro.

This might be a thing that Nitro adds support for in the future, but for now, it requires some hefty workarounds.

## Other noteworthy things

The experimental `defineRouteMeta` is not supported by this module yet, as it would require a way to specify the method.
If you need this, feel free to open an issue or PR.
I though of something like this:
 
```ts
export const GET = eventHandler(() => 'get')
export const POST = eventHandler(() => 'post')

defineRouteMeta({
  openAPI: {...}
}, GET)

defineRouteMeta({
  openAPI: {...}
}, POST)
```