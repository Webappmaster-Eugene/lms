import type { Payload } from 'payload'

/** No external I/O at startup: these editable tracks also support future languages. */
export async function bootstrapInterviewDirections(payload: Payload): Promise<void> {
  for (const [slug, title, description, order] of [
    ['react', 'React.js · Frontend', 'JavaScript, React и разработка интерфейсов', 0],
    ['nodejs', 'Node.js · Backend', 'JavaScript, Node.js и серверная разработка', 1],
  ] as const) {
    const existing = await payload.find({ collection: 'interview-directions', where: { slug: { equals: slug } }, limit: 1, depth: 0, overrideAccess: true })
    if (!existing.totalDocs) await payload.create({ collection: 'interview-directions', data: { slug, title, description, order }, overrideAccess: true })
  }
}
