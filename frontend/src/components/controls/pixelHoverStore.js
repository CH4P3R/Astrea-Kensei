// Isolate pointer updates from the workspace and its Three scene.
export function createPixelHoverStore() {
  let snapshot = null
  const listeners = new Set()
  return {
    getSnapshot: () => snapshot,
    subscribe(listener) { listeners.add(listener); return () => listeners.delete(listener) },
    publish(next, sourceId) {
      // An outgoing comparison frame must not clear a newer frame's tooltip.
      if (!next && sourceId && snapshot?.active.metadata.id !== sourceId) return
      if (snapshot === next) return
      snapshot = next
      listeners.forEach((listener) => listener())
    },
  }
}
