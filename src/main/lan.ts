// LAN discovery and mesh links for 联机. Pure Node (dgram + net), no Electron:
// it runs unchanged in the offline self-test. Presence is derived from UDP
// heartbeats alone (no host, no server): a missed sweep or a graceful `bye`
// both drop the peer, and every pet sees the same come-and-go events.

import { createSocket, type Socket as UdpSocket } from 'node:dgram'
import { createServer, connect, type Server, type Socket as TcpSocket } from 'node:net'
import { existsSync, readFileSync, writeFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { join } from 'node:path'
import type { LanLine, LanPeer, LanPeerInit } from '../shared/lan'

/** One well-known port shared by every pet on the LAN (SO_REUSEADDR). */
const UDP_PORT = 47777
const HELLO_MS = 5000
/** A peer silent for this long (3 missed heartbeats) is gone. */
const TIMEOUT_MS = 15_000
const PING_MS = 30_000

/**
 * The stable LAN identity of this install, created once and kept next to the
 * save. A test instance (QQPET_USER_DATA) gets its own id automatically.
 */
export function persistedLanId(dir: string): string {
  const file = join(dir, 'lan-id.json')
  try {
    if (existsSync(file)) return (JSON.parse(readFileSync(file, 'utf8')) as { id: string }).id
  } catch {
    /* fall through to a fresh id */
  }
  const id = randomUUID()
  writeFileSync(file, JSON.stringify({ id }))
  return id
}

const line = (o: unknown): string => `${JSON.stringify(o)}\n`

export interface LanHandlers {
  online?: (peer: LanPeer) => void
  offline?: (peer: LanPeer) => void
  message?: (fromId: string, body: unknown) => void
}

export class LanNode {
  private me: { id: string } & LanPeerInit
  private h: LanHandlers
  private udp: UdpSocket | null = null
  private server: Server | null = null
  private tcpPort = 0
  private readonly links = new Map<string, TcpSocket>()
  private readonly peers = new Map<string, { peer: LanPeer; tcp: number; lastSeen: number }>()
  private helloTimer: ReturnType<typeof setInterval> | undefined
  private sweepTimer: ReturnType<typeof setInterval> | undefined
  private readonly helloMs: number
  private readonly timeoutMs: number

  constructor(me: { id: string } & LanPeerInit, handlers: LanHandlers = {}, timing: { helloMs?: number; timeoutMs?: number } = {}) {
    this.me = me
    this.h = handlers
    // Tests shrink these to run in seconds instead of half a minute.
    this.helloMs = timing.helloMs ?? HELLO_MS
    this.timeoutMs = timing.timeoutMs ?? TIMEOUT_MS
  }

  /** Pet identity follows renames and level-ups. */
  setIdentity(init: LanPeerInit): void {
    this.me = { ...this.me, ...init }
    this.hello()
  }

  async start(): Promise<void> {
    this.server = createServer((c) => this.accept(c))
    await new Promise<void>((res, rej) => {
      this.server!.once('error', rej)
      this.server!.listen(0, () => res())
    })
    this.tcpPort = (this.server!.address() as { port: number }).port
    const udp = createSocket({ type: 'udp4', reuseAddr: true })
    this.udp = udp
    // A blocked UDP port kills discovery only; the pet itself must keep living.
    udp.on('error', (e) => console.error('lan udp error:', e))
    udp.on('message', (buf, rinfo) => this.onDatagram(buf, rinfo.address))
    await new Promise<void>((res, rej) => {
      udp.once('error', rej)
      udp.bind(UDP_PORT, () => res())
    })
    udp.setBroadcast(true)
    this.helloTimer = setInterval(() => this.hello(), this.helloMs)
    this.sweepTimer = setInterval(() => this.sweep(), this.helloMs)
    // A startup burst: peers learn about a newcomer in under a second instead
    // of waiting out their own heartbeat, and missed binds self-heal.
    this.hello()
    setTimeout(() => this.hello(), 300).unref()
    setTimeout(() => this.hello(), 900).unref()
  }

  /** Graceful leave: peers hear `bye` instead of waiting out the timeout. */
  stop(): void {
    clearInterval(this.helloTimer)
    clearInterval(this.sweepTimer)
    const udp = this.udp
    // udp.send is async: close the socket only once the goodbye is on the wire.
    try {
      udp?.send(line({ t: 'bye', id: this.me.id }), UDP_PORT, '255.255.255.255', () => udp.close())
    } catch {
      udp?.close()
    }
    for (const s of this.links.values()) s.destroy()
    this.links.clear()
    this.server?.close()
    this.server = null
    this.udp = null
  }

  /** Sends to one pet over its direct link; silently drops when unlinked. */
  send(toId: string, body: unknown): void {
    this.links.get(toId)?.write(line({ t: 'msg', body }))
  }

  /** Sends to every linked pet. */
  broadcast(body: unknown): void {
    for (const s of this.links.values()) s.write(line({ t: 'msg', body }))
  }

  private hello(): void {
    const pkt: LanLine = { t: 'hello', v: 1, tcp: this.tcpPort, ...this.me }
    this.udp?.send(line(pkt), UDP_PORT, '255.255.255.255')
  }

  private onDatagram(buf: Buffer, addr: string): void {
    let pkt: LanLine
    try {
      pkt = JSON.parse(buf.toString('utf8')) as LanLine
    } catch {
      return
    }
    if (!('id' in pkt) || pkt.id === this.me.id) return
    if (pkt.t === 'bye') {
      this.drop(pkt.id, addr)
      return
    }
    if (pkt.t !== 'hello') return
    const seen = this.peers.get(pkt.id)
    const peer: LanPeer = { id: pkt.id, name: pkt.name, host: pkt.host, sex: pkt.sex, level: pkt.level, addr }
    this.peers.set(pkt.id, { peer, tcp: pkt.tcp, lastSeen: Date.now() })
    if (seen) return
    this.h.online?.(peer)
    this.link(peer, pkt.tcp)
  }

  private sweep(): void {
    const now = Date.now()
    for (const [id, { peer, lastSeen }] of this.peers) {
      if (now - lastSeen < this.timeoutMs) continue
      this.peers.delete(id)
      this.links.get(id)?.destroy()
      this.links.delete(id)
      this.h.offline?.(peer)
    }
  }

  private drop(id: string, addr: string): void {
    const seen = this.peers.get(id)
    if (!seen || seen.peer.addr !== addr) return
    this.peers.delete(id)
    this.links.get(id)?.destroy()
    this.links.delete(id)
    this.h.offline?.(seen.peer)
  }

  /** Both ends connect deterministically: only the greater id dials, so one link per pair. */
  private link(peer: LanPeer, tcp: number): void {
    if (this.me.id < peer.id || this.links.has(peer.id)) return
    const sock = connect(tcp, peer.addr)
    sock.on('error', () => sock.destroy())
    sock.once('connect', () => {
      sock.write(line({ t: 'hello', v: 1, tcp: this.tcpPort, ...this.me }))
      this.links.set(peer.id, sock)
    })
    this.reader(sock, (id) => id ?? peer.id)
    sock.setKeepAlive(true, PING_MS)
  }

  private accept(sock: TcpSocket): void {
    sock.on('error', () => sock.destroy())
    this.reader(sock, (id) => id)
    sock.setKeepAlive(true, PING_MS)
  }

  /** Reads newline-delimited JSON; the `hello` line binds the socket to a peer id. */
  private reader(sock: TcpSocket, idOf: (id: string | undefined) => string | undefined): void {
    let id: string | undefined
    let buf = ''
    sock.on('data', (data) => {
      buf += data.toString('utf8')
      let i: number
      while ((i = buf.indexOf('\n')) >= 0) {
        const text = buf.slice(0, i)
        buf = buf.slice(i + 1)
        if (!text) continue
        let pkt: LanLine
        try {
          pkt = JSON.parse(text) as LanLine
        } catch {
          continue
        }
        if (pkt.t === 'hello') {
          id = pkt.id
          if (id === this.me.id) return sock.destroy()
          const prev = this.links.get(id)
          if (prev && prev !== sock) return sock.destroy()
          this.links.set(id, sock)
          continue
        }
        const from = idOf(id)
        if (!from) return sock.destroy()
        if (pkt.t === 'msg') this.h.message?.(from, pkt.body)
        // `ping` and `bye` need no action here: keep-alive is TCP's, presence is UDP's.
      }
    })
    sock.on('close', () => {
      const bound = idOf(id)
      if (bound && this.links.get(bound) === sock) this.links.delete(bound)
    })
  }
}
