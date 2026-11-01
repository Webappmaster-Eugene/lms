/** Полный каталог для сида, скриптов и тестов. Код приложения берёт `./core`: там нет SQL. */

import { TRAINER_CORE_CATALOG } from './core'
import { enrichTrainerMetadata } from './enrich-metadata'
import { SQL_TOPICS } from './sql'
import type { TrainerTopicSeed } from './types'

export const TRAINER_CATALOG: readonly TrainerTopicSeed[] = [...TRAINER_CORE_CATALOG, ...SQL_TOPICS.map((topic) => enrichTrainerMetadata(topic))]

export { flattenCatalog } from './types'
export type { TrainerTaskSeed, TrainerTopicSeed } from './types'
