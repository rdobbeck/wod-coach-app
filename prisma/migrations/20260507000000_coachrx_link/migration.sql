-- Add CoachRx linkage columns to ExerciseLibrary
ALTER TABLE "ExerciseLibrary"
  ADD COLUMN "coachrx_id" TEXT,
  ADD COLUMN "locked" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN "last_synced_at" TIMESTAMP(3);

CREATE UNIQUE INDEX "ExerciseLibrary_coachrx_id_key" ON "ExerciseLibrary"("coachrx_id");
CREATE INDEX "ExerciseLibrary_coachrxId_idx" ON "ExerciseLibrary"("coachrx_id");
