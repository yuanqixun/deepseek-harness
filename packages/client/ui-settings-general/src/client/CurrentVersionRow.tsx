/** Installed release version and Desktop version-dialog entry in General Settings. */
import { Button } from '@deepseek-ai/dsh-client-ui-primitives'
import type { InjectFace, PropsLocale, PropsRuntime } from '@deepseek-ai/dsh-client-ui-slots'
import css from './CurrentVersionRow.module.css'

/** Shell action for opening the Desktop version and release-history dialog. */
export interface CurrentVersionRowInjected {
  /** Whether the Desktop preload can open the version dialog. */
  readonly aboutAvailable: boolean
  /** Open the shell-owned version and release-history dialog. */
  openAbout(): void
}

/**
 * Render the build version and show the shell dialog action when Desktop provides it.
 * @param props - runtime share, localized copy, and optional Desktop dialog action.
 * @returns the version row, or nothing when build metadata is absent.
 */
export function CurrentVersionRow({ t, aboutAvailable, openAbout }:
  PropsRuntime<'settings.general.item'> & PropsLocale<'settings'> & InjectFace<CurrentVersionRowInjected>) {
  const version = process.env.DSH_CLIENT_VERSION
  if (version === undefined) return null
  return <div className={css.row}>
    <span className={css.version}>{t('general.currentVersion', { version })}</span>
    {aboutAvailable && <Button className={css.action} variant="outline" size="sm" onClick={openAbout}>
      {t('general.versionAndUpdates')}
    </Button>}
  </div>
}
