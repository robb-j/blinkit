//
// A class to control the blinkt led hat and a class to fake it in the terminal
// - https://pinout.xyz/pinout/blinkt#
// - https://developer.mozilla.org/en-US/docs/Web/JavaScript/Reference/Operators/Bitwise_Operators#Bitwise_OR
//

const { Gpio } = require('onoff')
const chalk = require('chalk')
const debug = require('debug')('blinkit:gpio')

const DATA_PIN = 23
const CLOCK_PIN = 24

//
// Because javascript doesn't have interfaces
//
class AbstractGpio {
  setup() {}
  teardown() {}
  patchLeds() {}
}

/** Parse a '#aabbccdd' hex into an integer */
function hexToInteger(hex8) {
  const number = parseInt(hex8.slice(1), 16)
  debug(`#hexToNumber input="${hex8}" output=${number}`)
  return number
}

/** Create a rgba pixel array of 0s */
function createPixels() {
  return new Array(8).fill(0x00000000)
}

/**
 * Apply patches to an array of pixels
 * - skip out-of-bound patches (negative or > 7)
 * - clamp colour componentss into 0-255
 *
 * @param {number[]} pixels The pixels to overwrite
 * @param {{position: number, colour: string}[]} patches The patches to apply
 */
function applyPatches(pixels, patches) {
  const result = Array.from(pixels)

  for (const patch of patches) {
    if (patch.position < 0 || patch.position > 7) continue
    result[patch.position] = hexToInteger(patch.colour)
  }

  const r = (arr) => arr.map((v) => v.toString(16))
  debug('#applyPatches input=%o output=%o', r(pixels), r(result))

  return result
}

/**
 * Dump pixels to stdout
 * @param {number[]} pixels The pixels to output
 */
function dumpPixels(pixels) {
  process.stdout.write('[LED] ')
  for (const pixel of pixels) {
    const hex = pixel.toString(16).padStart(8, '0').slice(0, -2)

    process.stdout.write(chalk.hex(hex)('██') + ' ')
  }
  process.stdout.write('\n')
}

/**
 * Convert an 8bit alpha component to 4bit
 * @param {number} input The alpha number
 */
function byteToAlphaNibble(input) {
  return 0b11100000 | ((input >>> 3) & 0b00011111)
}

/** A class for interacting with live GPIO pins */
class RealGpio extends AbstractGpio {
  setup() {
    debug('#setup')
    this.pixels = createPixels()
    this.data = new Gpio(DATA_PIN, 'out')
    this.clock = new Gpio(CLOCK_PIN, 'out')
  }

  teardown() {
    debug('#teardown')
    delete this.pixels
    this.data.unexport()
    this.clock.unexport()
  }

  /**
   * Send a series of on-off commands to the clock pin
   * @param {number} pulses How many pulses to send
   */
  pulse(pulses) {
    this.data.writeSync(0)
    for (let i = 0; i < pulses; i++) {
      this.clock.writeSync(1)
      this.clock.writeSync(0)
    }
  }

  /**
   * Write a byte of data to the gpio using the data and clock pins
   * @param {number} byte The number to write 8 bits to the data pin to
   */
  writeByte(byte) {
    debug(`#writeByte byte=${byte.toString(2).padStart(8, '0')}`)

    for (let i = 0; i < 8; i++) {
      const bit = (byte >>> (7 - i)) & 1

      this.data.writeSync(bit)
      this.clock.writeSync(1)
      this.clock.writeSync(0)
    }
  }

  /**
   * Apply a series of patches and output them to the gpio
   * @param {{position: number, colour: string}[]} patches The patches to apply
   */
  patchLeds(patches) {
    this.pixels = applyPatches(this.pixels, patches)

    debug('#patchLeds pixels=%o', this.pixels)

    // Send the start-of-file command
    this.pulse(32)

    // write each pixel
    for (const pixel of this.pixels) {
      // Grab the components out of the byte
      const a = (pixel >>> 0) & 0xff
      const b = (pixel >>> 8) & 0xff
      const g = (pixel >>> 16) & 0xff
      const r = (pixel >>> 24) & 0xff

      // Write the components in turn
      this.writeByte(byteToAlphaNibble(a))
      this.writeByte(b)
      this.writeByte(g)
      this.writeByte(r)
    }

    // Send the end-of-file command
    this.pulse(36)
  }
}

/** A faked gpio instance that outputs to the terminal instead */
class TerminalGpio extends AbstractGpio {
  setup() {
    this.pixels = createPixels()
  }

  teardown() {
    delete this.pixels
  }

  patchLeds(patches) {
    this.pixels = applyPatches(this.pixels, patches)
    dumpPixels(this.pixels)
  }
}

module.exports = { RealGpio, TerminalGpio }
