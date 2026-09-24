FROM node:20-alpine

WORKDIR /app

COPY package*.json ./
RUN npm ci --omit=dev && npm cache clean --force

COPY prisma ./prisma
RUN npx prisma generate

COPY . .

ENV NODE_ENV=production
ENV TRUST_PROXY=1

EXPOSE 10000

CMD ["sh", "-c", "npx prisma migrate deploy && node server.js"]
