-- AlterTable
ALTER TABLE "category_suggestion_rules" ADD COLUMN     "user_id" UUID;

-- AddForeignKey
ALTER TABLE "category_suggestion_rules" ADD CONSTRAINT "category_suggestion_rules_user_id_fkey" FOREIGN KEY ("user_id") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
