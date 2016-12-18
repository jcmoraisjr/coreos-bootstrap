FROM alpine:3.4
RUN apk add --no-cache nodejs
RUN mkdir -p /opt/node
WORKDIR /opt/node
COPY package.json /opt/node/
RUN npm install --production
COPY bootstrap.js /opt/node/
COPY lib/ /opt/node/lib/
USER 1000
ENTRYPOINT ["node", "/opt/node/bootstrap.js"]
