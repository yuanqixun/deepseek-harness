/** Private plugin bundles included by opted-in Desktop packages. */

import { PROFILE_TEMPLATES } from '@deepseek-ai/dsh-app-boot'

/** Profile bundles that Desktop can seed when their packages are present in the runtime. */
export const PREINSTALLED_PLUGIN_BUNDLES = [
  'dsh-pro-auth',
  '@deepseek-ai/dsh-private-market',
] as const

/** Build the Web profile bundle list for the package set selected for this Desktop runtime. */
export function desktopProfileBundles(packageNames: readonly string[]): string[] {
  const available = new Set(packageNames)
  const webBundles = PROFILE_TEMPLATES.web?.bundles
  if (webBundles === undefined) throw new Error('desktop profile: Web profile template is missing')
  return [
    ...webBundles,
    ...PREINSTALLED_PLUGIN_BUNDLES.filter(name => available.has(name)),
  ]
}
