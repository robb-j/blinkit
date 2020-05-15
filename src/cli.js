#!/usr/bin/env node

require('dotenv').config()

const yargs = require('yargs')
const { runServer } = require('./server')

yargs
  .help()
  .alias('h', 'help')
  .demandCommand()
  .recommendCommands()

yargs.command(
  'serve',
  '',
  yargs =>
    yargs.option('port', {
      type: 'number',
      describe: 'The port to run on',
      default: 3000
    }),
  async args => {
    try {
      await runServer(args.port)
    } catch (error) {}
  }
)

yargs.parse()
