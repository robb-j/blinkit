const express = require('express')
const morgan = require('morgan')
const { validateEnv } = require('valid-env')
const { superstruct } = require('superstruct')
const pkg = require('../package.json')

const { RealGpio, TerminalGpio } = require('./gpio')

const debug = require('debug')('blinkit:server')

const { SECRET_KEY, FAKE_GPIO, NODE_ENV = 'development' } = process.env

const hexRegex = /^#[0-9a-f]{8}$/i

const struct = superstruct({
  types: {
    hex: str => hexRegex.test(str)
  }
})

async function shutdown(server, gpio, msg) {
  console.log(`${msg}, shutting down`)

  try {
    await gpio.teardown()

    await new Promise((resolve, reject) =>
      server.close(error => {
        if (error) reject(error)
        else resolve()
      })
    )
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    process.exit()
  }
}

async function runServer(port) {
  validateEnv(['SECRET_KEY'])

  debug(`#runServer NODE_ENV="${NODE_ENV}"`)

  const app = express()

  debug('#runServer setup app')
  app.set('trust proxy', true)
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))
  app.use(morgan('tiny'))

  const gpio = FAKE_GPIO === 'true' ? new TerminalGpio() : new RealGpio()

  debug(`using gpio="${gpio.constructor.name}"`)
  await gpio.setup()

  app.get('/', (req, res) => {
    res.send({
      pkg: { name: pkg.name, version: pkg.version },
      msg: 'ok'
    })
  })

  const LedPatch = struct({
    position: 'number',
    colour: 'string'
  })
  const LedPatches = struct.array([LedPatch])

  //
  // Get current led pixel values
  //
  app.get('/leds', async (req, res, next) => {
    try {
      res.send({ pixels: gpio.pixels })
    } catch (error) {
      next(error)
    }
  })

  //
  // Patch led pixels
  //
  let ledLock = false
  app.post('/leds', async (req, res, next) => {
    try {
      const hasAuthn = req.headers.authorization === SECRET_KEY
      debug(`set_leds hasAuthn=${hasAuthn} ledLock=${ledLock}`)

      if (!hasAuthn) return res.status(401).send({ msg: 'Not authorized' })

      if (ledLock) return res.status(400).send({ msg: 'Already running' })
      ledLock = true

      const [structError, patches] = LedPatches.validate(req.body)
      if (structError) return res.status(400).send({ msg: structError.message })

      debug('patches=%O', patches)

      await gpio.patchLeds(patches)

      res.send({ pixels: gpio.pixels })
    } catch (error) {
      next(error)
    } finally {
      ledLock = false
    }
  })

  //
  // Handle errors passed to next() functions
  //
  app.use((error, req, res, next) => {
    console.error(error)
    res.status(400).send({ msg: error.message })
  })

  //
  // Wait for the server to start and listen for signals to shutdown
  //
  await new Promise(resolve => {
    const server = app.listen(port, () => {
      console.log(`Listening on :${port}`)
      resolve()
    })

    process.on('SIGINT', () => shutdown(server, gpio, 'Received SIGINT'))
    process.on('SIGTERM', () => shutdown(server, gpio, 'Received SIGTERM'))
  })
}

module.exports = { runServer }
