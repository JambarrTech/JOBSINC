-- Lier chaque conversation à la candidature qui l'a autorisée.
-- Colonne nullable : les conversations historiques restent valides sans candidature liée.

-- AlterTable
ALTER TABLE `Conversation` ADD COLUMN `applicationId` VARCHAR(191) NULL;

-- CreateIndex
CREATE UNIQUE INDEX `Conversation_applicationId_key` ON `Conversation`(`applicationId`);

-- AddForeignKey
ALTER TABLE `Conversation` ADD CONSTRAINT `Conversation_applicationId_fkey` FOREIGN KEY (`applicationId`) REFERENCES `Application`(`id`) ON DELETE SET NULL ON UPDATE CASCADE;
