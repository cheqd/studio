export default {
    HEADERS: {
        json: { 'Content-Type': 'application/json' },
        text: { 'Content-Type': 'text/plain' },
    },
    CORS_HEADERS: {
        'Access-Control-Allow-Origin': '*',
        'Access-Control-Allow-Methods': 'GET,OPTIONS',
        'Access-Control-Max-Age': '86400'
    }
}