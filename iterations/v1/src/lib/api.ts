export async function api(path: string, body?: unknown, method?: string): Promise<Response> {
  return fetch(path, {
    method: method || (body === undefined ? 'GET' : 'POST'),
    credentials: 'include',
    headers: body === undefined ? undefined : { 'Content-Type': 'application/json' },
    body: body === undefined ? undefined : JSON.stringify(body),
  })
}
