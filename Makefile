REPO=quay.io/jcmoraisjr/coreos-bootstrap
TAG=0.0

build:
	docker build -t $(REPO):$(TAG) .

node-run:
	node bootstrap.js -c sample

container-run: build
	docker stop coreos-bootstrap || :
	docker rm coreos-bootstrap || :
	docker run -d --name coreos-bootstrap -v ${PWD}/sample:/opt/sample -p 8080:8080 $(REPO):$(TAG) -c /opt/sample
