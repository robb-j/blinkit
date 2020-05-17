# blinkit

A small express server to light up the [blinkt led hat](https://learn.pimoroni.com/blinkt)
on a raspberry pi's gpio.

> I miss-named it blink**I**t (with an "I") when I first set this up
> and never got around to renaming everything

<!-- toc-head -->

## Table of contents

- [The server](#the-server)
  - [Http api](#http-api)
  - [Hex colours](#hex-colours)
  - [Socket api](#socket-api)
- [Installation](#installation)
- [Development](#development)
  - [Setup](#setup)
  - [Regular use](#regular-use)
  - [Testing](#testing)
  - [Irregular use](#irregular-use)
  - [Code formatting](#code-formatting)
- [References](#references)
- [Future work](#future-work)

<!-- toc-tail -->

The server is designed to be checked out at `/usr/src/blinkit` on a raspberry pi
and ran as a systemd service as the `node` user on the pi.
I'm running it on node `v10.20.1` as that's (currently) the latest version that
supports the `armv6l` architecture of a raspberry pi zero w.

## The server

The server lets other device on the same network tell the pi which leds to light up
and what colour to make them.
The are two ways of doing this, the http api or with websockets,
both are authenticated with a pre-shared token, `$SECRET_KEY`.

### Http api

Here's how to use the http api, the examples use [httpie](https://httpie.org/).
In my setup, my pi is available as `eclair.local`.

```bash
# Check the server is there and running
http eclair.local:3000/

# Post up an existing patch
cat patch.json | http eclair.local:3000/leds Authorization:$SECRET_KEY
```

Where **patch.json** is below, it sets the first led to red and the 5th led to green

```json
[
  { "position": 0, "colour": "#ff000025" }
  { "position": 4, "colour": "#00ff0025" }
]
```

### Hex colours

The colour is an eight character hexadecimal and starts with a hash – `#`.
Each 2 letters are the `red`, `green`, `blue` and `brightness` components, in that order.

### Socket api

There is a socket api to maintain a single connection and periodically update the leds.
You need to connect to the same endpoint with the same authorization header as the http api,
then you can emit a set of patches, which is the same payload as above too.

Here's an example in node.js using [ws](https://www.npmjs.com/package/ws):

> There isn't a way of setting headers on ecma's WebSocket,
> so there might need to be another auth method in the future

```js
const WebSocket = require('ws')

// Create a websocket connection
const socket = new WebSocket('ws://localhost:3000/leds', {
  headers: { authorization: 'your_authorization_secret' }
})

// Emit a led change
socket.emit(
  JSON.stringify([
    { position: 4, colour: '#c0ffee27' },
    { position: 2, colour: '#be080627' }
  ])
)
```

## Installation

> starting with a raspberry pi running raspbian lite

**Install node.js**

```bash
# ssh root@your_pi_host.local

TMP=`mktemp -d`
cd $TMP

curl -sLO https://nodejs.org/dist/latest-v10.x/node-v10.20.1-linux-armv6l.tar.gz
tar -xzf node-v10.20.1-linux-armv6l.tar.gz
mv node-v10.20.1-linux-armv6l /usr/src/node

ln -s /usr/src/node/bin/node /usr/bin/node
ln -s /usr/src/node/bin/npm /usr/bin/npm
ln -s /usr/src/node/bin/npx /usr/bin/npx

rm -r $TMP
```

**Setup user and directory**

```bash
# ssh root@your_pi_host.local

adduser node
# create user ...
usermod -aG sudo node
usermod -aG gpio node

mkdir -p /usr/src/blinkit
chown -R node:node /usr/src/blinkit
```

**Setup app**

```bash
# ssh root@your_pi_host.local

su node

git clone git@github.com:robb-j/blinkit.git /usr/src/blinkit
cd /usr/src/blinkit

cp .env.example .env
nano .env

# take this time to make sure your on the latest kernel
apt-get update
apt-get upgrade
apt-get dist-upgrade
apt-get install python3 # the 'onoff' npm dependency needs this for some reason
apt-get autoremove

# install production dependencies
npm install --production

# Link the service up and enable it
sudo ln -s /usr/src/blinkit/blinkit.service /lib/systemd/system/blinkit.service
sudo systemctl daemon-reload
sudo systemctl enable blinkit

# Start the service
sudo systemctl start blinkit
```

**Blink codes**

- When the server has started up and is ready for request it pulse a "loading bar" of white.
- When the server exits gracefully it will flash red.

## Environment variables

- `NODE_ENV` - no effect currently, determines if development or production
- `SECRET_KEY` - the pre-shared key to authenticate clients with,
  they have to pass it as an Authorization header
- `FAKE_GPIO` - set to `true` to output gpio results to the terminal,
  so you can test it on a device without gpio.
- `ACCESS_LOGS` - set to `true` to enable http access logs
- `DEBUG` - [debug](https://www.npmjs.com/package/debug) parameter,
  available namespaces: `blinkit:cli`, `blinkit:gpio`, `blinkit:server`.
  Set to `blinkit*` to log everything relevant to this project.
- `BLINKIT_HOST` used in hack/client.js to overide the host to connect to.

## Development

### Setup

To develop on this repo you will need to have [node.js](https://nodejs.org)
installed on your dev machine and have an understanding of it.
This guide assumes you have the repo checked out and are on macOS,
but equivalent commands are available.

You'll only need to follow this setup once for your dev machine.

```bash
# cd to/this/repo

# Install node dependencies (production and development)
npm install

# Setup your environment
cp .env.example .env
```

### Regular use

These are the commands you'll regularly run to develop the API, in no particular order.

```bash
# Use the cli
node src/cli.js --help

# Run the server on localhost
# -> Listens on http://localhost:3000
# -> Fakes gpio in the terminal if FAKE_GPIO=true
node src/cli.js serve

# Experimental http api client cli
node hack/client.js --help

# Manually send patches with httpie
source .env
cat hack/patches/white.json | http :3000/leds Authorization:$SECRET_KEY
```

### Testing

> Not currently in use

This repo uses [unit tests](https://en.wikipedia.org/wiki/Unit_testing) to ensure that everything is working correctly, guide development, avoid bad code and reduce defects.
[Jest](https://www.npmjs.com/package/jest) is used to run unit tests.
Tests are any file in `src/` that end with `.spec.ts`, by convention they are inline with the source code,
in a parallel folder called `__tests__`.

```bash
# Run the tests
npm test -s

# Generate code coverage
npm run coverage -s
```

### Irregular use

These are commands you might need to run but probably won't, also in no particular order.

```bash
# Generate the table of contents in this readme
npm run gen-readme-toc

# on the pi
# ...
journalctl -fu blinkit
```

### Code formatting

This repo uses [Prettier](https://prettier.io/) to automatically format code to a consistent standard.
It works using the [yorkie](https://www.npmjs.com/package/yorkie)
and [lint-staged](https://www.npmjs.com/package/lint-staged) packages to
automatically format code whenever code is commited.
This means that code that is pushed to the repo is always formatted to a consistent standard.

You can manually run the formatter with `npm run prettier` if you want.

Prettier is slightly configured in [package.json#prettier](/package.json)
and can ignores files using [.prettierignore](/.prettierignore).

## References

- https://github.com/Irrelon/node-blinkt
- https://github.com/pimoroni/blinkt

## Future work

- Allow authentication for Ecma's WebSocket implementation
- Add automated testing
- Work out and document the brightness channel
- If the logic needs to get more complicated, move to TypeScript
  and split up routes into different files
- Setup [standard-version](https://www.npmjs.com/package/standard-version)
  w/ [commitlint](https://www.npmjs.com/package/@commitlint/cli) when a stable API is reached

---

> This project was set up by [puggle](https://npm.im/puggle)
