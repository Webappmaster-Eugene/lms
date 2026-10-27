import { crc32 } from 'node:zlib'

/** Настоящий ZIP из одного файла без сжатия: Payload проверяет тип загрузки по содержимому. */
export function zipOf(name: string, content: string): Buffer {
  const data = Buffer.from(content)
  const file = Buffer.from(name)
  const crc = crc32(data)
  const local = Buffer.alloc(30)
  local.writeUInt32LE(0x04034b50, 0); local.writeUInt16LE(20, 4); local.writeUInt32LE(crc, 14)
  local.writeUInt32LE(data.length, 18); local.writeUInt32LE(data.length, 22); local.writeUInt16LE(file.length, 26)
  const central = Buffer.alloc(46)
  central.writeUInt32LE(0x02014b50, 0); central.writeUInt16LE(20, 4); central.writeUInt16LE(20, 6); central.writeUInt32LE(crc, 16)
  central.writeUInt32LE(data.length, 20); central.writeUInt32LE(data.length, 24); central.writeUInt16LE(file.length, 28)
  const end = Buffer.alloc(22)
  const centralOffset = local.length + file.length + data.length
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(1, 8); end.writeUInt16LE(1, 10)
  end.writeUInt32LE(central.length + file.length, 12); end.writeUInt32LE(centralOffset, 16)
  return Buffer.concat([local, file, data, central, file, end])
}
