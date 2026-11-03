import type { APIRoute } from 'astro'

import { coursesFeed } from '../data/courses-feed'

/** Фид курсов для Вебмастера: собирается при сборке, как sitemap.xml, и не расходится со страницей. */
export const GET: APIRoute = () => new Response(coursesFeed(), { headers: { 'Content-Type': 'application/xml; charset=utf-8' } })
