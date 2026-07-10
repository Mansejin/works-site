FROM node:22-alpine

WORKDIR /app

COPY package.json ./
RUN npm install --omit=dev

COPY server.js ./

ENV HOST=0.0.0.0
ENV PORT=8789
ENV CONTI_DATA_DIR=/data/conti

EXPOSE 8789

CMD ["node", "server.js"]
