FROM node:25

WORKDIR /usr/src/app
COPY package* ./
COPY webpack.config.js ./

RUN npm ci

COPY src src

## Run the build step and then delete everything which only gets used for the build
RUN npm run build

RUN rm -rf node_modules client service-worker webpack*
RUN npm ci --omit=dev

ENV NODE_ENV production

CMD [ "npm", "start" ]
