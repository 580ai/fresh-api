import type { KnipConfig } from 'knip'

const config: KnipConfig = {
  ignore: ['classic/**', 'src/components/ui/**', 'src/routeTree.gen.ts'],
  ignoreDependencies: ['tailwindcss', 'tw-animate-css'],
}

export default config
