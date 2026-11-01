import type { TrainerTopicSeed } from '../types'
import { sqlSelect } from './topics/01-select'
import { sqlWhere } from './topics/02-where'
import { sqlExpressions } from './topics/03-expressions'
import { sqlStrings } from './topics/04-strings'
import { sqlDates } from './topics/05-dates'
import { sqlGrouping } from './topics/06-grouping'
import { sqlSubqueries } from './topics/07-subqueries'
import { sqlJoins } from './topics/08-joins'
import { sqlUnion } from './topics/09-union'
import { sqlDml } from './topics/10-dml'
import { sqlDdl } from './topics/11-ddl'
import { sqlTransactions } from './topics/12-transactions'
import { sqlMeta } from './topics/13-meta'
import { sqlPractice } from './topics/14-practice'

/** Темы SQL идут в порядке разделов курса «SQL и PostgreSQL с нуля» (content/sql-course). */
export const SQL_TOPICS: readonly TrainerTopicSeed[] = [sqlSelect, sqlWhere, sqlExpressions, sqlStrings, sqlDates, sqlGrouping, sqlSubqueries, sqlJoins, sqlUnion, sqlDml, sqlDdl, sqlTransactions, sqlMeta, sqlPractice]
