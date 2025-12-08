import { defineAction, ActionError, type ActionAPIContext } from "astro:actions";
import { z } from "astro:schema";
import {
  HomeworkJobs,
  HomeworkRequests,
  HomeworkResponses,
  and,
  db,
  eq,
} from "astro:db";

function requireUser(context: ActionAPIContext) {
  const locals = context.locals as App.Locals | undefined;
  const user = locals?.user;

  if (!user) {
    throw new ActionError({
      code: "UNAUTHORIZED",
      message: "You must be signed in to perform this action.",
    });
  }

  return user;
}

async function getOwnedRequest(requestId: number, userId: string) {
  const [request] = await db
    .select()
    .from(HomeworkRequests)
    .where(and(eq(HomeworkRequests.id, requestId), eq(HomeworkRequests.userId, userId)));

  if (!request) {
    throw new ActionError({
      code: "NOT_FOUND",
      message: "Homework request not found.",
    });
  }

  return request;
}

export const server = {
  createHomeworkRequest: defineAction({
    input: z.object({
      subject: z.string().optional(),
      gradeLevel: z.string().optional(),
      topic: z.string().optional(),
      title: z.string().optional(),
      questionText: z.string().min(1),
      attachments: z.record(z.any()).optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      const now = new Date();

      const [request] = await db
        .insert(HomeworkRequests)
        .values({
          userId: user.id,
          subject: input.subject,
          gradeLevel: input.gradeLevel,
          topic: input.topic,
          title: input.title,
          questionText: input.questionText,
          attachments: input.attachments,
          status: "open",
          createdAt: now,
          updatedAt: now,
        })
        .returning();

      return {
        success: true,
        data: { request },
      };
    },
  }),

  updateHomeworkRequest: defineAction({
    input: z
      .object({
        id: z.number().int(),
        subject: z.string().optional(),
        gradeLevel: z.string().optional(),
        topic: z.string().optional(),
        title: z.string().optional(),
        questionText: z.string().optional(),
        attachments: z.record(z.any()).optional(),
        status: z.enum(["open", "answered", "closed"]).optional(),
      })
      .refine(
        (input) =>
          input.subject !== undefined ||
          input.gradeLevel !== undefined ||
          input.topic !== undefined ||
          input.title !== undefined ||
          input.questionText !== undefined ||
          input.attachments !== undefined ||
          input.status !== undefined,
        { message: "At least one field must be provided to update." }
      ),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedRequest(input.id, user.id);

      const [request] = await db
        .update(HomeworkRequests)
        .set({
          ...(input.subject !== undefined ? { subject: input.subject } : {}),
          ...(input.gradeLevel !== undefined ? { gradeLevel: input.gradeLevel } : {}),
          ...(input.topic !== undefined ? { topic: input.topic } : {}),
          ...(input.title !== undefined ? { title: input.title } : {}),
          ...(input.questionText !== undefined
            ? { questionText: input.questionText }
            : {}),
          ...(input.attachments !== undefined
            ? { attachments: input.attachments }
            : {}),
          ...(input.status !== undefined ? { status: input.status } : {}),
          updatedAt: new Date(),
        })
        .where(eq(HomeworkRequests.id, input.id))
        .returning();

      return {
        success: true,
        data: { request },
      };
    },
  }),

  listHomeworkRequests: defineAction({
    input: z
      .object({
        status: z.enum(["open", "answered", "closed"]).optional(),
      })
      .optional(),
    handler: async (input, context) => {
      const user = requireUser(context);
      const filters = [eq(HomeworkRequests.userId, user.id)];

      if (input?.status) {
        filters.push(eq(HomeworkRequests.status, input.status));
      }

      const requests = await db
        .select()
        .from(HomeworkRequests)
        .where(and(...filters));

      return {
        success: true,
        data: { items: requests, total: requests.length },
      };
    },
  }),

  addHomeworkResponse: defineAction({
    input: z.object({
      requestId: z.number().int(),
      answerText: z.string().min(1),
      steps: z.array(z.any()).optional(),
      isAccepted: z.boolean().optional(),
      rating: z.number().min(1).max(5).optional(),
      feedback: z.string().optional(),
      source: z.enum(["ai", "user", "teacher", "other"]).optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedRequest(input.requestId, user.id);

      const [response] = await db
        .insert(HomeworkResponses)
        .values({
          requestId: input.requestId,
          userId: user.id,
          source: input.source ?? "ai",
          answerText: input.answerText,
          steps: input.steps,
          isAccepted: input.isAccepted ?? false,
          rating: input.rating,
          feedback: input.feedback,
          createdAt: new Date(),
        })
        .returning();

      if (input.isAccepted) {
        await db
          .update(HomeworkRequests)
          .set({ status: "answered", updatedAt: new Date() })
          .where(eq(HomeworkRequests.id, input.requestId));
      }

      return {
        success: true,
        data: { response },
      };
    },
  }),

  updateHomeworkResponse: defineAction({
    input: z
      .object({
        id: z.number().int(),
        requestId: z.number().int(),
        isAccepted: z.boolean().optional(),
        rating: z.number().min(1).max(5).optional(),
        feedback: z.string().optional(),
      })
      .refine(
        (input) =>
          input.isAccepted !== undefined ||
          input.rating !== undefined ||
          input.feedback !== undefined,
        { message: "At least one field must be provided to update." }
      ),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedRequest(input.requestId, user.id);

      const [existing] = await db
        .select()
        .from(HomeworkResponses)
        .where(
          and(
            eq(HomeworkResponses.id, input.id),
            eq(HomeworkResponses.requestId, input.requestId)
          )
        );

      if (!existing) {
        throw new ActionError({
          code: "NOT_FOUND",
          message: "Response not found.",
        });
      }

      const [response] = await db
        .update(HomeworkResponses)
        .set({
          ...(input.isAccepted !== undefined ? { isAccepted: input.isAccepted } : {}),
          ...(input.rating !== undefined ? { rating: input.rating } : {}),
          ...(input.feedback !== undefined ? { feedback: input.feedback } : {}),
        })
        .where(eq(HomeworkResponses.id, input.id))
        .returning();

      if (input.isAccepted !== undefined) {
        await db
          .update(HomeworkRequests)
          .set({
            status: input.isAccepted ? "answered" : "open",
            updatedAt: new Date(),
          })
          .where(eq(HomeworkRequests.id, input.requestId));
      }

      return {
        success: true,
        data: { response },
      };
    },
  }),

  listHomeworkResponses: defineAction({
    input: z.object({ requestId: z.number().int() }),
    handler: async (input, context) => {
      const user = requireUser(context);
      await getOwnedRequest(input.requestId, user.id);

      const responses = await db
        .select()
        .from(HomeworkResponses)
        .where(eq(HomeworkResponses.requestId, input.requestId));

      return {
        success: true,
        data: { items: responses, total: responses.length },
      };
    },
  }),

  createHomeworkJob: defineAction({
    input: z.object({
      requestId: z.number().int().optional(),
      jobType: z
        .enum(["explanation", "step_by_step", "hint_only", "full_solution", "other"])
        .optional(),
      input: z.record(z.any()).optional(),
      output: z.record(z.any()).optional(),
      status: z.enum(["pending", "completed", "failed"]).optional(),
    }),
    handler: async (input, context) => {
      const user = requireUser(context);

      if (input.requestId !== undefined) {
        await getOwnedRequest(input.requestId, user.id);
      }

      const [job] = await db
        .insert(HomeworkJobs)
        .values({
          requestId: input.requestId,
          userId: user.id,
          jobType: input.jobType ?? "full_solution",
          input: input.input,
          output: input.output,
          status: input.status ?? "completed",
          createdAt: new Date(),
        })
        .returning();

      return {
        success: true,
        data: { job },
      };
    },
  }),

  listHomeworkJobs: defineAction({
    input: z
      .object({
        requestId: z.number().int().optional(),
      })
      .optional(),
    handler: async (input, context) => {
      const user = requireUser(context);
      const filters = [eq(HomeworkJobs.userId, user.id)];

      if (input?.requestId !== undefined) {
        filters.push(eq(HomeworkJobs.requestId, input.requestId));
      }

      const jobs = await db.select().from(HomeworkJobs).where(and(...filters));

      return {
        success: true,
        data: { items: jobs, total: jobs.length },
      };
    },
  }),
};
