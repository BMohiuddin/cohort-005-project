// PROTOTYPE — throwaway Knock spike for "Does Knock hold up against Cadence?"
// (BMohiuddin/cohort-005-project#25). Lives only on the prototype/knock-spike
// branch. No error handling, no tests. Delete, don't refactor.
import { Knock, signUserToken } from "@knocklabs/node";
import { and, eq, isNotNull, isNull, ne } from "drizzle-orm";
import { alias } from "drizzle-orm/sqlite-core";
import { db } from "~/db";
import {
  comments,
  courses,
  enrollments,
  lessons,
  modules,
  users,
} from "~/db/schema";

try {
  process.loadEnvFile(".env");
} catch {
  // no .env: the page says which keys are missing
}

export const KNOCK_API = "https://api.knock.app";

// Workflow keys and categories the spike expects in the Knock dashboard.
// See docs/prototypes/knock-spike.md for the dashboard checklist.
export const WORKFLOWS = {
  discussionReply: "discussion-reply", // category: discussions
  newEnrollment: "new-enrollment", // category: enrollments, off by default
} as const;
export const CATEGORIES = {
  discussions: "discussions",
  enrollments: "enrollments",
} as const;

export function missingEnv() {
  return [
    "KNOCK_PUBLIC_API_KEY",
    "KNOCK_SECRET_API_KEY",
    "KNOCK_SIGNING_KEY",
    "KNOCK_FEED_CHANNEL_ID",
  ].filter((k) => !process.env[k]);
}

export function env() {
  return {
    publicKey: process.env.KNOCK_PUBLIC_API_KEY!,
    secretKey: process.env.KNOCK_SECRET_API_KEY!,
    feedChannelId: process.env.KNOCK_FEED_CHANNEL_ID!,
  };
}

export function knock() {
  return new Knock({ apiKey: env().secretKey });
}

// Cadence user id → Knock user id. Prefixed so dev reseeds can't collide with
// anything else in the environment.
export const knockUserId = (userId: number) => `cadence-${userId}`;

/** Check 1: RS256 user token, signed by our server, for the DevUI user. */
export function signTokenFor(userId: number) {
  // Reads KNOCK_SIGNING_KEY from the env by default.
  return signUserToken(knockUserId(userId), { expiresInSeconds: 60 * 60 });
}

export function decodeJwt(token: string) {
  const [header, payload] = token
    .split(".")
    .slice(0, 2)
    .map((p) => JSON.parse(Buffer.from(p, "base64url").toString("utf8")));
  return { header, payload };
}

/** Upsert the Cadence user as a Knock recipient (user sync is fog; this is the minimum). */
export async function identify(userId: number) {
  const user = db.select().from(users).where(eq(users.id, userId)).get();
  if (!user) throw new Error(`No user ${userId}`);
  return knock().users.update(knockUserId(userId), {
    name: user.name,
    email: user.email,
    // custom property: lets later work target "all Platform Admins"
    cadence_role: user.role,
  } as never);
}

// ─── Client-side feed path (public key + user token), what our own Feed UI will use ───

function clientHeaders(token: string) {
  return {
    Authorization: `Bearer ${env().publicKey}`,
    "X-Knock-User-Token": token,
    "Content-Type": "application/json",
  };
}

/** Check 3: list items + unread/unseen counts, headless, as the user. */
export async function fetchFeed(userId: number, token: string) {
  const res = await fetch(
    `${KNOCK_API}/v1/users/${knockUserId(userId)}/feeds/${env().feedChannelId}?page_size=20`,
    { headers: clientHeaders(token) }
  );
  return { status: res.status, body: (await res.json()) as FeedResponse };
}

/** Check 3: mark messages read / seen, as the user. */
export async function markMessages(
  token: string,
  status: "read" | "seen" | "unread" | "unseen",
  messageIds: string[]
) {
  const res = await fetch(`${KNOCK_API}/v1/messages/batch/${status}`, {
    method: "POST",
    headers: clientHeaders(token),
    body: JSON.stringify({ message_ids: messageIds }),
  });
  return { status: res.status, body: await res.json() };
}

export type FeedResponse = {
  entries?: Array<{
    id: string;
    inserted_at: string;
    read_at: string | null;
    seen_at: string | null;
    source: { key: string; categories?: string[] };
    data: Record<string, unknown> | null;
    blocks: Array<{ name: string; rendered?: string; content?: string }>;
  }>;
  meta?: { unread_count: number; unseen_count: number; total_count: number };
  code?: string;
  message?: string;
};

// ─── Triggering (check 2) ───

/** A real Discussion Reply in the DB whose question was asked by someone else. */
export function findRealDiscussionReply(questionAuthorId?: number) {
  const question = alias(comments, "question");
  const q = db
    .select({
      replyId: comments.id,
      replyBody: comments.body,
      replierId: comments.userId,
      questionId: question.id,
      questionAuthorId: question.userId,
      lessonId: lessons.id,
      lessonTitle: lessons.title,
      courseSlug: courses.slug,
    })
    .from(comments)
    .innerJoin(question, eq(question.id, comments.parentId))
    .innerJoin(lessons, eq(lessons.id, comments.lessonId))
    .innerJoin(modules, eq(modules.id, lessons.moduleId))
    .innerJoin(courses, eq(courses.id, modules.courseId))
    .where(
      and(
        isNotNull(comments.parentId),
        isNull(comments.deletedAt),
        ne(comments.userId, question.userId),
        questionAuthorId ? eq(question.userId, questionAuthorId) : undefined
      )
    );
  return q.get();
}

export async function triggerDiscussionReply(
  reply: NonNullable<ReturnType<typeof findRealDiscussionReply>>
) {
  await identify(reply.questionAuthorId);
  await identify(reply.replierId);
  const replier = db
    .select()
    .from(users)
    .where(eq(users.id, reply.replierId))
    .get()!;
  return knock().workflows.trigger(WORKFLOWS.discussionReply, {
    recipients: [knockUserId(reply.questionAuthorId)],
    actor: knockUserId(reply.replierId),
    data: {
      reply_id: reply.replyId,
      question_id: reply.questionId,
      replier_name: replier.name,
      lesson_title: reply.lessonTitle,
      reply_excerpt: reply.replyBody.slice(0, 140),
      url: `/courses/${reply.courseSlug}/lessons/${reply.lessonId}#comment-${reply.replyId}`,
    },
  });
}

/** A real Enrollment, for the opt-in check. Recipient is the course's Instructor. */
export function findRealEnrollment(instructorId?: number) {
  return db
    .select({
      enrollmentId: enrollments.id,
      studentId: enrollments.userId,
      instructorId: courses.instructorId,
      courseTitle: courses.title,
    })
    .from(enrollments)
    .innerJoin(courses, eq(courses.id, enrollments.courseId))
    .where(instructorId ? eq(courses.instructorId, instructorId) : undefined)
    .get();
}

export async function triggerNewEnrollment(
  e: NonNullable<ReturnType<typeof findRealEnrollment>>
) {
  await identify(e.instructorId);
  await identify(e.studentId);
  return knock().workflows.trigger(WORKFLOWS.newEnrollment, {
    recipients: [knockUserId(e.instructorId)],
    actor: knockUserId(e.studentId),
    data: { enrollment_id: e.enrollmentId, course_title: e.courseTitle },
  });
}

// ─── Preferences (check 4) ───

export function getPreferences(userId: number) {
  return knock().users.getPreferences(knockUserId(userId), "default");
}

/** Opt in (or out) of new-enrollment, per channel type. */
export function setEnrollmentsOptIn(userId: number, on: boolean) {
  return knock().users.setPreferences(knockUserId(userId), "default", {
    __persistence_strategy__: "merge",
    categories: {
      [CATEGORIES.enrollments]: {
        channel_types: { in_app_feed: on, email: on },
      },
    },
  });
}

/** Wipe the user's own preference set, so the environment default applies again. */
export function resetPreferences(userId: number) {
  return knock().users.unsetPreferences(knockUserId(userId), "default");
}
