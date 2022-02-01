FROM node:17

WORKDIR /usr/src/app
COPY package* ./

RUN npm install

COPY src .

## Run the build step and delete everything only used for build afterwards
RUN npm run build
RUN npm prune --production
RUN rm -rf clientjs

ENV NODE_ENV production
ENV PORT 3001
EXPOSE $PORT

CMD [ "npm", "start" ]