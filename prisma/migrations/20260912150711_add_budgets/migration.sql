-- CreateEnum
CREATE TYPE "BudgetSource" AS ENUM ('template', 'custom');

-- CreateTable
CREATE TABLE "budgets" (
    "id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "source" "BudgetSource" NOT NULL,
    "definition" JSONB NOT NULL,
    "priority" INTEGER NOT NULL,
    "active_from" DATE NOT NULL,
    "active_to" DATE,

    CONSTRAINT "budgets_pkey" PRIMARY KEY ("id")
);

-- AddForeignKey
ALTER TABLE "budgets" ADD CONSTRAINT "budgets_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
