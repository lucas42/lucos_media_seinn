FROM node:15

WORKDIR /usr/src/app
COPY package* ./

RUN npm install

COPY index.js ./
COPY v3.js ./
COPY views views
COPY public public
COPY clientjs clientjs

## Run the build step and delete everything only used for build afterwards
RUN npm run build
RUN npm prune --production
RUN rm -rf clientjs

ENV NODE_ENV production
ENV PORT 3001
EXPOSE $PORT

CMD [ "npm", "start" ]