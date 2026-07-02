import { PrismaClient } from '@prisma/client';
import dotenv from 'dotenv';

// Load environment variables for unit tests / runtime
dotenv.config();

export const prisma = new PrismaClient();

