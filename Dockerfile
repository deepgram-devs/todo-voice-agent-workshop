# Optional: run the app in a container instead of installing Node locally
# (see "No Node? No problem" in the README), or host a public demo instance
# where visitors paste their own API key. Not needed for the normal workshop
# path.
FROM node:22-alpine
WORKDIR /app
COPY package.json package-lock.json ./
RUN npm ci --omit=dev
COPY server.js verify.mjs ./
COPY public ./public
EXPOSE 3000
CMD ["node", "server.js"]
