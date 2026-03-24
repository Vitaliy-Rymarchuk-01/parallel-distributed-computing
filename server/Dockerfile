FROM node:20-alpine

WORKDIR /app

COPY package.json /app/package.json
COPY package-lock.json /app/package-lock.json
RUN npm install

COPY src /app/src

ENV PORT=3001
EXPOSE 3001

CMD ["npm", "run", "start"]
