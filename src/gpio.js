const { Gpio } = require('onoff')
const debug = require('debug')('omni:gpio')

//
// https://pinout.xyz/pinout/blinkt#
//

const DATA_PIN = 23
const CLOCK_PIN = 24
// const HEX8_MAX = 0xffffffff
// const MIN_BRIGHTNESS_MASK = 0xE0

class AbstractGpio {
  async setup() {}
  async teardown() {}
  async patchLeds() {}
}

// useful: https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Bitwise_OR

//
// ??? (0xFFFFFFFF | 0xE0000000).toString(16) ???
//
// https://stackoverflow.com/questions/307179
//
// ??? https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Global_Objects/BigInt ???
//

function hexToNumber(hex8) {
  const rgb = hex8.slice(1, -2)
  const alpha = hex8.slice(-2)
  const number = parseInt(alpha + rgb, 16)
  debug(`#hexToNumber input="${hex8}" output=${number}`)
  return number
}

//
// Can't store 8 character hex in 32bit 2s compliment? :'(
//

// function parseHex(hex8) {
//   const r = parseInt(hex8.slice(1, 3), 16)
//   const g = parseInt(hex8.slice(3, 5), 16)
//   const b = parseInt(hex8.slice(5, 7), 16)
//   const a = parseInt(hex8.slice(7, 9), 16)
//   return { r, g, b, a }
// }

function createPixels() {
  return new Array(8).fill(0x00000000)
}

// Apply patches to an array of pixels
// - skip out-of-bound patches (negative or > 7)
// - clamp colours into allowed values
function applyPatches(pixels, patches) {
  const result = Array.from(pixels)

  for (const patch of patches) {
    if (patch.position < 0 || patch.position > 7) continue
    result[patch.position] = hexToNumber(patch.colour)
  }

  debug('#applyPatches input=%o output=%o', pixels, result)

  return result
}

// Output pixels to stdout for inspection
function dumpPixels(pixels) {
  console.log('LED_DUMP')
  for (const pixel of pixels) {
    const hex = pixel.toString(16).padStart(8, '0')
    process.stdout.write(`#${hex} `)
  }
  console.log()
}

class RealGpio extends AbstractGpio {
  async setup() {
    debug('#setup')
    this.pixels = createPixels()
    this.data = new Gpio(DATA_PIN, 'out')
    this.clock = new Gpio(CLOCK_PIN, 'out')
  }

  async teardown() {
    debug('#teardown')
    delete this.pixels
    this.data.unexport()
    this.clock.unexport()
  }

  writeByte(byte, numBits) {
    debug(`#writeByte byte=${byte.toString(2)} numBits=${numBits}`)

    for (let i = 0; i < numBits; i++) {
      const bit = (byte >>> i) & 1

      debug(`#writeByte bit=${bit}`)

      // big endian or little endian ?? ...

      this.data.writeSync(bit)
      this.clock.writeSync(1)
      this.clock.writeSync(0)
    }
  }

  // ref: https://github.com/Irrelon/node-blinkt/blob/master/src/Blinkt.js#L134
  async patchLeds(patches) {
    this.pixels = applyPatches(this.pixels, patches)

    debug('#patchLeds pixels=%o', this.pixels)

    // reset code ?
    this.writeByte(0, 32)

    // write each pixel
    for (const pixel of this.pixels) {
      this.writeByte(pixel, 32)
    }

    // finish code ?
    this.writeByte(0xff, 8)

    // latch?
    this.data.writeSync(0)
    for (let i = 0; i < 36; i++) {
      this.clock.writeSync(1)
      this.clock.writeSync(0)
    }
  }
}

class TerminalGpio extends AbstractGpio {
  async setup() {
    this.pixels = createPixels()
  }

  async teardown() {
    delete this.pixels
  }

  async patchLeds(patches) {
    this.pixels = applyPatches(this.pixels, patches)
    dumpPixels(this.pixels)
  }
}

module.exports = { RealGpio, TerminalGpio }
