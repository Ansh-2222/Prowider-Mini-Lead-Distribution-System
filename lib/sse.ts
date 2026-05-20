type Subscriber = (chunk: string) => void

const subscribers = new Set<Subscriber>()

export function subscribe(fn: Subscriber) {
  subscribers.add(fn)
  return () => subscribers.delete(fn)
}

export function broadcast(event: string, data: unknown) {
  const chunk = `event: ${event}\ndata: ${JSON.stringify(data)}\n\n`
  subscribers.forEach(fn => fn(chunk))
}
