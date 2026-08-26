# Optional: containerize the app (e.g. to host a public demo instance where
# visitors paste their own API key). Not needed for the workshop itself.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js ./
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
