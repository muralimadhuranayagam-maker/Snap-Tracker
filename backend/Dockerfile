FROM node:20-alpine AS builder

WORKDIR /app

# Install openssl for Prisma
RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install

COPY tsconfig.json ./
COPY src ./src

# Generate Prisma Client and build TypeScript
RUN npx prisma generate
RUN npm run build

FROM node:20-alpine AS runner

WORKDIR /app

RUN apk add --no-cache openssl

COPY package*.json ./
COPY prisma ./prisma/

RUN npm install --omit=dev

COPY --from=builder /app/dist ./dist
COPY --from=builder /app/node_modules/.prisma ./node_modules/.prisma
COPY --from=builder /app/node_modules/@prisma ./node_modules/@prisma

EXPOSE 4000

ENV PORT=4000
ENV NODE_ENV=production

CMD ["sh", "-c", "npx prisma db push && npm run db:seed && node dist/index.js"]
