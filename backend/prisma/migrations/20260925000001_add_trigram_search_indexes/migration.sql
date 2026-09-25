-- Recherche full-text : index trigram.
--
-- Toutes les recherches de l'application utilisent `contains` avec
-- `mode: 'insensitive'`, que Prisma compile en `ILIKE '%terme%'`. Un motif
-- commençant par `%` ne peut pas utiliser un index B-tree : PostgreSQL fait
-- donc un Seq Scan sur chaque recherche, sur les tables suivantes :
--   - adminController.search   (User, CandidateProfile, Company, Job)
--   - skillController.listSkills
--   - catalogue public des offres et des entreprises
--
-- `pg_trgm` fournit des index GIN compatibles avec `ILIKE '%…%'`, ce qui
-- transforme un scan linéaire en recherche par index.
CREATE EXTENSION IF NOT EXISTS pg_trgm;

-- Recherche admin + catalogue
CREATE INDEX IF NOT EXISTS "User_email_trgm_idx"
  ON "User" USING gin ("email" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Company_name_trgm_idx"
  ON "Company" USING gin ("name" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Company_sector_trgm_idx"
  ON "Company" USING gin ("sector" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Job_title_trgm_idx"
  ON "Job" USING gin ("title" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Job_location_trgm_idx"
  ON "Job" USING gin ("location" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "CandidateProfile_firstName_trgm_idx"
  ON "CandidateProfile" USING gin ("firstName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "CandidateProfile_lastName_trgm_idx"
  ON "CandidateProfile" USING gin ("lastName" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "CandidateProfile_skills_trgm_idx"
  ON "CandidateProfile" USING gin ("skills" gin_trgm_ops);

CREATE INDEX IF NOT EXISTS "Skill_name_trgm_idx"
  ON "Skill" USING gin ("name" gin_trgm_ops);

-- FAQ / témoignages : recherche et unicité applicative sur la question.
-- Attention : le modèle est mappé en "FAQ" (@@map dans schema.prisma), pas
-- "Faq" — sinon 42P01 « relation "Faq" does not exist ».
CREATE INDEX IF NOT EXISTS "Faq_question_trgm_idx"
  ON "FAQ" USING gin ("question" gin_trgm_ops);
CREATE INDEX IF NOT EXISTS "Feedback_text_trgm_idx"
  ON "Feedback" USING gin ("text" gin_trgm_ops);
