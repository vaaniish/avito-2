import { PrismaClient } from '@prisma/client';
const p = new PrismaClient();
void p.checkoutIdempotencyKey.findMany();
