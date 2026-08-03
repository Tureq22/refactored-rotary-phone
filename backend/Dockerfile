FROM node:20-alpine
WORKDIR /app
COPY package*.json ./
RUN npm install --omit=dev
COPY . .
# roda como usuário sem privilégios (não root)
USER node
EXPOSE 3000
CMD ["node", "src/server.js"]
