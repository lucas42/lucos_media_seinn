FROM node:15

WORKDIR /usr/src/app
COPY . .

RUN npm install

ENV NODE_ENV production
ENV PORT 3001
EXPOSE $PORT

CMD [ "npm", "start" ]