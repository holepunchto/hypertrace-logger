#!/usr/bin/env node
import fs from 'fs'

const isRunThroughCli = import.meta.url === `file://${process.argv[1]}`

class Grapher {
  usersPublicKeysConnections = {} // userId => { publicKey => [remotePublicKeys] }
  publicKeyToUser = {} // publicKey => userId

  totalConnections (userId) {
    if (!this.usersPublicKeysConnections[userId]) return 0
    return Object.entries(this.usersPublicKeysConnections[userId].connections).reduce((totalCount, [publicKey, connections]) => totalCount + connections.length, 0)
  }

  add ({ props, caller, id, object, time, userId }) {
    /*
      Note!!!
      Sometimes a `listening` entry will come after a stream-open/close entry that references it.
      This means that publicKeyToUser[publicKey] is not set, and it won't be logged.
    */
    if (id === 'listen') {
      const { publicKey } = caller.props
      this.publicKeyToUser[publicKey] = userId
      // console.log(`[LISTEN] ${publicKey} -> ${userId}`)
    }

    if (id === 'stream-open') {
      const { publicKey, remotePublicKey } = caller.props.stream
      // console.log(`[OPEN] ${publicKey} -> ${remotePublicKey}`)
      const fromUser = this.publicKeyToUser[publicKey]
      const toUser = this.publicKeyToUser[remotePublicKey]
      const shouldFilterOut = !fromUser || !toUser
      if (shouldFilterOut) return

      this.usersPublicKeysConnections[userId] = this.usersPublicKeysConnections[userId] || { connections: {} }
      this.usersPublicKeysConnections[userId].connections[publicKey] = this.usersPublicKeysConnections[userId].connections[publicKey] || []
      this.usersPublicKeysConnections[userId].connections[publicKey].push(remotePublicKey)
      console.log(`[${time}] ${fromUser} (${this.totalConnections(fromUser)} conns) => ${toUser} (${this.totalConnections(toUser)} conns)`)
    }

    if (id === 'stream-close') {
      const { publicKey, remotePublicKey } = caller.props.stream
      const { code } = caller.props.error || {}
      const fromUser = this.publicKeyToUser[publicKey]
      const toUser = this.publicKeyToUser[remotePublicKey]
      const shouldFilterOut = !fromUser || !toUser
      if (shouldFilterOut) return

      this.usersPublicKeysConnections[userId].connections[publicKey] = this.usersPublicKeysConnections[userId].connections[publicKey].filter(k => k !== remotePublicKey)
      console.log(`[${time}] ${fromUser} (${this.totalConnections(fromUser)} conns) x> ${toUser} (${this.totalConnections(toUser)} conns), reason=${code || null}`)
    }
  }
}

export default Grapher

if (isRunThroughCli) {
  const dir = process.argv[2]
  if (!dir) {
    console.error('Use as ./grapher.js <dir>')
    process.exit(1)
  }

  const grapher = new Grapher()

  const logFilenames = fs
    .readdirSync(dir)
    .filter(dir => dir.endsWith('.log'))

  const combinedLogFileSortedByTime = logFilenames
    .map((logFilename, index) => fs
      .readFileSync(`${dir}/${logFilename}`)
      .toString()
      .trim()
      .split('\n')
      .map(entry => {
        entry = JSON.parse(entry)
        entry.userId = entry.userId || `User-${index + 1}` // TODO: Should have already been set by keet-desktop
        return entry
      })
    )
    .flat()
    .sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime())

  // fs.writeFileSync(`${dir}/combinedLogFileSortedByTime.json`, JSON.stringify(combinedLogFileSortedByTime))

  // // First get all users (this is to ensure that we know all users when we go through log entries)
  // combinedLogFileSortedByTime
  //   .forEach(entry => {
  //     const { caller, id, userId } = entry
  //     if (id === 'listen') {
  //       const { publicKey } = caller.props
  //       grapher.publicKeyToUser[publicKey] = userId
  //     }
  //   })
  combinedLogFileSortedByTime.forEach(entry => grapher.add(entry))
}
