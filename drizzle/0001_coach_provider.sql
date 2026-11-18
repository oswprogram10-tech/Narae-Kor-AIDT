ALTER TABLE "assignments" ADD COLUMN "coach_provider" text DEFAULT 'auto' NOT NULL;--> statement-breakpoint
ALTER TABLE "coach_messages" ADD COLUMN "provider" text;