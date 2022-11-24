import { handleRequest } from './handler'
import * as http from 'http'
import * as dotenv from 'dotenv'
dotenv.config()

const port = process.env.PORT || 8787

const server = http.createServer(async (req, res)=> {
  let body = ''
  req.on('data', (chunk) => {
      body += chunk;
  })

  req.on('end', async ()=>{
    await handleRequest(convertIncomingMessageToRequest(req, body), res)
    res.end()
  })

})
server.listen(port)

server.on('error', onError)

function onError(error: NodeJS.ErrnoException): void {
	if (error.syscall !== 'listen') {
		throw error
	}
	const bind = (typeof port === 'string') ? 'Pipe ' + port : 'Port ' + port
	switch (error.code) {
		case 'EACCES':
			console.error(`${bind} requires elevated privileges`)
			process.exit(1)
			break
		case 'EADDRINUSE':
			console.error(`${bind} is already in use`)
			process.exit(1)
			break
		default:
			throw error
	}
}

const convertIncomingMessageToRequest = (req: http.IncomingMessage, body: any): Request => {
  var headers = new Headers()
  for (var key in req.headers) {
    if (req.headers[key]) headers.append(key, req.headers[key] as string)
  }
  const url = `http://${headers.get('host')}${req.url}`

  let request = new Request(url, {
    method: req.method,
    body: req.method === 'POST' ? body : null,
    headers,
  })
  return request

}

