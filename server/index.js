const WebSocket = require('ws')
const express = require('express')
const cors = require('cors')
const http = require('http')
const { executePython, executeJava, executecpp } = require('./src/services/executor')

const app = express()
const server = http.createServer(app) // share same port as backend server
const wss = new WebSocket.Server({ server })

app.use(cors()) // allow all
app.use(express.json())

app.get('/', (req, res) => {
    res.send('Welcome to a terrible RCE');
});

wss.on('connection', (ws) => {
    let currentProcess = null
    console.log("client connected..!");


    ws.on('message', (message) => {
        const { type, data, code, lang } = JSON.parse(message)

        // user clicked Run — start execution
        if (type === 'run') {
            if (currentProcess) {
                currentProcess.kill()
                currentProcess = null
            }

            if (lang === 'python') {
                currentProcess = executePython(code, ws)
            } else if (lang === 'java') {
                currentProcess = executeJava(code, ws)
            } else if (lang === 'cpp') {
                currentProcess = executecpp(code, ws)
            }            
        }

        // user typed input and pressed enter
        if (type === 'stdin') {
            console.log('controls available:', !!currentProcess?.controls)
            if (currentProcess) {
                currentProcess.stdin.write(data) // pipe it directly to running process, it's writing input to the process 
                // user sent input, program is running again not waiting
                currentProcess.controls?.setWaitingForInput(false)
                currentProcess.controls?.resetInputTimer()
            }
        }
    })

    ws.on('close', () => {
        if (currentProcess) {
            currentProcess.kill()
            currentProcess = null
        }
    })
})


const port = process.env.PORT || 5000;

server.listen(port, () => {
    console.log(`Listening on http://localhost:${port}`)
})