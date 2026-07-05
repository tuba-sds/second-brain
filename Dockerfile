# Dev-mode container for the Next.js app.
# The repo is volume-mounted at runtime (see docker-compose.yml), so this
# image mainly exists to provide Node + node_modules with Linux binaries.
FROM node:20-alpine

WORKDIR /app

COPY package.json package-lock.json* ./
RUN npm install

COPY . .

EXPOSE 3000

CMD ["npm", "run", "dev"]
