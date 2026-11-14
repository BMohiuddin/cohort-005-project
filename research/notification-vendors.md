# Notification vendors for Cadence

Research for [#2](https://github.com/BMohiuddin/cohort-005-project/issues/2), part of map [#1](https://github.com/BMohiuddin/cohort-005-project/issues/1). Checked against primary sources (vendor docs, pricing pages, npm registry) on 2026-11-14. Pricing and limits change often, so re-check the pricing pages before you commit to a vendor.

**What Cadence needs** (from #1): an in-app feed plus **Web Push** (browser push through a service worker, no mobile app). Notifications fire from server actions. Users get per-Channel opt-out at minimum. The vendor must be hosted, have a free tier, offer a themeable React component or headless hooks (Cadence uses shadcn/Tailwind on React 19 and React Router v8), and ship a Node SDK. Local dev must work with the DevUI user switcher, and missing keys must turn notifications off rather than crash the app.

This doc does not pick a vendor. That's a separate human decision ticket.

## TL;DR

| | SuprSend | Knock | Novu Cloud | MagicBell | Courier |
|---|---|---|---|---|---|
| Free tier | 10k notifications/mo; SuprSend branding in feed | 10k messages/mo; unlimited environments | 10k workflow runs/mo, **max 5 workflows**, 2 envs | **1,000 deliveries/mo**, 1 project | 10k sends/mo |
| Web Push | **Native** (VAPID, own SW via `importScripts`, `registerPush()`) | Via **FCM only** (Firebase SDK + `firebase-messaging-sw.js`) | Via FCM / Pushpad / OneSignal / Pusher Beams | **Native** (VAPID, `WebPushButton`) | Via third-party provider (FCM, OneSignal, Pusher Beams, MagicBell); no web guide |
| Feed UI | Drop-in `<Inbox>` (theme object) + headless hooks | Prebuilt feed (`--rnf-*` CSS vars) + headless hooks | `<Inbox>` with Tailwind classes via `appearance.elements` + headless hooks | `Inbox`/`FloatingInbox` (`--magicbell-*` vars, `className`, `unstyled`) | `<CourierInbox>` (JS theme object, render slots) + `useCourier` |
| React 19 peer | `react >= 16.8` | explicit `^19.0.0` | explicit `^19.0.0` | `react-headless`: `>= 18.3.1`; `@magicbell/react` lists none | `>= 18.0.0` |
| Preferences UI | Headless hooks + hosted/embedded page | Hosted page + copy-paste React example + `usePreferences` | **Built into `<Inbox>`** + headless hooks | `UserPreferences` component | `CourierPreferences` component |
| Feed auth | ES256 JWT (enhanced security) | RS256 JWT (enhanced security) | HMAC `subscriberHash` | HS256 JWT | Scoped JWT via `auth.issueToken` |
| Dev/test | Sandbox + Staging + Production workspaces | Dev + Prod (+ custom) | Dev + Prod | 1 project on free | Production + Test (+ custom) |

**Ranked shortlist:** 1. SuprSend, 2. Knock, 3. Novu Cloud, 4. MagicBell, 5. Courier. The [shortlist section](#ranked-shortlist) explains the ranking.

## Cross-cutting: Web Push on the browser

- Web Push is the W3C stack: Push API, Notifications API and Service Workers. On iOS and iPadOS it needs **16.4+**, and the site has to be **added to the Home Screen** with a web app manifest whose `display` is `standalone` or `fullscreen`. The permission request must come from a direct user gesture, such as a button. No Apple Developer account is needed. ([WebKit blog](https://webkit.org/blog/13878/web-push-for-web-apps-on-ios-and-ipados/))
- So Cadence needs, whatever the vendor: a manifest, a service worker at a known public path (`public/` in this app), a user-gesture "enable push" button, and explanatory copy for iOS users who haven't installed the app.
- **Native VAPID vendors** (SuprSend, MagicBell) store the standard `PushSubscription` themselves and send to every browser's push service directly. **FCM-routed vendors** (Knock, and Novu/Courier through FCM) add Firebase as a second dependency: a Firebase project, the Firebase JS SDK in the client, and `firebase-messaging-sw.js`. Knock's own tutorial notes its example throws on iPhone unless the app is installed to the Home Screen. ([Knock FCM web push tutorial](https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm))

## SuprSend

- **Free tier:** $0, 10,000 notifications/month, unlimited channels and team members. The in-app feed carries SuprSend branding until the Essentials plan ($100/mo, 50k notifications). ([pricing](https://www.suprsend.com/pricing))
- **In-app feed:** `@suprsend/react` has two options. The drop-in `<Inbox>` takes `theme` / `themeType` (dark|light) and a custom `notificationComponent`. The headless option offers `useFeedClient`, `useFeedData` and related hooks for building the UI yourself (for example with shadcn). ([React overview](https://docs.suprsend.com/docs/react-inbox-integration), [drop-in feed](https://docs.suprsend.com/docs/react-in-app-feed), [headless feed](https://docs.suprsend.com/docs/react-sdk-headless-feed)) Its React peer range is `>= 16.8.0`, so React 19 is allowed but not listed explicitly (npm `@suprsend/react@1.5.0`). The old `@suprsend/react-inbox` package is end-of-support.
- **Web Push:** native. Get a VAPID key from Dashboard → Vendors → WebPush and pass it as `vapidKey` to `SuprSendProvider`. Serve `/serviceworker.js` (renamable with `swFileName`), which `importScripts` the SuprSend worker from jsDelivr and calls `initSuprSend(PUBLIC_KEY)`. Call `suprSendClient.webpush.registerPush()` from a user action. ([React WebPush](https://docs.suprsend.com/docs/react-webpush)) Rendering differs by browser: action buttons work only on Chromium, and Safari shows title, body and click only. ([Web Push template](https://docs.suprsend.com/docs/web-push)) Its docs don't mention the iOS Home Screen requirement.
- **Preferences:** preference categories are defined in the dashboard. Users can opt in or out at three levels: channel, category, and channel within a category. A full REST API covers these levels ([preference API](https://docs.suprsend.com/reference/get-user-full-preference)). For UI there's a hosted/embedded preference page or headless hooks, but **no prebuilt React preferences component**. ([embedded preference centre](https://docs.suprsend.com/docs/embedded-preference-centre), [user preferences](https://docs.suprsend.com/docs/user-preferences))
- **Node SDK:** `@suprsend/node-sdk` uses `new Suprsend(key, secret)`, then `supr_client.workflows.trigger(new WorkflowTriggerRequest({ workflow, recipients, data }))`. A trigger takes up to 100 recipients, given either as distinct_ids or as inline user objects, which upsert the user. (npm README of `@suprsend/node-sdk`)
- **Identity / feed auth:** users are keyed by `distinct_id`. With Enhanced Security Mode on, the backend signs an **ES256 JWT** with the workspace signing key, using claims `entity_type: "subscriber"`, `entity_id`, `exp`. The docs recommend turning this on for production. ([API keys](https://docs.suprsend.com/docs/developer/api-keys))
- **Dev/test:** every account gets **Sandbox**, **Staging** and **Production** workspaces, each with its own keys, users and workflows. You promote changes by cloning, through the Management API, or with the CLI (`suprsend workflow push -w staging`). ([workspaces](https://docs.suprsend.com/docs/workspaces))

## Knock

- **Free tier:** 10,000 messages/month, unlimited stored users, unlimited workflows, channels and environments, and feeds and preferences included. The next tier, Starter, costs **$250/mo** for 50k messages. ([pricing](https://knock.app/pricing))
- **In-app feed:** `@knocklabs/react` ships a prebuilt feed, popover, toasts and inbox. You style them by overriding `--rnf-*` CSS variables, with light and dark `colorMode`. ([styling](https://docs.knock.app/in-app-ui/feeds/styling)) For a headless UI there are `useKnockClient`, `useNotifications`, `useNotificationStore` and `useAuthenticatedKnockClient`. ([headless feed](https://docs.knock.app/in-app-ui/react/headless/feed)) The peer range explicitly includes React `^19.0.0`, and `next` and `@tanstack/react-router` are optional peers (npm `@knocklabs/react@0.15.1`). The prebuilt components pull in Knock's own "Telegraph" design-system packages and Radix.
- **Web Push:** **no first-party web push channel.** The documented route goes through FCM: configure an FCM channel, use the Firebase SDK with a VAPID key in the browser, register `firebase-messaging-sw.js`, and save the token with `knock.user.setChannelData(fcmChannelId, { tokens })`. ([tutorial](https://docs.knock.app/tutorials/sending-web-push-notifications-with-fcm), [push providers](https://docs.knock.app/integrations/push/overview)) The supported push providers are APNs, FCM, Expo, OneSignal and Amazon SNS.
- **Preferences:** PreferenceSets work per workflow and per category, crossed with channel type, and you can set environment-level defaults. ([overview](https://docs.knock.app/preferences/overview)) For UI you get a **hosted preference center** reached by a signed URL ([hosted](https://docs.knock.app/preferences/hosted-preference-center)), or you build your own from a documented React `PreferenceCenter` example ([React preferences](https://docs.knock.app/in-app-ui/react/preferences)) or the `usePreferences` hook. It's not a drop-in component.
- **Node SDK:** `@knocklabs/node` (v1.41) provides `workflows.trigger(key, { recipients, data })`. Recipients can be **identified inline** in the trigger call, so no separate sync step is needed, and there is bulk identify too. ([identifying recipients](https://docs.knock.app/managing-recipients/identifying-recipients))
- **Feed auth:** "enhanced security mode" makes the backend sign an **RS256 JWT** (`sub` = user id, plus `iat`/`exp`) with the environment's signing key. It's off by default, and the docs suggest keeping it off in development. ([security](https://docs.knock.app/in-app-ui/security-and-authentication))
- **Dev/test:** accounts start with production only. Enabling environments adds development, and changes are versioned with commits and promoted upward. Users are isolated per environment. ([environments](https://docs.knock.app/version-control/environments))

## Novu Cloud

- **Free tier:** 10,000 workflow runs/month, **up to 5 workflows**, 2 environments (Dev + Prod), 3 team members, 24h activity retention, and Novu branding. Pro starts at $30/mo with 20 workflows. ([pricing](https://novu.co/pricing))
- **In-app feed:** `@novu/react`'s `<Inbox>` is themed through `appearance`, which takes `baseTheme` (a built-in `dark`), `variables`, and `elements`. **`elements` accepts Tailwind class strings**, so it fits shadcn best of the five. ([styling](https://docs.novu.co/platform/inbox/configuration/styling)) The headless hooks are `useNotifications`, `useCounts` and others. ([headless](https://docs.novu.co/platform/inbox/headless-mode)) The React peer range explicitly covers `^19.0.0` (npm `@novu/react@3.19.2`). The quickstart shows `routerPush` wired to React Router's `navigate`. ([React quickstart](https://docs.novu.co/platform/quickstart/react))
- **Web Push:** **no native VAPID channel.** Push goes through providers: FCM (which documents a `webPush` override for desktop browsers), Pushpad (web-push only), OneSignal or Pusher Beams. ([push](https://docs.novu.co/platform/integrations/push), [FCM](https://docs.novu.co/platform/integrations/push/fcm), [Pushpad](https://docs.novu.co/platform/integrations/push/pushpad))
- **Preferences:** this is the strongest built-in option. There are workflow-level channel defaults, per-subscriber per-workflow channel toggles, and global channel toggles. The **Preferences view ships inside `<Inbox>`**, and "critical" workflows can't be disabled. There's also a separate `<Subscription>` component and headless preference hooks. ([concepts](https://docs.novu.co/platform/concepts/preferences), [Inbox preferences](https://docs.novu.co/platform/inbox/configuration/preferences))
- **Node SDK:** `@novu/api` provides `novu.trigger({ workflowId, to: { subscriberId, ... }, payload })`. ([TS SDK](https://docs.novu.co/platform/sdks/server/typescript))
- **Feed auth:** **HMAC.** Turn it on in the In-App provider settings, and the backend computes `subscriberHash` for each `subscriberId`. ([prepare for production](https://docs.novu.co/platform/inbox/prepare-for-production))
- **Dev/test:** separate Development and Production environments with their own keys.
- **Caveat:** Cadence's catalogue covers four roles and will almost certainly need more than **5 workflows**, so the free tier is probably not enough for the real catalogue.

## MagicBell

- **Free tier ("Builder"):** **1,000 deliveries/month**, **1 project**, all integrations, unlimited users. The next tier, Startup, costs **$249/mo** for 50k deliveries and 5 projects. ([pricing](https://www.magicbell.com/pricing))
- **In-app feed:** `@magicbell/react` (v1.14) offers `ContextProvider`, `Inbox`, `FloatingInbox`, `InlineNotification` and `ToastContainer`. You theme them with `--magicbell-*` CSS variables, override classes, and use `className` / `unstyled` props. ([React docs](https://www.magicbell.com/docs/libraries/magicbell-react)) Headless hooks live in the older `@magicbell/react-headless` package (v5, peer `react >= 18.3.1`). `@magicbell/react` declares no React peer range at all.
- **Web Push:** **native.** You configure VAPID keys on the Web Push channel and store browser `PushSubscription`s as channel tokens. ([web push channel](https://www.magicbell.com/docs/channels/web_push)) The React `WebPushButton` subscribes the user and expects a service worker that `importScripts` MagicBell's script. A web push tester is provided. Its docs don't mention the iOS Home Screen requirement.
- **Preferences:** a prebuilt `UserPreferences` component lets users toggle channels per category. Only `className` is documented. ([React docs](https://www.magicbell.com/docs/libraries/magicbell-react))
- **Node SDK:** `magicbell-js` has a project client with `broadcasts.createBroadcast({ title, content, recipients, category, topic, overrides })` and `users.saveUser` (upsert). MagicBell has **no workflow engine**: each send is a broadcast to up to 1,000 recipients. ([magicbell-js](https://www.magicbell.com/docs/libraries/magicbell-js), [broadcast](https://www.magicbell.com/docs/primitive/broadcast))
- **Feed auth:** an **HS256 User JWT** signed with the project secret, carrying `user_external_id` and/or `user_email` and `api_key`. ([user JWT](https://www.magicbell.com/docs/api/authentication/user))
- **Dev/test:** the free plan's single project means **no separate dev environment** unless you use a second account.

## Courier

- **Free tier ("Developer"):** 10,000 sends/month. Business is pay-as-you-go at $0.005/send, and every send counts once you're on it. ([pricing](https://www.courier.com/pricing))
- **In-app feed:** `@trycourier/courier-react` (v9, peer `react >= 18`) provides `<CourierInbox>`. You theme it with `lightTheme`/`darkTheme` JS objects (`CourierInboxTheme`) and `mode="system"`, **not classNames**. Render slots (`renderListItem`, `renderHeader` and others) and fully custom UI via `useCourier` are available. ([customize](https://www.courier.com/docs/in-app/customize-the-inbox), [custom inbox](https://www.courier.com/docs/in-app/build-a-custom-inbox), [React guide](https://www.courier.com/docs/guides/add-an-inbox-to-react))
- **Web Push:** **no first-party web push**, and the docs have no browser/service-worker guide. Push providers include FCM, APNs, Expo, OneSignal, Pusher Beams (which has a web mode) and even MagicBell. The FCM page covers Android and iOS only. ([push providers](https://www.courier.com/docs/integrations/push/overview), [FCM](https://www.courier.com/docs/external-integrations/push/firebase-fcm))
- **Preferences:** a prebuilt `<CourierPreferences>` component for topics × channels, which needs `read:preferences write:preferences` JWT scopes. ([preference center](https://www.courier.com/docs/in-app/add-a-preference-center))
- **Node SDK:** `@trycourier/courier` (v10) provides `client.send.message(...)`, with profiles inline or stored.
- **Feed auth:** the backend mints a scoped, expiring JWT with `client.auth.issueToken({ scope: "user_id:… inbox:read:messages …", expires_in })`. ([authenticate users](https://www.courier.com/docs/in-app/authenticate-users))
- **Dev/test:** Production, Test and custom environments with separate keys. There's no separate test mode; the Test key selects the environment. ([environments](https://www.courier.com/docs/workspaces/environments))

## What all five share (relevant to DevUI and degrade-gracefully)

- Every vendor separates a **server secret** (used to trigger and to sign feed tokens) from a **client public key + per-user token**. Cadence can mint the per-user token in a root loader for the current session user. Switching user in DevUI then just yields a new token and a new feed. With no keys configured, the loader can return no token and the UI can hide the bell.
- Knock, SuprSend and Novu make the per-user token **optional in development** (enhanced security / HMAC is opt-in). That simplifies local dev, but production must turn it on.
- All five let you upsert the user inline in the trigger call (Knock and SuprSend inline recipients, Novu `to`, MagicBell broadcast recipients, Courier inline profile). So seeded DevUI users don't need a separate sync step.

## Ranked shortlist

1. **SuprSend.** It's the only vendor that clears every hard requirement on the free tier with a first-party path for each: native VAPID Web Push with a React `registerPush()` hook, a drop-in Inbox plus headless hooks, channel × category preferences with an API, a Node SDK with inline recipients, signed JWT feed auth, and three isolated workspaces. Weaknesses: SuprSend branding in the free feed, no prebuilt React preferences component (use the hosted page or build with hooks), React 19 allowed by the peer range but not explicitly listed, and a service worker that loads its script from jsDelivr.
2. **Knock.** It has the most polished developer experience and React SDK (explicit React 19 support, CSS-variable theming, good headless hooks), unlimited environments, inline identify, and a strong preferences model. But **Web Push only works through Firebase/FCM**, which adds a second vendor, the Firebase SDK and `firebase-messaging-sw.js`. Its preferences UI is hosted or copy-paste rather than a component, and the first paid tier costs $250/mo.
3. **Novu Cloud.** It fits shadcn/Tailwind best (Tailwind classes in `appearance.elements`, explicit React 19 support) and has the best built-in preferences UI (inside `<Inbox>`). But the free tier caps you at **5 workflows**, which Cadence's four-role catalogue will likely exceed (Pro is a cheap $30/mo). Web Push goes through FCM or Pushpad.
4. **MagicBell.** It has native Web Push and prebuilt `WebPushButton` and `UserPreferences` components. But the free tier allows only **1,000 deliveries/month** and one project, so there's no dev environment, and it has no workflow engine. The paid jump is $249/mo.
5. **Courier.** It has good prebuilt Inbox and Preferences components and Test/Production environments. But it has **no first-party browser Web Push** and no web push guide, and you theme it with JS objects rather than Tailwind classes.

### Trade-offs between the top two (SuprSend vs Knock)

| | SuprSend | Knock |
|---|---|---|
| Web Push | Native VAPID; one vendor; ~2-line service worker + `registerPush()` | Requires Firebase/FCM as a second dependency; Firebase SDK in client; FCM token stored as Knock channel data |
| Feed UI | Drop-in Inbox (theme object) or headless hooks; branded on free | Mature prebuilt feed (`--rnf-*` CSS vars) or headless hooks; no branding note on free |
| React 19 | Peer `>= 16.8` (allowed, not explicitly listed) | Peer explicitly lists `^19.0.0` |
| Preferences UI | Hosted/embedded page or headless; no React component | Hosted page or copy-paste React example / `usePreferences` hook |
| Dev/test | Sandbox + Staging + Production by default | Dev + Prod (enable environments), commit/promote model |
| Cost cliff | Free 10k → $100/mo Essentials | Free 10k → $250/mo Starter |
| Maturity / docs | Smaller vendor; docs thinner in places (no browser-support or iOS notes on web push page) | Larger ecosystem; deeper docs and examples |

The decision mostly comes down to two things. Is native Web Push with one vendor worth more than Knock's more polished React SDK and docs? And is Cadence willing to own a Firebase project just for push?
