# hypertrace-logger

Enable `hypertrace` logs to be sent over a `hyperdht` connection and stored on a server. This module handles that `hyperdht` connection.

It includes two classes, `Server` and `Client`, which can be used in both ends. The server can also just be run by `npm run server`. The `Client` is to be used in e.g. `keet-desktop` to start traces from there.

The logs are stored in .log files. Those log files can be read by promtail, and then stored.

## How to run the server

Run the server:

```
$ npm run server
server started on 17ba5b10a5abba269e16d740c1eb76ba215c05a697c7e37c996abfcc48ba82f3
```

The public key `17ba...` that is printed, can be used on the client-side to connect to this.

There is a public+secret key pair generated by `hypertrace-logger` that's stored in `keys.dat`. This can also be updated if you have some specific key you need to use.

## How to use the modules

### Client

#### Usage

``` js
const DHT = require('hyperdht')
const hypertraceLogger = require('hypertrace-logger')
const { Client } = hypertraceLogger

const serverPublicKey = '17ba....'

const client = new Client()
client.start({
  createSocket: () => { // Required
    const node = new DHT()
    return node.connect(Buffer.from(serverPublicKey, 'hex'))
  },
  ignoreClassNames: ['Foo', 'Bar'], // Optional
  getInitialsProps: async () => { // Optional
    const userId = 'probablyLoadedFromSomeStorage'
    return {
      userId
    }
  }
})

```

#### new Client()

Creates Client

#### async .start({ createSocket, canSocketReconnect = () => true, ignoreClassNames = [], getInitialProps = () => {}})

Starts the tracing. First start `setTracerFunction` for `hypertrace` and then creates socket with the passed `createSocket` function.

- `createSocket`. Function that returns a socket
- `canSocketReconnect` (optional). Whether or not the socket is ok to reconnect. If your app is closing you'd want to return false
- `ignoreClassNames` (optional). A list of classNames that should be ignored
- `getInitialProps` (optional). Function that returns a map of properties that should be added to each message

Handles reconnections and buffers messages that might otherwise have been lost.

### .addTrace(params)

After calling `.start`, tracing will start, so most times there is no need to call `.addTrace`. But if needed, then use this to add a trace message.

### Server

#### Usage

```js
const DHT = require('hyperdht')
const hypertraceLogger = require('hypertrace-logger')

const keyPair = DHT.keyPair()
const server = new Server({ folder: './' })
await server.listen(keyPair)
console.log(`server started on ${keyPair.publicKey.toString('hex')}`)
```

#### new Server({ folder })

Starts a server. Stores log files to `folder`

#### async .listen(keyPair)

Starts the dht server on the given `keyPair`
