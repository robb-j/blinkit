#!/usr/bin/env node

require('dotenv').config()

const yargs = require('yargs')
const { runServer } = require('./server')

const debug = require('debug')('blinkit:cli')

debug('starting')

yargs.help().alias('h', 'help').demandCommand().recommendCommands()

yargs.command(
  'serve',
  'Run the blinkit server to control the led hat',
  (yargs) =>
    yargs.option('port', {
      type: 'number',
      describe: 'The port to run on',
      default: 3000,
    }),
  async (args) => {
    try {
      debug('serve')
      await runServer(args.port)
    } catch (error) {
      console.error(error)
      process.exit(1)
    }
  }
)

yargs.parse()
