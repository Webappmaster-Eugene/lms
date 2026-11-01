// Запускается при сборке образа: initdb внутри задания требует больше памяти,
// чем лимит контейнера, а готовый каталог открывается за доли секунды.
import { writeFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'

const target = process.argv[2]
if (!target) throw new Error('Укажите путь для каталога данных')
const db = new PGlite()
await db.waitReady
const dump = await db.dumpDataDir('none')
await writeFile(target, Buffer.from(await dump.arrayBuffer()))
await db.close()
