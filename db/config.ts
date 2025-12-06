import { defineDb } from "astro:db";
import {
  HomeworkRequests,
  HomeworkResponses,
  HomeworkJobs,
} from "./tables";

export default defineDb({
  tables: {
    HomeworkRequests,
    HomeworkResponses,
    HomeworkJobs,
  },
});
