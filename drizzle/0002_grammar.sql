CREATE TABLE "grammar_attempts" (
	"id" serial PRIMARY KEY NOT NULL,
	"submission_id" integer NOT NULL,
	"item_id" text NOT NULL,
	"attempt_no" integer NOT NULL,
	"correct" boolean NOT NULL,
	"reason" text NOT NULL,
	"feedback_level" text,
	"answer" jsonb NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "kind" text DEFAULT 'writing' NOT NULL;--> statement-breakpoint
ALTER TABLE "assignments" ADD COLUMN "activity_id" text;--> statement-breakpoint
ALTER TABLE "grammar_attempts" ADD CONSTRAINT "grammar_attempts_submission_id_submissions_id_fk" FOREIGN KEY ("submission_id") REFERENCES "public"."submissions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "grammar_attempts_submission" ON "grammar_attempts" USING btree ("submission_id");