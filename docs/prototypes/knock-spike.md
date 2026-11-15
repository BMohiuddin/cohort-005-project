# PROTOTYPE: Knock spike

Throwaway. Lives only on the `prototype/knock-spike` branch and is never merged.
It answers [Does Knock hold up against Cadence?](https://github.com/BMohiuddin/cohort-005-project/issues/25):
Knock is confirmed only if all four checks pass. If any fail, we go back to the vendor choice and fall back to **Courier**.

## Files

- `app/lib/knock-spike.server.ts`: token signing, user identify, trigger, feed and preference calls
- `app/routes/prototype.knock-spike.tsx`: page at `/prototype/knock-spike` for clicking through the checks by hand
- `scripts/knock-spike-checks.ts`: `npm run knock-spike` runs all four checks headlessly and prints PASS/FAIL

## Before you run it

### 1. `.env` at the repo root

The keys come from [Sign up for the notification vendor and provision dev keys](https://github.com/BMohiuddin/cohort-005-project/issues/21). Paste the long signing key in an editor, not a terminal: terminals cut it off at 4,095 characters.

```
KNOCK_PUBLIC_API_KEY=pk_test_…
KNOCK_SECRET_API_KEY=sk_test_…
KNOCK_SIGNING_KEY=…            # single-line base-64 PEM
KNOCK_FEED_CHANNEL_ID=…        # in-app feed channel UUID
```

### 2. Knock dashboard (Development environment)

1. **Workflow `discussion-reply`.** Category: `discussions`. One step: the in-app feed channel. Example markdown: `**{{ data.replier_name }}** replied to your question in *{{ data.lesson_title }}*`, with the action URL `{{ data.url }}`. Commit it to Development.
2. **Workflow `new-enrollment`.** Category: `enrollments`. One step: the in-app feed channel. Example markdown: `New Enrollment in *{{ data.course_title }}*`. Commit it.
3. **Default preferences.** Set the environment's default preference set so the `enrollments` category is **off** for `in_app_feed` (and `email`). Check 4a tests whether this works: a user with no preferences of their own must not get a new-enrollment item.

### 3. Node

Use Node 22.22 or newer. react-router refuses older versions.

## Run

```bash
npm run knock-spike      # headless: prints PASS/FAIL per check
npm run dev              # then open /prototype/knock-spike and switch users in DevUI
```

Seed users the checks use: user 5 is a Student who asked a Discussion Question, and user 2 (an Instructor) replied to it. User 2 is also the Instructor who receives the new-enrollment notification.

## What each check proves

| # | Check | Pass when |
|---|---|---|
| 1 | Signed user tokens | The token is RS256 with `sub = cadence-<id>`. It reads its own user's feed and is rejected on anyone else's. Switching users in DevUI issues a new token, and the feed switches with it. |
| 2 | Triggering | `workflows.trigger("discussion-reply")` from the Node SDK puts an item in the question author's feed and not in the replier's. |
| 3 | Headless feed API | Called from the browser with the public key and the user token: it lists items with `unread_count` and `unseen_count`, and batch seen/read change those counts. Another user's token cannot change them. |
| 4 | Preferences | With no preferences of their own, the Instructor gets no new-enrollment item. After opting into `enrollments` (category × channel type), they do. |
