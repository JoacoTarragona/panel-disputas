export type PlatformMeta = {
  present?: boolean
  mtime?: string
  size?: number
  access_expires_in?: number
}

export type CredentialsStatusBody = {
  uber?: string | PlatformMeta
  pya?: PlatformMeta
  pedidosya?: string
}

export function platformConfigured(value: string | PlatformMeta | undefined, legacy?: string) {
  if (typeof value === 'string') return value === 'configured'
  if (value && typeof value === 'object') return Boolean(value.present)
  return legacy === 'configured'
}
