docker build -t python-runner ./docker/python
docker build -t java-runner ./docker/java
docker build -t cpp-runner ./docker/cpp


command - docker run --rm -v ${PWD}:/code python-runner python /code/test.py

** explanation --
docker run — start a new container
--rm — automatically delete the container after it finishes running
-v ${PWD}:/code — volume mount

${PWD} = your current local folder (docker/python)
/code = a directory inside the container
: separates them — meaning "map my local folder TO container's /code"
So test.py sitting in docker/python becomes accessible at /code/test.py inside the container

python-runner — the image to use (you built this earlier)
python /code/test.py — the command to run inside the container

python = the python interpreter inside the container
/code/test.py = the file to execute, which exists because of the volume mount above

**** TO RUN, I've created alias in git bash
~/OneDrive/Desktop/work/rce (main)
$ alias rce-start='bash build-images.sh && docker compose up'

~/OneDrive/Desktop/work/rce (main)
$ alias rce-down='docker compose down'











****Q. Why — the Docker socket?

- /var/run/docker.sock:/var/run/docker.sock
This gives rce-server a direct line to the host Docker daemon. So when your server calls:
spawn('docker', ['run', '--rm', '-i', ...])
```

It's not Docker-in-Docker. It's the server container **asking the host daemon** to spin up a new container. The host daemon creates python-runner as a sibling.

---

## The full correct flow
```
1. User submits Python code via WebSocket
        │
        ▼
2. rce-server container
   - writes file to /app/temp/uuid.py     (inside container)
   - /app/temp is volume-mounted from      C:\...\rce\server\temp (on host)
   - so file ALSO exists on host at        C:\...\rce\server\temp\uuid.py
        │
        │ sends docker run command through /var/run/docker.sock
        ▼
3. Host Docker daemon receives:
   docker run -v C:\...\server\temp:/code python-runner python -u /code/uuid.py
   - mounts host's server\temp folder into python-runner as /code
   - file is visible at /code/uuid.py inside python-runner
        │
        ▼
4. python-runner container (sibling of rce-server)
   - executes /code/uuid.py
   - streams stdout/stderr back through the socket
        │
        ▼
5. rce-server container
   - receives output, sends to client via WebSocket
   - deletes temp file after execution
```

---

## The volume is the bridge

The volume mount is what connects all three:
```
rce-server container ──writes──→ /app/temp
                                      │ (same physical folder via volume)
Windows host         ←────────────── C:\...\server\temp
                                      │ (same physical folder via -v flag)  
python-runner        ──reads──→  /code



****Q. Why we used docker CLI inside the server


spawn('docker', ['run', '--rm', '-i', ...])
```

`spawn('docker', ...)` looks for a `docker` **binary/executable** in the container's PATH to run. The Docker socket alone is just a 
communication channel — like a phone line. But you still need a **phone** (the CLI binary) to talk through it.

---

## The analogy
```
Docker socket (/var/run/docker.sock)  =  phone line
Docker CLI binary (docker)            =  the phone handset
Host Docker daemon                    =  the person on the other end