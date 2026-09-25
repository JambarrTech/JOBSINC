-- Index pour uploadAuth : résolution de « qui a le droit de lire ce fichier ».
--
-- Le middleware transforme le chemin de la requête en chemin applicatif
-- (`/uploads/cvs/<uuid>.pdf`) et l'utilise comme predicate sur `cvUrl` /
-- `avatarUrl`. Sans index, chaque lecture de fichier protégé déclenchait un
-- seq scan sur CandidateProfile — c'est-à-dire une requête base complète à
-- chaque affichage d'un CV ou d'une photo dans une liste de candidats.
--
-- Index B-tree (et non trigram) : la valeur est une égalité exacte sur une
-- chaîne longue, ce n'est pas un motif de recherche.

CREATE INDEX IF NOT EXISTS "CandidateProfile_cvUrl_idx" ON "CandidateProfile"("cvUrl");

CREATE INDEX IF NOT EXISTS "CandidateProfile_avatarUrl_idx" ON "CandidateProfile"("avatarUrl");
