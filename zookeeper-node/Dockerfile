FROM node:20-alpine

WORKDIR /app

COPY package.json /app/package.json
RUN npm install

COPY src /app/src

ENV PORT=4000
EXPOSE 4000

CMD ["npm", "run", "start"]
