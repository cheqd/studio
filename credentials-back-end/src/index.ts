import { handleRequest } from './handler'

self.addEventListener('fetch', (event: Event) => {
  const fetchEvent = event as FetchEvent

  fetchEvent.respondWith(handleRequest(fetchEvent.request))
})
