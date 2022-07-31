FROM node:18

WORKDIR /usr/src/app
COPY package* ./
COPY webpack.config.js ./

RUN npm install

COPY src src

## Run the build step and delete everything only used for build afterwards
RUN npm run build
RUN npm prune --production
RUN rm -rf client
RUN rm -rf service-worker

ENV NODE_ENV production
ENV PORT 3001
EXPOSE $PORT

CMD [ "npm", "start" ]