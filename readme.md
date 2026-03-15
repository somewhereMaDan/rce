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