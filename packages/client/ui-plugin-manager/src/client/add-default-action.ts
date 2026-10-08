/** One Client plugin action that can replace the Plugins page's primary add action. */
export interface PluginAddDefaultAction {
  /** Stable contributor identity, unique while registered. */
  readonly id: string
  /** Lower values take precedence when more than one action is registered. */
  readonly order: number
  /** Start the contributor's default add flow. */
  readonly onSelect: () => void
}

/** Registry shared by the Plugins page and opt-in add-action contributors. */
export interface PluginAddActions {
  /**
   * Register a primary add action and return its removal effect.
   * @param action - contributor identity, order, and action callback.
   * @returns a disposer for this registration.
   */
  register(action: PluginAddDefaultAction): () => void
  /**
   * Run the highest-priority action, or the existing installer when none is registered.
   * @param fallback - the existing installation dialog action.
   * @returns whether a registered action ran instead of the fallback.
   */
  runDefault(fallback: () => void): boolean
}

declare module '@deepseek-ai/cordis' {
  interface Context {
    /** Optional primary action for the Plugins page's Add plugin button. */
    pluginAddActions: PluginAddActions
  }
}

/**
 * Create a profile-local registry for opt-in primary add actions.
 * @returns the registration and dispatch interface.
 */
export function createPluginAddActions(): PluginAddActions {
  const actions = new Map<string, PluginAddDefaultAction>()
  return {
    register(action) {
      if (actions.has(action.id)) throw new Error(`Plugin add action is already registered: ${action.id}`)
      actions.set(action.id, action)
      return () => {
        if (actions.get(action.id) === action) actions.delete(action.id)
      }
    },
    runDefault(fallback) {
      const action = [...actions.values()].sort((left, right) => left.order - right.order)[0]
      if (action === undefined) {
        fallback()
        return false
      }
      action.onSelect()
      return true
    },
  }
}
