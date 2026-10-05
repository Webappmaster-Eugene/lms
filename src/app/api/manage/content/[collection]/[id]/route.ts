import { mutateContent } from '@/lib/content-management/mutations'

export async function PATCH(request: Request, context: { params: Promise<{ collection: string; id: string }> }) {
  const { collection, id } = await context.params
  return mutateContent(request, collection, id)
}
