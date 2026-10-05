import { LinkNode, type SerializedLinkNode } from '@payloadcms/richtext-lexical/lexical/link'
import { $applyNodeReplacement, type NodeKey } from '@payloadcms/richtext-lexical/lexical'

type SavedLink = SerializedLinkNode & {
  fields?: { linkType: string; newTab: boolean; url?: string; [key: string]: unknown }
  id?: string
}

/** Payload stores link attributes in fields instead of Lexical's url property. */
export class ContentLinkNode extends LinkNode {
  __saved: SavedLink | undefined

  constructor(url: string, key?: NodeKey, saved?: SavedLink) {
    super(url, { target: saved?.fields?.newTab ? '_blank' : null, rel: saved?.fields?.newTab ? 'noopener noreferrer' : null }, key)
    this.__saved = saved
  }

  static getType(): string { return 'content-link' }
  static clone(node: ContentLinkNode): ContentLinkNode {
    return new ContentLinkNode(node.__url, node.__key, node.__saved)
  }

  static importJSON(saved: SavedLink): ContentLinkNode {
    const node = $applyNodeReplacement(new ContentLinkNode(saved.fields?.url ?? saved.url ?? '', undefined, saved))
    return node.updateFromJSON({ ...saved, url: saved.fields?.url ?? saved.url ?? '', target: saved.fields?.newTab ? '_blank' : null, rel: saved.fields?.newTab ? 'noopener noreferrer' : null })
  }

  exportJSON(): SavedLink {
    const saved = this.getLatest().__saved
    const standard = super.exportJSON()
    const { url, target, rel, title, ...element } = standard
    void target
    void rel
    void title
    return {
      ...element,
      type: 'content-link',
      version: saved?.version ?? 3,
      ...(saved?.id ? { id: saved.id } : {}),
      fields: { ...saved?.fields, linkType: 'custom', newTab: saved?.fields?.newTab ?? false, url },
    } as SavedLink
  }
}
