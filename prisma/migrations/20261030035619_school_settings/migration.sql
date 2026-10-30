-- CreateTable
CREATE TABLE "school_settings" (
    "id" INTEGER NOT NULL DEFAULT 1,
    "attendance_warn_below" INTEGER NOT NULL DEFAULT 80,
    "attendance_risk_below" INTEGER NOT NULL DEFAULT 70,
    "mark_weights" JSONB NOT NULL DEFAULT '{"classwork": 1, "quiz": 2, "exam": 3, "homework": 1}',

    CONSTRAINT "school_settings_pkey" PRIMARY KEY ("id")
);


-- The single settings row, with the defaults.
INSERT INTO "school_settings" ("id") VALUES (1);
