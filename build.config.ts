import { defineBuildConfig } from 'unbuild'

export default defineBuildConfig([
  {
    declaration: true,
    externals: ['nitro-concise-routing'],
    failOnWarn: false,
  },
])
