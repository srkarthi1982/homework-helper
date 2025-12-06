import { column, defineTable, NOW } from "astro:db";

/**
 * A homework question asked by a student.
 */
export const HomeworkRequests = defineTable({
  columns: {
    id: column.number({ primaryKey: true, autoIncrement: true }),

    userId: column.text(), // parent Users.id

    // Basic classification
    subject: column.text({ optional: true }),     // "Math", "Physics", etc.
    gradeLevel: column.text({ optional: true }),  // "Grade 8", "11th", etc.
    topic: column.text({ optional: true }),

    // What they actually asked
    title: column.text({ optional: true }),
    questionText: column.text(),

    // Optional attachment metadata: images/PDFs/links
    attachments: column.json({ optional: true }),

    status: column.text({
      enum: ["open", "answered", "closed"],
      default: "open",
    }),

    createdAt: column.date({ default: NOW }),
    updatedAt: column.date({ default: NOW }),
  },
});

/**
 * Solutions / explanations for a request.
 * Can store multiple responses (AI variants or future human answers).
 */
export const HomeworkResponses = defineTable({
  columns: {
    id: column.number({ primaryKey: true, autoIncrement: true }),

    requestId: column.number({
      references: () => HomeworkRequests.columns.id,
    }),

    // Who produced it (if needed)
    userId: column.text({ optional: true }), // if later you allow tutor answers
    source: column.text({
      enum: ["ai", "user", "teacher", "other"],
      default: "ai",
    }),

    // Main explanation / solution
    answerText: column.text(),

    // Optional structured solution steps (for UI)
    steps: column.json({ optional: true }),

    // Whether the student marked this as accepted
    isAccepted: column.boolean({ default: false }),

    // Rating / feedback from student
    rating: column.number({ optional: true }), // 1–5
    feedback: column.text({ optional: true }),

    createdAt: column.date({ default: NOW }),
  },
});

/**
 * AI generation jobs for homework answers.
 */
export const HomeworkJobs = defineTable({
  columns: {
    id: column.number({ primaryKey: true, autoIncrement: true }),

    requestId: column.number({
      references: () => HomeworkRequests.columns.id,
      optional: true,
    }),

    userId: column.text({ optional: true }),

    jobType: column.text({
      enum: ["explanation", "step_by_step", "hint_only", "full_solution", "other"],
      default: "full_solution",
    }),

    input: column.json({ optional: true }),
    output: column.json({ optional: true }),

    status: column.text({
      enum: ["pending", "completed", "failed"],
      default: "completed",
    }),

    createdAt: column.date({ default: NOW }),
  },
});

export const homeworkHelperTables = {
  HomeworkRequests,
  HomeworkResponses,
  HomeworkJobs,
} as const;
