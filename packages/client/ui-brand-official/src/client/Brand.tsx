import { BrandWordmark, FishLogo } from '@deepseek-ai/dsh-client-ui-primitives'
import type { SidebarBrandMarkOwnerProps } from '@deepseek-ai/dsh-client-ui-sidebar/client'

/**
 * Render the selected brand mark with the presentation requested by its host surface.
 * @param props - Host-supplied mark presentation.
 * @returns the selected mark or the official whale fallback.
 */
export function OfficialBrandMark({ size }: SidebarBrandMarkOwnerProps) {
  const brandMark = process.env.DSH_CLIENT_BRAND_MARK
  if (brandMark !== undefined) {
    const style = {
      display: 'block',
      width: size,
      height: (size * 17.04) / 23.16,
      backgroundColor: 'currentColor',
      maskImage: `url("${brandMark}")`,
      maskPosition: 'center',
      maskRepeat: 'no-repeat',
      maskSize: 'contain',
      WebkitMaskImage: `url("${brandMark}")`,
      WebkitMaskPosition: 'center',
      WebkitMaskRepeat: 'no-repeat',
      WebkitMaskSize: 'contain',
    } as const
    return <span aria-hidden="true" style={style} />
  }
  return <FishLogo size={size} />
}

/**
 * Render an environment-selected brand name or the official name artwork.
 * @returns the configured brand name, or the official wordmark when no name is configured.
 */
export function OfficialBrandName() {
  const brandName = process.env.DSH_CLIENT_BRAND_NAME
  if (brandName !== undefined) return <span>{brandName}</span>
  return <BrandWordmark includeMark={false} />
}
