// Types shared by the main-process LAN node and the renderer bridge.
// Presence lives on UDP broadcast over the friend LAN (Radmin virtual LAN);
// direct TCP links carry the M3 visit/message traffic on top of it.

export interface LanPeerInit {
  /** Pet name (petInfo.name), shown in the online/offline notices. */
  name: string
  /** Owner nickname (petInfo.host). */
  host: string
  sex: 'GG' | 'MM'
  level: number
}

export interface LanPeer extends LanPeerInit {
  /** Stable random id persisted in userData/lan-id.json. */
  id: string
  /** The peer's LAN address as seen from the last datagram. */
  addr: string
}

/** A line on a direct TCP link. hello links the socket to a peer id. */
export type LanLine =
  | ({ t: 'hello'; v: 1; tcp: number } & LanPeerInit & { id: string })
  | { t: 'bye'; id: string }
  | { t: 'ping' }
  | { t: 'msg'; body: unknown }
