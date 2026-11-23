export function blankPDF(pageCount = 1, width = 100, height = 100): Buffer {
  const pages = Array.from({ length: pageCount }, () => `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 ${width} ${height}] >>`)
  const kids = pages.map((_, index) => `${index + 3} 0 R`).join(' ')
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', `<< /Type /Pages /Kids [${kids}] /Count ${pageCount} >>`, ...pages]
  let text = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => {
    const offset = Buffer.byteLength(text)
    text += `${index + 1} 0 obj\n${object}\nendobj\n`
    return offset
  })
  const start = Buffer.byteLength(text)
  const total = objects.length + 1
  text += `xref\n0 ${total}\n0000000000 65535 f \n${offsets.map(offset => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size ${total} /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
  return Buffer.from(text)
}
