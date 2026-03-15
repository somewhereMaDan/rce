const express = require('express')
const dotenv = require('dotenv')
const cors = require('cors')
const http = require('http')
const { WebSocket } = require('ws')
const { executePython, executeJava, executecpp } = require('./src/services/executor')

const app = express()
const server = http.createServer(app) // share same port as backend server
const wss = new WebSocket.Server({ server })

app.use(cors()) // allow all
app.use(express.json())

app.get('/', (req, res) => {
    res.send('Welcome to a terrible RCE');
});

// wss.on('connection', (ws) => {
//     let currentProcess = null
//     console.log("client connected");

//     ws.on('message', async (message) => {
//         const { code, lang, stdin = '' } = JSON.parse(message)

//         if (currentProcess) {
//             currentProcess.kill()
//             currentProcess = null
//         }

//         try {
//             if (lang === 'python') {
//                 currentProcess = executePython(code, stdin, ws)
//             } else if (lang === 'java') {
//                 currentProcess = executeJava(code, stdin, ws)
//             } else if (lang === 'cpp') {
//                 currentProcess = executecpp(code, stdin, ws)
//             }
//         } catch (err) {
//             ws.send(JSON.stringify({ type: 'stderr', data: 'Internal server error' }))
//         }

//         ws.on('close', () => {
//             if (currentProcess) {
//                 currentProcess.kill()
//                 currentProcess = null
//             }
//             console.log("client disconnected");
//         })
//     })
// })

require('./src/routes/execute.routes')(app)

const port = process.env.PORT || 5000;

app.listen(port, () => {
    console.log(`Unfortunately listening on port http://localhost:${port}`)
});