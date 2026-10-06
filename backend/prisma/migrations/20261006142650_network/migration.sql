-- CreateTable
CREATE TABLE "NetworkPost" (
    "id" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "imageUrl" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "NetworkPost_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkComment" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "authorId" TEXT NOT NULL,
    "content" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkComment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkLike" (
    "id" TEXT NOT NULL,
    "postId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkLike_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "NetworkFollow" (
    "id" TEXT NOT NULL,
    "followerId" TEXT NOT NULL,
    "followingId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NetworkFollow_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RefreshToken" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RefreshToken_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "NetworkPost_authorId_createdAt_idx" ON "NetworkPost"("authorId", "createdAt");

-- CreateIndex
CREATE INDEX "NetworkPost_createdAt_idx" ON "NetworkPost"("createdAt");

-- CreateIndex
CREATE INDEX "NetworkComment_postId_createdAt_idx" ON "NetworkComment"("postId", "createdAt");

-- CreateIndex
CREATE INDEX "NetworkLike_postId_idx" ON "NetworkLike"("postId");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkLike_postId_userId_key" ON "NetworkLike"("postId", "userId");

-- CreateIndex
CREATE INDEX "NetworkFollow_followerId_idx" ON "NetworkFollow"("followerId");

-- CreateIndex
CREATE INDEX "NetworkFollow_followingId_idx" ON "NetworkFollow"("followingId");

-- CreateIndex
CREATE UNIQUE INDEX "NetworkFollow_followerId_followingId_key" ON "NetworkFollow"("followerId", "followingId");

-- CreateIndex
CREATE UNIQUE INDEX "RefreshToken_tokenHash_key" ON "RefreshToken"("tokenHash");

-- CreateIndex
CREATE INDEX "RefreshToken_userId_idx" ON "RefreshToken"("userId");

-- CreateIndex
CREATE INDEX "RefreshToken_expiresAt_idx" ON "RefreshToken"("expiresAt");

-- CreateIndex
CREATE INDEX "Application_jobId_status_idx" ON "Application"("jobId", "status");

-- CreateIndex
CREATE INDEX "Job_location_idx" ON "Job"("location");

-- CreateIndex
CREATE INDEX "Job_contractType_idx" ON "Job"("contractType");

-- CreateIndex
CREATE INDEX "Job_companyId_isOpen_createdAt_idx" ON "Job"("companyId", "isOpen", "createdAt");

-- AddForeignKey
ALTER TABLE "NetworkPost" ADD CONSTRAINT "NetworkPost_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkComment" ADD CONSTRAINT "NetworkComment_postId_fkey" FOREIGN KEY ("postId") REFERENCES "NetworkPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkComment" ADD CONSTRAINT "NetworkComment_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkLike" ADD CONSTRAINT "NetworkLike_postId_fkey" FOREIGN KEY ("postId") REFERENCES "NetworkPost"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkLike" ADD CONSTRAINT "NetworkLike_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkFollow" ADD CONSTRAINT "NetworkFollow_followerId_fkey" FOREIGN KEY ("followerId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "NetworkFollow" ADD CONSTRAINT "NetworkFollow_followingId_fkey" FOREIGN KEY ("followingId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RefreshToken" ADD CONSTRAINT "RefreshToken_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
