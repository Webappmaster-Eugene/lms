/**
 * Каталог задач тренажёра.
 *
 * Темы идут в том порядке, в котором их разумно проходить: от устройства языка
 * к типовым реализациям, дальше алгоритмы, LeetCode, задачи конкретных компаний
 * и TypeScript.
 */

import type { TrainerTopicSeed } from './types'

import { jsCore } from './01-js-core'
import { hof } from './02-hof'
import { asyncTopic } from './03-async'
import { collections } from './04-collections'
import { arrayPolyfills } from './05-array-polyfills'
import { functionPolyfills } from './06-function-polyfills'
import { strings } from './07-strings'
import { dataStructures } from './08-data-structures'
import { algorithms } from './09-algorithms'
import { leetcodeEasy } from './10-leetcode-easy'
import { leetcodeMedium } from './11-leetcode-medium'
import { leetcodeHard } from './12-leetcode-hard'
import { companies } from './13-companies'
import { patterns } from './14-patterns'
import { typescriptTypes } from './15-typescript-types'
import { typescriptApplied } from './16-typescript-applied'
import { webApi } from './17-web-api'

export const TRAINER_CATALOG: readonly TrainerTopicSeed[] = [jsCore, hof, asyncTopic, collections, arrayPolyfills, functionPolyfills, strings, dataStructures, algorithms, leetcodeEasy, leetcodeMedium, leetcodeHard, companies, patterns, typescriptTypes, typescriptApplied, webApi]

export { flattenCatalog } from './types'
export type { TrainerTaskSeed, TrainerTopicSeed } from './types'
