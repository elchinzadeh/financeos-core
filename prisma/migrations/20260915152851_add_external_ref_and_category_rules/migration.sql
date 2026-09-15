-- AlterTable
ALTER TABLE "ledger_entries" ADD COLUMN     "external_ref" TEXT;

-- CreateTable
CREATE TABLE "category_suggestion_rules" (
    "id" UUID NOT NULL,
    "keyword" TEXT NOT NULL,
    "category_id" UUID NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "category_suggestion_rules_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "ledger_entries_account_id_external_ref_key" ON "ledger_entries"("account_id", "external_ref");

-- AddForeignKey
ALTER TABLE "category_suggestion_rules" ADD CONSTRAINT "category_suggestion_rules_category_id_fkey" FOREIGN KEY ("category_id") REFERENCES "categories"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
