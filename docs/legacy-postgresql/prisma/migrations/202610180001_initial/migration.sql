-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "image" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "token" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "userId" TEXT NOT NULL,

    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "providerId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "accessToken" TEXT,
    "refreshToken" TEXT,
    "idToken" TEXT,
    "accessTokenExpiresAt" TIMESTAMP(3),
    "refreshTokenExpiresAt" TIMESTAMP(3),
    "scope" TEXT,
    "password" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Verification" (
    "id" TEXT NOT NULL,
    "identifier" TEXT NOT NULL,
    "value" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Verification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Club" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "logoUrl" TEXT,

    CONSTRAINT "Club_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Team" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "category" TEXT NOT NULL,

    CONSTRAINT "Team_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Season" (
    "id" TEXT NOT NULL,
    "clubId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "startsAt" TIMESTAMP(3) NOT NULL,
    "endsAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Season_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TeamSeason" (
    "id" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "seasonId" TEXT NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "TeamSeason_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Membership" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "teamId" TEXT NOT NULL,
    "role" TEXT NOT NULL,

    CONSTRAINT "Membership_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Player" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "photo" TEXT,
    "position" TEXT NOT NULL,

    CONSTRAINT "Player_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "RosterEntry" (
    "id" TEXT NOT NULL,
    "playerId" TEXT NOT NULL,
    "teamSeasonId" TEXT NOT NULL,
    "number" INTEGER NOT NULL,
    "active" BOOLEAN NOT NULL DEFAULT true,

    CONSTRAINT "RosterEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Game" (
    "id" TEXT NOT NULL,
    "teamSeasonId" TEXT NOT NULL,
    "opponent" TEXT NOT NULL,
    "date" TIMESTAMP(3) NOT NULL,
    "timezone" TEXT NOT NULL,
    "venue" TEXT NOT NULL,
    "competition" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "roster" JSONB NOT NULL,
    "rules" JSONB NOT NULL,
    "period" INTEGER NOT NULL,
    "remaining" INTEGER NOT NULL,
    "elapsed" INTEGER NOT NULL,
    "version" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "Game_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "GameEvent" (
    "id" TEXT NOT NULL,
    "gameId" TEXT NOT NULL,
    "mutationId" TEXT NOT NULL,
    "sequence" INTEGER NOT NULL,
    "payload" JSONB NOT NULL,

    CONSTRAINT "GameEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" TEXT NOT NULL,
    "teamSeasonId" TEXT NOT NULL,
    "at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "actor" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "detail" TEXT NOT NULL,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Session_token_key" ON "Session"("token");

-- CreateIndex
CREATE UNIQUE INDEX "TeamSeason_teamId_seasonId_key" ON "TeamSeason"("teamId", "seasonId");

-- CreateIndex
CREATE UNIQUE INDEX "Membership_userId_teamId_key" ON "Membership"("userId", "teamId");

-- CreateIndex
CREATE INDEX "RosterEntry_teamSeasonId_number_idx" ON "RosterEntry"("teamSeasonId", "number");

-- CreateIndex
CREATE UNIQUE INDEX "RosterEntry_teamSeasonId_playerId_key" ON "RosterEntry"("teamSeasonId", "playerId");

-- CreateIndex
CREATE INDEX "Game_teamSeasonId_date_idx" ON "Game"("teamSeasonId", "date");

-- CreateIndex
CREATE INDEX "Game_teamSeasonId_venue_status_idx" ON "Game"("teamSeasonId", "venue", "status");

-- CreateIndex
CREATE UNIQUE INDEX "GameEvent_gameId_mutationId_key" ON "GameEvent"("gameId", "mutationId");

-- CreateIndex
CREATE UNIQUE INDEX "GameEvent_gameId_sequence_key" ON "GameEvent"("gameId", "sequence");

-- CreateIndex
CREATE INDEX "AuditLog_teamSeasonId_at_idx" ON "AuditLog"("teamSeasonId", "at");

-- AddForeignKey
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Account" ADD CONSTRAINT "Account_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Team" ADD CONSTRAINT "Team_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Season" ADD CONSTRAINT "Season_clubId_fkey" FOREIGN KEY ("clubId") REFERENCES "Club"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSeason" ADD CONSTRAINT "TeamSeason_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TeamSeason" ADD CONSTRAINT "TeamSeason_seasonId_fkey" FOREIGN KEY ("seasonId") REFERENCES "Season"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_teamId_fkey" FOREIGN KEY ("teamId") REFERENCES "Team"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_playerId_fkey" FOREIGN KEY ("playerId") REFERENCES "Player"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_teamSeasonId_fkey" FOREIGN KEY ("teamSeasonId") REFERENCES "TeamSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Game" ADD CONSTRAINT "Game_teamSeasonId_fkey" FOREIGN KEY ("teamSeasonId") REFERENCES "TeamSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "GameEvent" ADD CONSTRAINT "GameEvent_gameId_fkey" FOREIGN KEY ("gameId") REFERENCES "Game"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_teamSeasonId_fkey" FOREIGN KEY ("teamSeasonId") REFERENCES "TeamSeason"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- One active jersey per team and season. Archived entries retain their historical number.
CREATE UNIQUE INDEX "RosterEntry_active_jersey_unique" ON "RosterEntry" ("teamSeasonId", "number") WHERE "active" = true;
ALTER TABLE "Membership" ADD CONSTRAINT "Membership_role_check" CHECK ("role" IN ('ADMIN','COACH','SCORER','READER'));
ALTER TABLE "RosterEntry" ADD CONSTRAINT "RosterEntry_number_check" CHECK ("number" BETWEEN 0 AND 99);
ALTER TABLE "Game" ADD CONSTRAINT "Game_venue_check" CHECK ("venue" IN ('HOME','AWAY','NEUTRAL'));
ALTER TABLE "Game" ADD CONSTRAINT "Game_status_check" CHECK ("status" IN ('SCHEDULED','LIVE','FINAL','CANCELLED'));
