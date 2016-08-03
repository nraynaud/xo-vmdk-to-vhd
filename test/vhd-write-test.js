'use strict'

import {assert} from 'chai'
import {describe, it} from 'mocha'
import {readFile} from 'fs-promise'
import {createWriteStream} from 'fs'
import {exec} from 'child-process-promise'
import {
  createFooter,
  createDynamicDiskHeader,
  computeChecksum,
  computeGeometryForSize,
  ReadableRawVHDStream,
  VHDFile
} from '../src/vhd-write'

describe('VHD writing', function () {
  it('computeChecksum() is correct against some reference values', () => {
    // those values were taken from a file generated by qemu
    const testValue1 = '636F6E6563746978000000020001000000000000000002001F34DB9F71656D75000500035769326B0000000000019800000000000001980000030411000000030000000033B3A5E17F94433498376740246E5660'
    const expectedChecksum1 = 0xFFFFEFB2
    const testValue2 = '6378737061727365FFFFFFFFFFFFFFFF0000000000000600000100000000000100200000'
    const expectedChecksum2 = 0xFFFFF476
    assert.equal(computeChecksum(new Buffer(testValue1, 'hex')), expectedChecksum1)
    assert.equal(computeChecksum(new Buffer(testValue2, 'hex')), expectedChecksum2)
  })
  it('createFooter() does not crash', () => {
    createFooter(104448, Math.floor(Date.now() / 1000), {cylinders: 3, heads: 4, sectorsPerTrack: 17})
  })
  it('createDynamicDiskHeader() does not crash', () => {
    createDynamicDiskHeader(1, 0x00200000)
  })
  it('ReadableRawVHDStream does not crash', async () => {
    const data = [{
      lbaBytes: 100,
      grain: new Buffer('azerzaerazeraze', 'ascii')
    }, {
      offset: 700,
      grain: new Buffer('gdfslkdfguer', 'ascii')
    }]
    let index = 0
    const mockParser = {
      next: async () => {
        if (index < data.length) {
          const promise = await new Promise((resolve) => {
            resolve(data[index])
          })
          index++
          return promise
        } else {
          return null
        }
      }
    }
    const stream = new ReadableRawVHDStream(100000, mockParser)
    const pipe = stream.pipe(createWriteStream('outputStream'))
    await new Promise((resolve, reject) => {
      pipe.on('finish', resolve)
      pipe.on('error', reject)
    })
  })
  it('writing a known file is successful', async () => {
    const fileName = 'output.vhd'
    const rawFilename = 'output.raw'
    const randomFileName = 'random.raw'
    const geometry = computeGeometryForSize(1024 * 1024 * 8)
    const dataSize = geometry.actualSize
    await exec('base64 /dev/urandom | head -c ' + dataSize + ' > ' + randomFileName)
    const buffer = await readFile(randomFileName)
    const f = new VHDFile(buffer.length, 523557791)
    const splitPoint = Math.floor(Math.random() * buffer.length)
    f.writeBuffer(buffer.slice(splitPoint), splitPoint)
    f.writeBuffer(buffer.slice(0, splitPoint), 0)
    f.writeBuffer(buffer.slice(splitPoint), splitPoint)
    await f.writeFile(fileName)
    await exec('qemu-img convert -fvpc -Oraw ' + fileName + ' ' + rawFilename)
    const fileContent = await readFile(rawFilename)
    assert.equal(fileContent.length, dataSize)
    for (let i = 0; i < fileContent.length; i++) {
      if (fileContent[i] !== buffer[i]) {
        assert.fail(fileContent[i], 0)
      }
    }
  })
})