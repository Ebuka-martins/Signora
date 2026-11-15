FROM node:18-slim

RUN apt-get update && \
    apt-get install -y --no-install-recommends \
      libreoffice-writer \
      fonts-dejavu-core \
      fonts-liberation \
    && apt-get clean && \
    rm -rf /var/lib/apt/lists/*

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

RUN mkdir -p tmp

EXPOSE 3000

CMD ["node", "server/index.js"]