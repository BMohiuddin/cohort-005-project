// PROTOTYPE — throwaway Knock spike for "Does Knock hold up against Cadence?"
// (BMohiuddin/cohort-005-project#25). Open /prototype/knock-spike, switch users
// in the DevUI panel, and watch the feed follow. Delete, don't refactor.
import { useCallback, useEffect, useState } from "react";
import { useFetcher } from "react-router";
import type { Route } from "./+types/prototype.knock-spike";
import { requireUserId } from "~/lib/access.server";
import { db } from "~/db";
import { users } from "~/db/schema";
import { eq } from "drizzle-orm";

const KNOCK_API = "https://api.knock.app";

export async function loader({ request }: Route.LoaderArgs) {
  const k = await import("~/lib/knock-spike.server");
  const userId = await requireUserId(request);
  const user = db.select().from(users).where(eq(users.id, userId)).get()!;
  const missing = k.missingEnv();
  if (missing.length) return { user, missing, spike: null };

  await k.identify(userId);
  const token = await k.signTokenFor(userId);
  const prefs = await k
    .getPreferences(userId)
    .catch((e: Error) => ({ error: e.message }));
  return {
    user,
    missing,
    spike: {
      token,
      claims: k.decodeJwt(token),
      knockUserId: k.knockUserId(userId),
      publicKey: k.env().publicKey,
      feedChannelId: k.env().feedChannelId,
      replyForMe: k.findRealDiscussionReply(userId) ?? null,
      enrollmentForMe: k.findRealEnrollment(userId) ?? null,
      prefs,
    },
  };
}

export async function action({ request }: Route.ActionArgs) {
  const k = await import("~/lib/knock-spike.server");
  const userId = await requireUserId(request);
  const intent = String((await request.formData()).get("intent"));
  switch (intent) {
    case "trigger-reply": {
      const reply = k.findRealDiscussionReply(userId);
      if (!reply)
        return {
          intent,
          result:
            "No Discussion Reply to this user's questions in the seed. Switch to a user who asked one.",
        };
      return { intent, result: await k.triggerDiscussionReply(reply) };
    }
    case "trigger-enrollment": {
      const e = k.findRealEnrollment(userId);
      if (!e)
        return {
          intent,
          result:
            "No Enrollment in this user's courses. Switch to an Instructor.",
        };
      return { intent, result: await k.triggerNewEnrollment(e) };
    }
    case "opt-in":
      return { intent, result: await k.setEnrollmentsOptIn(userId, true) };
    case "opt-out":
      return { intent, result: await k.setEnrollmentsOptIn(userId, false) };
    case "reset-prefs":
      await k.resetPreferences(userId);
      return { intent, result: "unset: environment default applies" };
  }
  return { intent, result: "unknown intent" };
}

type Feed = {
  status: number;
  body: {
    entries?: Array<{
      id: string;
      inserted_at: string;
      read_at: string | null;
      seen_at: string | null;
      source: { key: string };
      data: Record<string, unknown> | null;
    }>;
    meta?: { unread_count: number; unseen_count: number; total_count: number };
    code?: string;
  };
};

export default function KnockSpike({ loaderData }: Route.ComponentProps) {
  const { user, missing, spike } = loaderData;
  const fetcher = useFetcher<typeof action>();
  const [feed, setFeed] = useState<Feed | null>(null);
  const [lastClientCall, setLastClientCall] = useState<unknown>(null);

  const headers = spike && {
    Authorization: `Bearer ${spike.publicKey}`,
    "X-Knock-User-Token": spike.token,
    "Content-Type": "application/json",
  };

  // Browser → Knock directly, with our server-signed token. No secret key here.
  const loadFeed = useCallback(async () => {
    if (!spike || !headers) return;
    const res = await fetch(
      `${KNOCK_API}/v1/users/${spike.knockUserId}/feeds/${spike.feedChannelId}?page_size=20`,
      { headers }
    );
    setFeed({ status: res.status, body: await res.json() });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [spike?.token]);

  useEffect(() => {
    loadFeed();
  }, [loadFeed, fetcher.data]);

  async function mark(status: "read" | "seen" | "unread", ids: string[]) {
    if (!headers || !ids.length) return;
    const res = await fetch(`${KNOCK_API}/v1/messages/batch/${status}`, {
      method: "POST",
      headers,
      body: JSON.stringify({ message_ids: ids }),
    });
    setLastClientCall({
      status,
      httpStatus: res.status,
      body: await res.json(),
    });
    loadFeed();
  }

  async function forgedToken() {
    // Sanity: the feed must reject a token signed for someone else's id.
    if (!spike) return;
    const otherId = spike.knockUserId.replace(/\d+$/, (n) =>
      String(Number(n) + 1)
    );
    const res = await fetch(
      `${KNOCK_API}/v1/users/${otherId}/feeds/${spike.feedChannelId}`,
      {
        headers: headers!,
      }
    );
    setLastClientCall({
      check: `my token, ${otherId}'s feed`,
      httpStatus: res.status,
      body: await res.json(),
    });
  }

  const entries = feed?.body.entries ?? [];

  return (
    <div className="mx-auto max-w-5xl space-y-6 p-6 font-mono text-sm">
      <div className="rounded border-2 border-dashed border-amber-500 bg-amber-50 p-3 text-amber-900 dark:bg-amber-950 dark:text-amber-200">
        PROTOTYPE: Knock spike. Throwaway; lives only on{" "}
        <b>prototype/knock-spike</b>.
      </div>

      <h1 className="text-lg font-bold">
        Signed in as {user.name} (id {user.id}, {user.role})
      </h1>

      {missing.length > 0 && (
        <div className="rounded bg-red-100 p-3 text-red-900 dark:bg-red-950 dark:text-red-200">
          Missing in .env: {missing.join(", ")}
        </div>
      )}

      {spike && (
        <>
          <Section title="1. Signed user token (switch users in DevUI: sub must follow)">
            <Json value={spike.claims} />
            <button className="btn" onClick={forgedToken}>
              Try my token on the next user's feed (must fail)
            </button>
          </Section>

          <Section title="2. Trigger a real Discussion Reply → this user (question author)">
            <Json
              value={
                spike.replyForMe ??
                "No reply to this user's questions in the seed"
              }
            />
            <fetcher.Form method="post">
              <button
                className="btn"
                name="intent"
                value="trigger-reply"
                disabled={!spike.replyForMe}
              >
                Trigger discussion-reply
              </button>
            </fetcher.Form>
          </Section>

          <Section title={`3. Headless feed (HTTP ${feed?.status ?? "…"})`}>
            <div>
              unread <b>{feed?.body.meta?.unread_count ?? "?"}</b> · unseen{" "}
              <b>{feed?.body.meta?.unseen_count ?? "?"}</b> · total{" "}
              <b>{feed?.body.meta?.total_count ?? "?"}</b>
            </div>
            <div className="flex gap-2">
              <button className="btn" onClick={loadFeed}>
                Refresh
              </button>
              <button
                className="btn"
                onClick={() =>
                  mark(
                    "seen",
                    entries.filter((e) => !e.seen_at).map((e) => e.id)
                  )
                }
              >
                Mark all seen
              </button>
              <button
                className="btn"
                onClick={() =>
                  mark(
                    "read",
                    entries.filter((e) => !e.read_at).map((e) => e.id)
                  )
                }
              >
                Mark all read
              </button>
            </div>
            <table className="w-full text-left">
              <thead>
                <tr>
                  <th>workflow</th>
                  <th>data</th>
                  <th>seen</th>
                  <th>read</th>
                  <th />
                </tr>
              </thead>
              <tbody>
                {entries.map((e) => (
                  <tr key={e.id} className="border-t align-top">
                    <td>{e.source.key}</td>
                    <td className="max-w-md truncate">
                      {JSON.stringify(e.data)}
                    </td>
                    <td>{e.seen_at ? "✓" : "·"}</td>
                    <td>{e.read_at ? "✓" : "·"}</td>
                    <td>
                      <button
                        className="underline"
                        onClick={() =>
                          mark(e.read_at ? "unread" : "read", [e.id])
                        }
                      >
                        {e.read_at ? "unread" : "read"}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
            {feed?.body.code && <Json value={feed.body} />}
          </Section>

          <Section title="4. Preferences: new-enrollment off by default, opt-in (switch to an Instructor)">
            <Json
              value={
                spike.enrollmentForMe ?? "No Enrollment in this user's courses"
              }
            />
            <fetcher.Form method="post" className="flex gap-2">
              <button className="btn" name="intent" value="reset-prefs">
                Reset to env default
              </button>
              <button className="btn" name="intent" value="opt-in">
                Opt in
              </button>
              <button className="btn" name="intent" value="opt-out">
                Opt out
              </button>
              <button
                className="btn"
                name="intent"
                value="trigger-enrollment"
                disabled={!spike.enrollmentForMe}
              >
                Trigger new-enrollment
              </button>
            </fetcher.Form>
            <div>This user's preference set:</div>
            <Json value={spike.prefs} />
          </Section>

          <Section title="Last call">
            <Json
              value={{ server: fetcher.data ?? null, browser: lastClientCall }}
            />
          </Section>
        </>
      )}
      <style>{`.btn{border:1px solid currentColor;border-radius:4px;padding:2px 8px}.btn:disabled{opacity:.4}`}</style>
    </div>
  );
}

function Section({
  title,
  children,
}: {
  title: string;
  children: React.ReactNode;
}) {
  return (
    <section className="space-y-2 rounded border p-4">
      <h2 className="font-bold">{title}</h2>
      {children}
    </section>
  );
}

function Json({ value }: { value: unknown }) {
  return (
    <pre className="overflow-x-auto rounded bg-muted p-2 text-xs">
      {JSON.stringify(value, null, 2)}
    </pre>
  );
}
