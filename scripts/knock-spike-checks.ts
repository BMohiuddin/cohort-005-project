// PROTOTYPE — runs the four checks from "Does Knock hold up against Cadence?"
// (BMohiuddin/cohort-005-project#25) against the real Knock Development env and
// the seeded data.db. `npm run knock-spike`. Delete, don't refactor.
import * as k from "../app/lib/knock-spike.server";

const results: Array<[string, boolean, string]> = [];
const check = (name: string, ok: boolean, detail = "") => {
  results.push([name, ok, detail]);
  console.log(
    `${ok ? "PASS" : "FAIL"}  ${name}${detail ? `  (${detail})` : ""}`
  );
};
const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

async function waitForFeed(
  userId: number,
  token: string,
  pred: (f: k.FeedResponse) => boolean
) {
  for (let i = 0; i < 20; i++) {
    const f = await k.fetchFeed(userId, token);
    if (pred(f.body)) return f;
    await sleep(1000);
  }
  return k.fetchFeed(userId, token);
}

async function main() {
  const missing = k.missingEnv();
  if (missing.length) {
    console.error(`Missing in .env: ${missing.join(", ")}`);
    process.exit(1);
  }

  // ─── Check 2 data: a real Discussion Reply from the seed ───
  const reply = k.findRealDiscussionReply();
  if (!reply)
    throw new Error("Seed has no Discussion Reply to someone else's question");
  const author = reply.questionAuthorId;
  const replier = reply.replierId;

  // ─── Check 1: signed user tokens, per DevUI user ───
  const authorToken = await k.signTokenFor(author);
  const replierToken = await k.signTokenFor(replier);
  const { header, payload } = k.decodeJwt(authorToken);
  check(
    "1a token is RS256 with sub = Cadence user",
    header.alg === "RS256" && payload.sub === k.knockUserId(author),
    `${header.alg}, sub=${payload.sub}`
  );
  await k.identify(author);
  await k.identify(replier);
  const own = await k.fetchFeed(author, authorToken);
  check(
    "1b own token reads own feed",
    own.status === 200,
    `HTTP ${own.status}`
  );
  const cross = await k.fetchFeed(replier, authorToken);
  check(
    "1c author's token cannot read replier's feed",
    cross.status >= 400,
    `HTTP ${cross.status} ${cross.body.code ?? ""}`
  );
  const switched = await k.fetchFeed(replier, replierToken);
  check(
    "1d switching user (new token) switches feed",
    switched.status === 200,
    `HTTP ${switched.status}`
  );

  // ─── Check 2: trigger real Discussion Reply → question author ───
  const before = own.body.meta?.total_count ?? 0;
  const run = await k.triggerDiscussionReply(reply);
  check(
    "2a Node SDK trigger accepted",
    Boolean(run.workflow_run_id),
    `run ${run.workflow_run_id}`
  );
  const after = await waitForFeed(author, authorToken, (f) =>
    (f.entries ?? []).some(
      (e) =>
        e.source.key === k.WORKFLOWS.discussionReply &&
        e.data?.reply_id === reply.replyId &&
        !e.read_at
    )
  );
  const item = (after.body.entries ?? []).find(
    (e) =>
      e.source.key === k.WORKFLOWS.discussionReply &&
      e.data?.reply_id === reply.replyId &&
      !e.read_at
  );
  check(
    "2b item shows up in the author's feed",
    Boolean(item),
    `total ${before} → ${after.body.meta?.total_count}`
  );
  const replierFeed = await k.fetchFeed(replier, replierToken);
  check(
    "2c and not in the replier's feed",
    !(replierFeed.body.entries ?? []).some((e) => e.id === item?.id)
  );

  // ─── Check 3: headless feed API ───
  if (item) {
    const m = after.body.meta!;
    check(
      "3a feed lists items + unread/unseen counts",
      typeof m.unread_count === "number" && typeof m.unseen_count === "number",
      `unread ${m.unread_count}, unseen ${m.unseen_count}`
    );
    const seen = await k.markMessages(authorToken, "seen", [item.id]);
    const s = await k.fetchFeed(author, authorToken);
    check(
      "3b mark seen (as the user)",
      seen.status === 200 &&
        s.body.meta!.unseen_count === m.unseen_count - (item.seen_at ? 0 : 1),
      `HTTP ${seen.status}, unseen ${m.unseen_count} → ${s.body.meta!.unseen_count}`
    );
    const read = await k.markMessages(authorToken, "read", [item.id]);
    const r = await k.fetchFeed(author, authorToken);
    check(
      "3c mark read (as the user)",
      read.status === 200 && r.body.meta!.unread_count === m.unread_count - 1,
      `HTTP ${read.status}, unread ${m.unread_count} → ${r.body.meta!.unread_count}`
    );
    const forged = await k.markMessages(replierToken, "unread", [item.id]);
    check(
      "3d another user's token cannot change it",
      forged.status >= 400 ||
        (await k.fetchFeed(author, authorToken)).body.meta!.unread_count ===
          r.body.meta!.unread_count,
      `HTTP ${forged.status}`
    );
  }

  // ─── Check 4: new-enrollment off by default, opt-in ───
  const enrollment = k.findRealEnrollment();
  if (!enrollment) throw new Error("Seed has no Enrollment");
  const instructor = enrollment.instructorId;
  const iToken = await k.signTokenFor(instructor);
  const count = async () =>
    ((await k.fetchFeed(instructor, iToken)).body.entries ?? []).filter(
      (e) => e.source.key === k.WORKFLOWS.newEnrollment
    ).length;

  await k.resetPreferences(instructor).catch(() => {});
  const n0 = await count();
  await k.triggerNewEnrollment(enrollment);
  await sleep(6000);
  const n1 = await count();
  check("4a default: new-enrollment NOT delivered", n1 === n0, `${n0} → ${n1}`);

  const prefs = await k.setEnrollmentsOptIn(instructor, true);
  check(
    "4b category × channel pref stored",
    JSON.stringify(prefs.categories ?? {}).includes(k.CATEGORIES.enrollments),
    JSON.stringify(prefs.categories)
  );
  await k.triggerNewEnrollment(enrollment);
  const n2 = await (async () => {
    for (let i = 0; i < 20; i++) {
      const n = await count();
      if (n > n1) return n;
      await sleep(1000);
    }
    return count();
  })();
  check("4c opted in: new-enrollment delivered", n2 > n1, `${n1} → ${n2}`);
  await k.resetPreferences(instructor).catch(() => {});

  const failed = results.filter(([, ok]) => !ok);
  console.log(`\n${results.length - failed.length}/${results.length} passed`);
  process.exit(failed.length ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
