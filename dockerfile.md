FROM node:22-bookworm-slim
RUN apt-get update && apt-get install -y --no-install-recommends exiftool && rm -rf /var/lib/apt/lists/*
WORKDIR /app
COPY package*.json ./
RUN npm install
COPY . .
RUN npm run build
ENV NODE_ENV=production HOST=127.0.0.1 PORT=3000
EXPOSE 3000
CMD ["node","server/index.js"]

