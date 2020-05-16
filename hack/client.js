#!/usr/bin/env node

require('dotenv').config()

const path = require('path')
const got = require('got')
const yargs = require('yargs')
const fse = require('fs-extra')
const { validateEnv } = require('valid-env')

const hex = num => '#' + num.toString(16)
const pause = ms => new Promise(resolve => setTimeout(resolve, ms))

validateEnv(['SECRET_KEY'])

const PATCH_DIR = path.join(__dirname, 'patches')

const client = got.extend({
  prefixUrl: 'http://eclair.local:3000/leds',
  headers: {
    Authorization: process.env.SECRET_KEY
  }
})

function patch(json) {
  return client.post('', { json }).then(() => pause(50))
}

function patchAll(colour) {
  return patch([
    { position: 0, colour },
    { position: 1, colour },
    { position: 2, colour },
    { position: 3, colour },
    { position: 4, colour },
    { position: 5, colour },
    { position: 6, colour },
    { position: 7, colour }
  ])
}

yargs
  .help()
  .alias('h', 'help')
  .demandCommand()
  .recommendCommands()
  .strict()

yargs.command(
  'pulse',
  'Pulse a rainbow',
  yargs => yargs,
  async args => {
    try {
      const off = hex(0x00000000)
      const red = hex(0xff000027)
      const green = hex(0x00ff0027)
      const blue = hex(0x0000ff27)

      const colours = [red, green, blue]

      await patchAll(off)

      let current = 0

      await patch([{ position: 0, colour: colours[current] }])

      for (let i = 1; i < 8; i++) {
        current = (current + 1) % colours.length

        await patch([
          { position: i - 1, colour: off },
          { position: i, colour: colours[current] }
        ])
      }

      await patch([{ position: 7, colour: off }])

      for (let i = 6; i >= 0; i--) {
        current = (current + 1) % colours.length

        await patch([
          { position: i + 1, colour: off },
          { position: i, colour: colours[current] }
        ])
      }

      await patch([{ position: 0, colour: off }])
    } catch (error) {
      console.error(error)
      process.exit(1)
    }
  }
)

yargs.command(
  'patch [file]',
  'Send a specific patch',
  yargs =>
    yargs.positional('file', {
      type: 'string',
      describe: 'The patch file',
      required: false
    }),
  async args => {
    try {
      if (!args.file) {
        const contents = fse.readdirSync(PATCH_DIR)
        console.log('Available patches:')
        for (const file of contents) {
          console.log(' -', file.replace('.json', ''))
        }
        return
      }

      const patchPath = path.join(PATCH_DIR, args.file + '.json')
      const isMissing = !fse.existsSync(patchPath)

      if (isMissing) throw new Error('Patch not found: "' + args.file + '"')

      const toApply = fse.readJSONSync(patchPath)

      await patch(toApply)
    } catch (error) {
      console.error(error)
      process.exit(1)
    }
  }
)

yargs.command(
  'tick',
  '',
  yargs =>
    yargs
      .option('colour', {
        type: 'string',
        describe: 'The colour to tick tock in',
        default: 'ffffff25'
      })
      .option('interval', {
        type: 'number',
        describe: 'How many ms to tick',
        default: 1000
      })
      .option('pause', {
        type: 'number',
        describe: 'How long to stay lit',
        default: 0
      }),
  async args => {
    try {
      const hex = parseInt(args.colour, 16)
      if (Number.isNaN(hex) || args.colour.length !== 8) {
        throw new Error(`'${args.colour}' is not an 8 digit hex`)
      }

      let on = false
      setInterval(async () => {
        on = !on

        const colour = '#' + (on ? args.colour : '00000000')

        await patchAll(colour)

        if (args.pause > 0) {
          await pause(args.pause)
          on = !on
          await patchAll('00000000')
        }
      }, args.interval)

      const reset = async () => {
        await patchAll('00000000')
        process.exit(1)
      }

      process.on('SIGTERM', () => reset())
      process.on('SIGINT', () => reset())
    } catch (error) {
      console.error(error)
      process.exit(1)
    }
  }
)

yargs.command(
  'off',
  'Turn off all leds',
  yargs => yargs,
  async args => patchAll('00000000')
)

yargs.parse()
