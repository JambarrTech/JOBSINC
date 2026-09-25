-- Index manquants sur les chemins de requête réellement utilisés.
--
-- Ces index manquaient dans la migration init : les tris et filtres concernés
-- tombaient sur des Seq Scan dès que les tables grossissent.

-- Activity/analytics : administration sur les 14 derniers jours
CREATE INDEX IF NOT EXISTS "User_createdAt_idx" ON "User"("createdAt");

-- Trends admin + fenêtre d'activité du dashboard entreprise
CREATE INDEX IF NOT EXISTS "Application_createdAt_idx" ON "Application"("createdAt");

-- Tri des profils candidats (admin + stats)
CREATE INDEX IF NOT EXISTS "CandidateProfile_createdAt_idx" ON "CandidateProfile"("createdAt");
CREATE INDEX IF NOT EXISTS "CandidateProfile_updatedAt_idx" ON "CandidateProfile"("updatedAt");

-- Tri des recrutements / employés en cours
CREATE INDEX IF NOT EXISTS "Employment_startDate_idx" ON "Employment"("startDate");

-- Toutes les lectures publiques d'entreprises passent par isApproved
CREATE INDEX IF NOT EXISTS "Company_isApproved_idx" ON "Company"("isApproved");

-- Entretiens à venir (admin) et par candidat
CREATE INDEX IF NOT EXISTS "Interview_scheduledAt_idx" ON "Interview"("scheduledAt");
