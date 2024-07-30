import * as http from 'http';
import App from './app.js';
import * as dotenv from 'dotenv';

dotenv.config();

const port = process.env.PORT || 3000;
App.set('port', port);

const server = http.createServer(App);
server.listen(port);

server.on('listening', () => {
	console.log('Listening on port:', port);
});

server.on('error', onError);

function onError(error: NodeJS.ErrnoException): void {
	if (error.syscall !== 'listen') {
		throw error;
	}
	const bind = typeof port === 'string' ? 'Pipe ' + port : 'Port ' + port;
	switch (error.code) {
		case 'EACCES':
			console.error(`${bind} requires elevated privileges`);
			process.exit(1);
			break;
		case 'EADDRINUSE':
			console.error(`${bind} is already in use`);
			process.exit(1);
			break;
		default:
			throw error;
	}
}
