-- AlterTable
ALTER TABLE "users" ADD COLUMN "role" TEXT NOT NULL DEFAULT 'EDITOR';

-- Los usuarios existentes (el admin inicial) pasan a ADMIN
UPDATE "users" SET "role" = 'ADMIN';
