const http = require('http')

const server = http.createServer((req, res) => {
    // set CORS headers
    res.setHeader('Access-Control-Allow-Origin', '*')

    // GET /state — see all current prices
    if (req.url === '/state') {
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify(Object.fromEntries(marketState)))
        return
    }

    // GET /switch?symbols=BTCUSDT,SOLUSDT,BNBUSDT
    if (req.url.startsWith('/switch')) {
        const url = new URL(req.url, 'http://localhost')
        const symbols = url.searchParams.get('symbols').split(',')
        connect(symbols)
        res.writeHead(200, { 'Content-Type': 'application/json' })
        res.end(JSON.stringify({ ok: true, watching: symbols }))
        return
    }

    res.writeHead(404)
    res.end('Not found')
})

server.listen(3001, () => {
    console.log('Server running on http://localhost:3001')
})