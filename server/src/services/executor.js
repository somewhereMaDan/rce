const { exec } = require('child_process')
const fs = require('fs')
const path = require('path')
const { WebSocketServer } = require('ws')
const { spawn } = require('child_process')
const { v4: uuidv4 } = require('uuid')

// executePython("print('hello')")
//     → writes file
//     → runs docker command
//     → exec callback fires
//     → stdout = "hello\n"
//     → resolve("hello\n")
//     → await returns "hello\n"

async function executePython(code) {
    const jobId = uuidv4()
    const filename = `${jobId}.py`
    fs.mkdirSync(path.join(__dirname, '../../temp'), { recursive: true })
    const filePath = path.join(__dirname, '../../temp', filename)

    fs.writeFileSync(filePath, code)

    const command = `docker run --rm --memory="256m" --cpus="0.5" --network none --stop-timeout 10 -v "${path.join(__dirname, '../../temp')}:/code" python-runner python /code/${filename}`

    try {
        return await new Promise((resolve, reject) => {
            exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
                if (error) {
                    reject({ type: "execution", message: stderr })
                } else {
                    resolve(stdout)
                }
            })
        })
    } finally {
        fs.rmSync(filePath, { force: true })
        // recursive is not needed here, as we only need to delete a file
    }
}

async function executeJava(code, stdinInput = "") {
    const jobId = uuidv4()
    const filename = "Main.java"

    const jobDir = path.join(__dirname, '../../temp', String(jobId))

    fs.mkdirSync(jobDir, { recursive: true })

    const filepath = path.join(jobDir, filename)
    fs.writeFileSync(filepath, code)

    // docker run — starts a new container.
    // --rm — automatically deletes the container once it finishes. No leftover stopped containers.
    // -v "${jobDir}:/code" — mounts your local jobDir (e.g. temp/1234567890/) into the container at /code. So Main.java sitting in jobDir on your host is visible at /code/Main.java inside the container.
    // java-runner — the Docker image to use. This is the image you built that has the JDK (javac + java) installed.

    // Java needs two steps to run, unlike Python which runs directly.
    // sh -c "..." — runs the string inside as a shell command
    // javac /code/Main.java — compiles the .java file into a .class bytecode file
    // && — if compilation succeeds, then run the next command
    // java -cp /code Main — runs the compiled class
    // -cp /code = classpath, look for .class files in /code
    // Main = the class name to run

    const command = `docker run --rm -i --memory="256m" --cpus="0.5" --network none --stop-timeout 10 -v "${jobDir}:/code" java-runner sh -c "javac /code/${filename} && java -cp /code Main"`

    try {
        return await new Promise((resolve, reject) => {
            const child = exec(command, { timeout: 10000 }, (error, stdout, stderr) => {
                if (error) {
                    reject({ type: "execution", message: stderr })
                } else {
                    resolve(stdout)
                }
            })
            if (stdinInput) {
                child.stdin.write(stdinInput)
            }
            child.stdin.end()
        })
    } finally {
        fs.rmSync(jobDir, { recursive: true, force: true })
    }
    // recursive: true — deletes the directory and everything inside it (subdirectories, files). 
    // Without it, rmSync would throw an error if the directory is non-empty. Since your jobDir contains at least the .java file 
    // and the compiled .class file after execution, you need this.

    // force: true — suppresses errors if the path doesn't exist. Without it, if the directory was never created (e.g. mkdirSync failed), 
    // rmSync would throw. Since cleanup is in finally, you don't want the cleanup step itself crashing — so force: true makes it a silent no-op if there's nothing to delete.
}

async function executecpp(code) {
    const jobId = uuidv4()
    const filename = 'main.cpp'

    const jobDir = path.join(__dirname, '../../temp', String(jobId))
    fs.mkdirSync(jobDir)

    const filePath = path.join(jobDir, filename)
    fs.writeFileSync(filePath, code)

    const command = `docker run --rm --memory="256m" --cpus="0.5" --network none --stop-timeout 10 -v "${jobDir}:/code" cpp-runner sh -c "g++ /code/${filename} -o /code/a.out && /code/a.out`
    // Your main.cpp sits in /temp on the host
    // Docker maps /temp → /code inside the container
    // g++ compiles it → produces a.out in the same folder
    // a.out runs and prints output
    // Container exits and is deleted by --rm
    // a.out and main.cpp are still in your /temp on the host — which is why we need the rmSync cleanup afterwards

    try {
        return await new Promise((resolve, reject) => {
            exec(command, (error, stdout, stderr) => {
                if (error) {
                    reject({ type: "execution", message: stderr })
                } else {
                    resolve(stdout)
                }
            })
        })
    } finally {
        fs.rmSync(jobDir, { recursive: true, force: true })
    }
}

module.exports = { executePython, executeJava, executecpp }