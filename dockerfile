FROM node:16 as builder
WORKDIR /usr/src/app
COPY package.json ./
COPY package-lock.json ./
RUN npm ci --production
RUN npm install -g typescript
COPY . .
RUN npm run build

FROM node:16-slim
WORKDIR /usr/src/app
COPY --from=builder /usr/src/app/ .
EXPOSE 3000
CMD ["node","dist/src/main.js"]