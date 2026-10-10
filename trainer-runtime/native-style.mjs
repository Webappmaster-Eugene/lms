/** Computed styles must come from Chromium, outside the student's JS realm. */
export function createNativeStyleReader(context, page, iframeSelector = '#solution') {
  let session
  let documentId
  let frameId
  let isolatedContextId
  const connect = async () => {
    const element = await page.locator(iframeSelector).elementHandle()
    const frame = await element?.contentFrame()
    if (!frame) throw new Error('Не найден iframe решения')
    let frameSession = true
    try { session = await context.newCDPSession(frame) } catch { frameSession = false; session = await context.newCDPSession(page) }
    await session.send('DOM.enable')
    await session.send('CSS.enable')
    const { root } = await session.send('DOM.getDocument', { depth: 0, pierce: true })
    if (frameSession) {
      documentId = root.nodeId
      const { frameTree } = await session.send('Page.getFrameTree')
      frameId = frameTree.frame.id
    }
    else {
      const { nodeId } = await session.send('DOM.querySelector', { nodeId: root.nodeId, selector: iframeSelector })
      const { node } = await session.send('DOM.describeNode', { nodeId, depth: 1, pierce: true })
      frameId = node.frameId
      documentId = node.contentDocument?.nodeId
      if (!documentId && node.contentDocument?.backendNodeId) {
        const { nodeIds } = await session.send('DOM.pushNodesByBackendIdsToFrontend', { backendNodeIds: [node.contentDocument.backendNodeId] })
        documentId = nodeIds[0]
      }
      if (!documentId) throw new Error('Не найден DOM iframe решения')
    }
  }
  return async (selector, property) => {
    const read = async () => {
      if (!session) await connect()
      const { nodeId } = await session.send('DOM.querySelector', { nodeId: documentId, selector })
      if (!nodeId) return undefined
      const { computedStyle } = await session.send('CSS.getComputedStyleForNode', { nodeId })
      const direct = computedStyle.find((style) => style.name === property)
      if (direct) return direct.value
      // Shorthands are omitted from CSS.getComputedStyleForNode. A separate realm
      // keeps the browser's native getter while sharing only the student's DOM.
      if (isolatedContextId === undefined) {
        const world = await session.send('Page.createIsolatedWorld', { frameId, worldName: 'trainer-native-css', grantUniveralAccess: false })
        isolatedContextId = world.executionContextId
      }
      const value = await session.send('Runtime.callFunctionOn', {
        executionContextId: isolatedContextId, returnByValue: true,
        functionDeclaration: 'function(selector, property) { const element = document.querySelector(selector); return element ? getComputedStyle(element).getPropertyValue(property) : undefined }',
        arguments: [{ value: selector }, { value: property }],
      })
      if (value.exceptionDetails) throw new Error('Не удалось прочитать CSS в изолированном контексте')
      return typeof value.result.value === 'string' ? value.result.value : undefined
    }
    try { return await read() } catch {
      // A full document navigation invalidates CDP node IDs and frame sessions.
      if (session) await session.detach().catch(() => {})
      session = undefined
      documentId = undefined
      frameId = undefined
      isolatedContextId = undefined
      return read()
    }
  }
}
