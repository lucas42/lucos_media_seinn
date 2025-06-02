FROM node:24

WORKDIR /usr/src/app
COPY package* ./
COPY webpack.config.js ./

RUN npm install

COPY src src

## Run the build step and then delete everything which only gets used for the build
RUN npm run build

RUN rm -rf node_modules client service-worker webpack*
RUN npm install --omit=dev

ENV NODE_ENV production
ENV PORT 3001
EXPOSE $PORT

CMD [ "npm", "start" ]
