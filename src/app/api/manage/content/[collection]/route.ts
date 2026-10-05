import { mutateContent } from '@/lib/content-management/mutations'

export async function POST(request: Request, context: { params: Promise<{ collection: string }> }) {
  const { collection } = await context.params
  return mutateContent(request, collection)
}
