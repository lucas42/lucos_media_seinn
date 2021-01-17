FROM node:15

WORKDIR /usr/src/app
COPY package* ./

RUN npm install

COPY index.js ./
COPY public ./

ENV NODE_ENV production
ENV PORT 3001
EXPOSE $PORT

CMD [ "npm", "start" ]