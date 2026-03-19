const WebSocket = require('ws')
const { spawn } = require('child_process')
const fs = require('fs')
const path = require('path')
const { v4: uuidv4 } = require('uuid')

function executePython(code, ws) {
    const jobId = uuidv4()
    const filename = `${jobId}.py`
    const filePath = path.join(__dirname, '../../temp', filename)
    const normalizedPath = path.join(__dirname, '../../temp').split(path.sep).join('/')

    console.log('normalizedPath:', normalizedPath)
    console.log('filePath:', filePath)
    console.log('file exists:', fs.existsSync(filePath))

    fs.mkdirSync(path.join(__dirname, '../../temp'), { recursive: true })
    fs.writeFileSync(filePath, code)


    const child = spawn('docker', [
        'run', '--rm', '-i',
        '--memory=256m',
        '--cpus=0.5',
        '--network', 'none',
        '-v', `${normalizedPath}:/code`,
        'python-runner',
        'python', '-u', `/code/${filename}`
    ])
    // Without -u, Python's internal buffer holds output until it's full (~8KB) or the process exits.
    // Our code streams output back, but an RCE project almost certainly also writes to child.stdin when the user types input. 
    // Without -i, Docker closes the container's stdin immediately at startup. (so both -i and -u are necessary) 

    const controls = attachStreams(child, ws, () => {
        fs.rmSync(filePath, { force: true })
    })

    // spawn() return an ChildProcess - a handle to running Docker Process
    // child.stdin   // write input TO the process
    // child.stdout  // read output FROM the process
    // child.stderr  // read errors FROM the process
    // child.kill()  // terminate the process
    // child.pid     // process ID

    child.controls = controls

    return child
}

function executeJava(code, stdin = '', ws) {
    const jobId = uuidv4()
    const filename = 'Main.java'
    const jobDir = path.join(__dirname, '../../temp', jobId)
    const normalizedDir = jobDir.split(path.sep).join('/')

    fs.mkdirSync(jobDir, { recursive: true })
    fs.writeFileSync(path.join(jobDir, filename), code)

    const child = spawn('docker', [
        'run', '--rm', '-i',
        '--memory=256m',
        '--cpus=0.5',
        '--network', 'none',
        '-v', `${normalizedDir}:/code`,
        'java-runner',
        'sh', '-c',
        `javac /code/${filename} && timeout 10 java -cp /code Main`
    ])

    attachStreams(child, ws, () => {
        fs.rmSync(jobDir, { recursive: true, force: true })
    })

    if (stdin) child.stdin.write(stdin)
    child.stdin.end()

    return child
}

function executeCpp(code, stdin = '', ws) {
    const jobId = uuidv4()
    const filename = 'main.cpp'
    const jobDir = path.join(__dirname, '../../temp', jobId)
    const normalizedDir = jobDir.split(path.sep).join('/')

    fs.mkdirSync(jobDir, { recursive: true })
    fs.writeFileSync(path.join(jobDir, filename), code)

    const child = spawn('docker', [
        'run', '--rm', '-i',
        '--memory=256m',
        '--cpus=0.5',
        '--network', 'none',
        '-v', `${normalizedDir}:/code`,
        'cpp-runner',
        'sh', '-c',
        `g++ /code/${filename} -o /code/a.out && timeout 10 /code/a.out`
    ])

    attachStreams(child, ws, () => {
        fs.rmSync(jobDir, { recursive: true, force: true })
    })

    if (stdin) child.stdin.write(stdin)
    child.stdin.end()

    return child
}

// shared stream handler for all three executors
function attachStreams(child, ws, cleanup) {
    let inputTimer = null

    // Timer - 1 
    // Waiting for user input (timer for 30s)
    // resets everytime user send inputs or program gives an output
    const resetInputTimer = () => {
        if (inputTimer) clearTimeout(inputTimer)
        inputTimer = setTimeout(() => {
            child.kill()
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: "stderr",
                    data: "Input timeout, no input received for 30s"
                }))
            }
        }, 30000)
    }

    // Timer - 2
    // CPU Execution Timer
    // Only running when the program is actively running (not waiting for input)

    let cpuTime = 0
    let cpuStart = Date.now()
    let waitingForInput = false
    const CPU_LIMIT = 10000

    const checkCPUTime = () => {
        console.log("cpuTime: ", cpuTime);

        if (!waitingForInput) { // only when it is false and not waiting for input we would calculate the cpuTime
            cpuTime += Date.now() - cpuStart
            cpuStart = Date.now()
            // we need to reset the cpuStart, as when first execution is happening say it goes for 2s then it's waiting for user input
            // say 2nd execution goes for 4s so the total cpu execution time is 6s 
            // if we don't reset it, 

            // 1st execution
            // t=1500  interval fires (cpuStart = 1000)
            // cpuTime += 1500 - 1000 = 500

            // t=2000  interval fires
            // cpuTime += 2000 - 1000 = 1000
            // cpuTime = 1500

            // so we have to reset the cpuStart before it hits the 2nd execution or it'll stack upon it
            // cpuStart = Date.now then next time cpuTime += 2000 - 1500 => 500 so the cpuTime will and should be 1000 
        }

        if (cpuTime >= CPU_LIMIT) {
            child.kill()
            if (ws.readyState === WebSocket.OPEN) {
                ws.send(JSON.stringify({
                    type: 'stderr',
                    data: "CPU time limit exceeded (10s)"
                }))
            }
        }
    }

    const cpuCheckInterval = setInterval(checkCPUTime, 500)

    resetInputTimer() // start wating for first input

    child.stdout.on('data', (chunk) => {
        console.log('stdout chunk:', JSON.stringify(chunk.toString()))
        waitingForInput = true
        cpuTime += Date.now() - cpuStart
        resetInputTimer()
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'stdout', data: chunk.toString() }))
        }
    })

    child.stderr.on('data', (chunk) => {
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'stderr', data: chunk.toString() }))
        }
    })

    child.on('close', (code) => {
        clearTimeout(inputTimer)
        clearInterval(cpuCheckInterval)
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'exit', code }))
        }
        cleanup() // delete temp files
    })

    // Fires if the process itself fails to start — e.g. Docker not running, command not found
    // Different from stderr — this is a Node level error, not a Python error

    child.on('error', (err) => {
        console.log("err: ", err);

        clearTimeout(inputTimer)
        clearInterval(cpuCheckInterval)
        if (ws.readyState === WebSocket.OPEN) {
            ws.send(JSON.stringify({ type: 'stderr', data: err.message }))
        }
        cleanup()
    })
    return {
        resetInputTimer, setWaitingForInput: (val) => {
            waitingForInput = val
            if (!val) cpuStart = Date.now()
        }
    }
}

module.exports = { executePython, executeJava, executeCpp }