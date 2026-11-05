import { zipFiles } from './zip'

/** Анкета, которую сервер принимает: длинная, связная, проблема и история разные. */
export const LEAD_ANSWERS = {
  name: 'Иван',
  telegram: '@ivan_petrov',
  reason: 'switch-or-grow',
  problem: 'Третий месяц ищу работу backend-разработчиком, откликаюсь на вакансии, но после технического интервью получаю отказы. Пробовал учить алгоритмы сам, результата пока нет.',
  story: 'Пять лет работал фронтенд-разработчиком в небольшой студии, писал на React и TypeScript. Хочу перейти на Node.js, за последние два месяца было сорок откликов и три собеседования.',
  goal: 'Через шесть месяцев получить оффер на backend',
  urgency: 'soon',
  hoursPerWeek: '10-20',
  fillMs: '20000',
}

/** Как браузер собирает форму заявки: флажок приходит как on, метки рекламы отдельными полями. */
export function leadFormData(body: Record<string, unknown> | undefined, resume?: File): FormData {
  const form = new FormData()
  for (const [key, value] of Object.entries(body ?? {})) {
    if (key === 'consent') {
      if (value) form.set('consent', 'on')
    } else if (key === 'utm') {
      for (const [mark, text] of Object.entries(value as Record<string, unknown>)) form.set(mark, String(text))
    } else if (value !== undefined) {
      form.set(key, String(value))
    }
  }
  if (resume) form.set('resume', resume)
  return form
}

/** Маленький, но правильный PDF: Payload сверяет заголовок, таблицу объектов и конец файла. */
export const LEAD_PDF = [
  '%PDF-1.4',
  '1 0 obj',
  '<< /Type /Catalog /Pages 2 0 R >>',
  'endobj',
  '2 0 obj',
  '<< /Type /Pages /Kids [] /Count 0 >>',
  'endobj',
  'xref',
  '0 3',
  '0000000000 65535 f ',
  '0000000009 00000 n ',
  '0000000058 00000 n ',
  'trailer',
  '<< /Size 3 /Root 1 0 R >>',
  'startxref',
  '110',
  '%%EOF',
  '',
].join('\n')

const DOCX_PARTS = {
  '[Content_Types].xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>',
  '_rels/.rels': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>',
  'word/document.xml': '<?xml version="1.0" encoding="UTF-8" standalone="yes"?><w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body><w:p><w:r><w:t>Резюме</w:t></w:r></w:p></w:body></w:document>',
}

/** Состав как у файла из Word: без [Content_Types].xml такой файл не считается документом. */
export const LEAD_DOCX = zipFiles(DOCX_PARTS)
/** Word Online называет основную часть иначе: она задана в [Content_Types].xml, а не именем файла. */
export const LEAD_DOCX_WORD_ONLINE = zipFiles({
  '[Content_Types].xml': DOCX_PARTS['[Content_Types].xml'].replace('/word/document.xml', '/word/document2.xml'),
  '_rels/.rels': DOCX_PARTS['_rels/.rels'].replace('word/document.xml', 'word/document2.xml'),
  'word/document2.xml': DOCX_PARTS['word/document.xml'],
})
/** Документ с макросами: расширение и основной текст те же, поэтому отличить можно только по составу. */
export const LEAD_DOCX_WITH_MACROS = zipFiles({ ...DOCX_PARTS, 'word/vbaProject.bin': 'макрос' })

/** Почти на предел: маленькая фикстура не покажет ограничений сервера и прокси по размеру тела. */
export const LEAD_PDF_NEAR_LIMIT = `%PDF-1.4\n%${'x'.repeat(4_900_000)}\n${LEAD_PDF.slice('%PDF-1.4\n'.length)}`
