# Manual test checklist: Student Diary

Run this before each release, on **both** browsers:

- **Chrome** at phone size (DevTools → device toolbar) or on an Android phone
- **Safari on an iPhone**

## Setup

Use a test environment or your local machine, **never production**, because the seed
deletes all data.

```bash
npm run db:seed
npm run build
npm start
```

The seed's accounts all use the password `password123`:

| Account | Use it for |
| --- | --- |
| `student@example.com` | Normal student (Aysel) with full demo data |
| `murad@example.com` | First login: must choose a new password |
| `nigar@example.com` | Must accept the privacy notice |
| `leyla@example.com`, `admin@example.com` | Teacher and admin: must be refused |

Re-seed between full runs. Tick an item only if you saw it work.

## 1. Sign-in

- [ ] A wrong password shows an error and keeps the email filled in
- [ ] A teacher account is refused with the "this app is for students" message
- [ ] After 5 wrong passwords for one account, even the correct password is refused for 15 minutes (re-seed to reset)
- [ ] Murad is sent to "Choose your password", and opening `/en/marks` directly sends him back
- [ ] A new password under 8 characters, or two that don't match, is refused
- [ ] After choosing a password, Murad reaches Today
- [ ] Nigar is sent to the privacy notice and can't open anything else until she agrees
- [ ] Log out returns to the login page; pressing Back doesn't show private pages

## 2. Forgot password

- [ ] An unknown email and a real email get the same message
- [ ] The email arrives (locally: an HTML file in `.emails/`) in the student's language
- [ ] The link sets a new password and signs the student in
- [ ] Using the same link again shows "expired or already used"

## 3. Today, Diary, Schedule

- [ ] Today shows the lesson, homework due soon and new marks
- [ ] Python's attendance warning appears on Today
- [ ] "Join lesson" appears only from 15 minutes before the lesson
- [ ] Diary moves between days with the arrows, and "Back to today" works
- [ ] Schedule switches between week and month without cut-off text
- [ ] Tapping a day in the month view opens that day in the Diary
- [ ] A note added to a day appears, and can be deleted

## 4. Homework

- [ ] The To do, Submitted, Graded and Overdue tabs show the right items
- [ ] Submitting with nothing filled in is refused
- [ ] Links that aren't http(s) are refused
- [ ] Attach a phone photo and a PDF: the progress bar shows, and they're marked "Not handed in yet"
- [ ] An `.exe` file and a file over 10 MB are refused with a clear message
- [ ] A sixth file is refused
- [ ] An attached file can be removed before handing in
- [ ] After Submit, a receipt shows the attempt number, time, "On time" and a reference code
- [ ] A file opens from the receipt
- [ ] Submit again with "Also hand in the files" ticked: attempt 2 has the files, and attempt 1 moves to "Earlier attempts"
- [ ] A returned homework shows the teacher's feedback, and resubmitting shows "After revision", not late
- [ ] A first hand-in after the deadline shows "Late"
- [ ] A graded homework shows the score and has no form
- [ ] Type an answer, reload: the draft comes back, and "Discard draft" clears it

## 5. Marks and attendance

- [ ] Averages show 1 decimal, in the right colour (green from 85, amber from 60, red below)
- [ ] Autumn 2026 shows the current courses, and Spring 2026 shows only English A2
- [ ] Spring 2026 shows the final grade 78
- [ ] Attendance shows the warning under 80% and the red alert under 70% (Spring 2026)

## 6. Notes, notifications, Profile

- [ ] To-dos can be added with and without a date, ticked and deleted
- [ ] Notes can be added and deleted
- [ ] The bell shows the unread count, and "Mark all read" clears it
- [ ] Tapping a notification opens the right page
- [ ] Email and Phone switches stay as set after a reload
- [ ] Timezone changes the times shown

## 7. Languages

Repeat in Azerbaijani and in Russian:

- [ ] Login, Today, Homework, Marks and Profile have no English interface text (course names may stay as entered)
- [ ] Dates, weekdays and Russian plurals read correctly
- [ ] Switching language in the top-right AZ / RU / EN menu is remembered after logging out and back in
- [ ] A phone set to Russian opens `/ru` on a first visit

## 8. Keeping students apart

- [ ] As Aysel, copy a file link from a receipt. As Nigar, opening it fails
- [ ] Logged out, opening that file link fails
- [ ] Nigar's Marks and Notes show none of Aysel's data
- [ ] "Log out on all devices" signs out a second browser too
- [ ] "Download my data" contains only that student's data and no passwords

## 9. Privacy

- [ ] The privacy notice opens from the login page without logging in
- [ ] "Request deletion" shows the pending message, and "Cancel request" removes it
- [ ] `npm run privacy:requests` lists an open request

## 10. Offline and install (production build only)

- [ ] Visit Today and Diary, turn on airplane mode: both still open, with the offline banner
- [ ] A page not visited before shows the offline page
- [ ] Log out, then with airplane mode on, the saved pages are gone
- [ ] From the 2nd visit, Today suggests installing the app, and "Not now" hides it
- [ ] Light and dark mode are both readable
- [ ] Delete buttons and checkboxes are easy to tap with a thumb

## 11. After deploying (can't be tested locally)

- [ ] Install to the home screen on Android and on iPhone: the icon and name are right
- [ ] Turn on phone notifications on Android and on an installed iPhone app (iOS 16.4+)
- [ ] A real push arrives, and tapping it opens the right page
- [ ] A real file upload to Vercel Blob works, with no CSP errors in the browser console
- [ ] A real email arrives through Resend, not in spam
- [ ] Forgot password works by real email
- [ ] The reminder and retention jobs appear in Vercel's Cron Jobs tab and succeed
- [ ] The security headers are present on the live site
