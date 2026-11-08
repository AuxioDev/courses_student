# Deploying the Student Diary (demo site)

This puts the Diary online with **demo data**, on free plans, so you can test what only
works on a real address: installing the app, phone notifications, file uploads and email.

It isn't the pilot. Real students need the Admin and Teacher apps first, because nothing
else can create lessons, homework, marks or attendance.

Do these in order. The app needs its settings before its first build.

## 1. Push the code

Commit and push your work, including `.github/`, `docs/`, `vercel.json`, `scripts/` and
`prisma/migrations/`. Then check that the **Actions** tab on GitHub shows CI passing.

## 2. Create the Vercel project

1. Sign in at [vercel.com](https://vercel.com) with GitHub.
2. **Add New → Project**, and import `AuxioDev/courses_student`.
3. Keep the defaults, but **don't deploy yet** if Vercel lets you skip it. If it deploys
   anyway, that first build will fail, which is harmless. Continue with the next steps.

## 3. Add the database and file storage

In the project's **Storage** tab:

1. Create a **Neon** database in **Frankfurt** (the same area as the app, which
   `vercel.json` runs in `fra1`).
2. Connect it to the project, then check **Settings → Environment Variables** for both
   `DATABASE_URL` (pooled) and `DATABASE_URL_UNPOOLED` (direct).
3. Create a **Blob** store with **private** access, and connect it. This adds
   `BLOB_READ_WRITE_TOKEN`.

## 4. Generate new secrets

Run these on your computer. Don't reuse the values from your local `.env`.

```bash
openssl rand -hex 32
```

Run that twice: once for `SESSION_SECRET`, once for `CRON_SECRET`.

```bash
npx web-push generate-vapid-keys
```

## 5. Add the environment variables

In **Settings → Environment Variables**, mark the secrets as **Sensitive**:

| Name | Value | Sensitive |
| --- | --- | --- |
| `SESSION_SECRET` | First random value | Yes |
| `CRON_SECRET` | Second random value | Yes |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY` | Public key from step 4 | No |
| `VAPID_PRIVATE_KEY` | Private key from step 4 | Yes |
| `VAPID_SUBJECT` | `mailto:` plus your email | No |
| `RESEND_API_KEY` | From [resend.com](https://resend.com) → API Keys | Yes |
| `PRIVACY_CONTACT_EMAIL` | Who to contact about data | No |
| `FEEDBACK_URL` | An `https://` link to a form (optional) | No |
| `APP_URL` | Your address, e.g. `https://courses-student.vercel.app` | No |

Leave `EMAIL_FROM` unset for now. Resend's test sender only delivers to the email address
of your own Resend account, which is enough for the demo. A pilot needs a verified domain.

## 6. Deploy

Under **Deployments**, redeploy the latest one (or push a commit). Production builds
apply the database migrations automatically. Preview builds never do.

Check that `APP_URL` matches the address you got. If it doesn't, fix it and redeploy.

## 7. Load the demo data

Run this from the `courses_student` folder, with the **direct** URL
(`DATABASE_URL_UNPOOLED`), a long password of your own, and your Resend account's email:

```bash
DATABASE_URL="direct-url" SEED_PASSWORD="long-password" SEED_STUDENT_EMAIL="you@example.org" npm run db:seed -- --yes-wipe
```

Because the repo is public, never leave `password123` on a site that's online.

This deletes everything in that database, and also clears your local `.uploads` and
`.emails` folders. Log in with `SEED_STUDENT_EMAIL` and `SEED_PASSWORD`.

## 8. Test it

Go through section 11 of [the checklist](manual-test-checklist.md), then the rest on a
real phone. In particular:

- One real file upload, watching the browser console for CSP errors
- Installing the app on a phone, and a real push notification
- "Forgot password" reaching your inbox

To trigger the reminder job without waiting for 18:00, open the project's **Cron Jobs**
settings and press **Run**. Cron jobs only run on production deployments.

## Before a real pilot

- [ ] The Admin and Teacher apps exist and use the same database and `SESSION_SECRET`
- [ ] A new, empty database, with no demo accounts
- [ ] A verified sending domain in Resend, and `EMAIL_FROM` set
- [ ] The privacy notice reviewed, including consent for students under 18
- [ ] A decision on the Vercel plan: Hobby is for non-commercial use only
- [ ] Neon's plan chosen, with sleeping off and backups on
- [ ] The checklist passed on Chrome and iPhone Safari
