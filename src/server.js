const http = require('http')
const express = require('express')
const ws = require('ws')
const morgan = require('morgan')
const { validateEnv } = require('valid-env')
const { superstruct } = require('superstruct')
const pkg = require('../package.json')

const { RealGpio, TerminalGpio } = require('./gpio')

const debug = require('debug')('blinkit:server')

//
// Extract environment variables
//
const {
  SECRET_KEY,
  FAKE_GPIO = 'false',
  ACCESS_LOGS = 'false',
  NODE_ENV = 'development',
} = process.env

/** A regex to test for hex8s */
const hexRegex = /^#[0-9a-f]{8}$/i

/** Wrap setTimout in a promise */
const pause = (ms) => new Promise((resolve) => setTimeout(resolve, ms))

/** A utility to generate a patch to set all leds to a colour */
const setAllLeds = (colour) => [
  { position: 0, colour: colour },
  { position: 1, colour: colour },
  { position: 2, colour: colour },
  { position: 3, colour: colour },
  { position: 4, colour: colour },
  { position: 5, colour: colour },
  { position: 6, colour: colour },
  { position: 7, colour: colour },
]

const struct = superstruct({
  types: {
    hex: (str) => hexRegex.test(str),
  },
})

/** A struct to test for an led patch */
const LedPatch = struct({
  position: 'number',
  colour: 'hex',
})

/** A struct to test for an array of led patches */
const LedPatches = struct.array([LedPatch])

/** Shutdown the server, disconnect gpio and terminate the socket server */
async function shutdown(server, gpio, wss, msg) {
  console.log(`${msg}, shutting down`)

  try {
    debug('flash red')
    await gpio.patchLeds(setAllLeds('#ff000010'))
    await pause(200)
    await gpio.patchLeds(setAllLeds('#00000000'))

    debug('disconnect gpio')
    await gpio.teardown()

    debug('close websocket server')
    await new Promise((resolve, reject) => {
      wss.close((err) => (err ? reject(err) : resolve()))
    })

    debug('shut down server')
    await new Promise((resolve, reject) =>
      server.close((err) => (err ? reject(err) : resolve()))
    )
  } catch (error) {
    console.error(error)
    process.exitCode = 1
  } finally {
    process.exit()
  }
}

/** Run an led animation to show the server has turned on */
async function startupBlink(gpio, colour = '#ffffff10') {
  for (let i = 0; i < 8; i++) {
    await pause(10)
    await gpio.patchLeds([{ position: i, colour }])
  }
  await pause(150)
  await gpio.patchLeds(setAllLeds('#00000000'))
}

/** Create our express server which controls gpio */
function createApp(gpio) {
  const app = express()

  debug('#runServer setup app')
  app.set('trust proxy', true)
  app.use(express.json())
  app.use(express.urlencoded({ extended: true }))

  if (ACCESS_LOGS === 'true') {
    app.use(morgan('tiny'))
  }

  app.get('/', (req, res) => {
    res.send({
      pkg: { name: pkg.name, version: pkg.version },
      msg: 'ok',
    })
  })

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

      const [structError, patches] = LedPatches.validate(req.body)
      if (structError) return res.status(400).send({ msg: structError.message })

      if (ledLock) return res.status(400).send({ msg: 'Already running' })
      ledLock = true

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

  return app
}

/** Create a WebSocket server to control the gpio when authenticated */
function createSocketServer(server, gpio) {
  const wss = new ws.Server({ noServer: true })

  //
  // Listen for websocket connections
  //
  wss.on('connection', (ws, req, url) => {
    debug(`wss@connection url="${url}"`)

    //
    // For each new socket, listen to messages from it
    //
    ws.on('message', (payload) => {
      debug(`ws@message url="${url}"`)
      try {
        // Parse the payload and if valid send to the gpio
        const data = JSON.parse(payload)
        const patches = LedPatches.assert(data)
        gpio.patchLeds(patches)
      } catch (error) {
        console.log('Error handling socket', error.message)
        ws.close(1003, `Bad Request - ${error.message}`)
      }
    })
  })

  // Kill a websocket, sending a status code and message
  const kill = (socket, code, msg) => {
    socket.write(`HTTP/1.1 ${code} ${msg}\r\n\r\n`)
  }

  // Listen for socket upgrades so we can process them
  server.on('upgrade', (req, socket, head) => {
    const url = new URL(req.url, `http://${req.headers.host}`)

    const hasAuthn = req.headers.authorization === SECRET_KEY
    debug(`server@upgrade hasAuthn=${hasAuthn} path=${url.pathname}`)

    // Do nothing if they didn't pass the correct header
    if (!hasAuthn) return kill(socket, 401, 'Unauthorized')

    // Out 'routing' – only allow a connection to /leds
    if (url.pathname !== '/leds') return kill(socket, 404, 'Not Found')

    // Let the 'ws' module handle the connection if they got here
    wss.handleUpgrade(req, socket, head, function done(ws) {
      wss.emit('connection', ws, req, url)
    })
  })

  return wss
}

/**
 * Run the blinkit server on a given port
 * @param {number} port The port to run the server on
 */
async function runServer(port) {
  validateEnv(['SECRET_KEY'])

  debug(`#runServer NODE_ENV="${NODE_ENV}"`)

  const gpio = FAKE_GPIO === 'true' ? new TerminalGpio() : new RealGpio()

  debug(`using gpio="${gpio.constructor.name}"`)
  gpio.setup()

  const app = createApp(gpio)
  const server = http.createServer(app)
  const wss = createSocketServer(server, gpio)

  //
  // Wait for the server to start and listen for signals to shutdown
  //
  await new Promise((resolve, reject) => {
    server.listen(port, (err) => {
      if (err) reject(err)
      else resolve()
    })

    process.on('SIGINT', () => shutdown(server, gpio, wss, 'Received SIGINT'))
    process.on('SIGTERM', () => shutdown(server, gpio, wss, 'Received SIGTERM'))
  })

  console.log(`Listening on :${port}`)

  await startupBlink(gpio)
}

module.exports = { runServer }
