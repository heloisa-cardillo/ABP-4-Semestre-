import 'dotenv/config';
import { defineConfig } from 'prisma/config';

export default defineConfig({
  schema: 'prisma/schema.prisma',
  migrations: {
    path: 'prisma/migrations',
    seed: 'tsx prisma/seed.ts',
  },
  // `prisma generate` roda sem banco (CI, build da imagem); migrate e seed exigem DATABASE_URL.
  ...(process.env.DATABASE_URL && { datasource: { url: process.env.DATABASE_URL } }),
});
