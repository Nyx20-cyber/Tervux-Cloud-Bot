FROM node:20-alpine

WORKDIR /app

RUN apk add --no-cache ffmpeg python3 ca-certificates

COPY package*.json ./
RUN npm ci --omit=dev

COPY . .

# Ensure local helper binaries required by bot commands are executable.
RUN chmod +x /app/bin/yt-dlp \
  && python3 --version \
  && ffmpeg -version >/dev/null \
  && /app/bin/yt-dlp --version >/dev/null

ENV NODE_ENV=production
EXPOSE 5000

CMD ["npm", "run", "start"]
