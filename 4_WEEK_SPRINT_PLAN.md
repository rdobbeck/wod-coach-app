# 4-Week Sprint to Launch
**Goal:** Ship a working, revenue-generating coaching platform by April 5, 2026

---

## MVP Scope: What's IN

### Core Features (Must-Have)
✅ **Already Done:**
- Landing page with pricing
- Authentication (coach/client signup)
- AI program generation (3 providers working)
- Client management (add, view, manage)
- Program creation & viewing
- Database schema

🎯 **To Build (Next 4 Weeks):**
- Stripe subscription payments (Free → Starter → Pro)
- Client dashboard (view assigned programs)
- Basic workout logging (sets, reps, weight)
- Coach-client program assignment
- Simple progress tracking
- Error monitoring & analytics
- Production deployment

### What's CUT (Post-Launch)
❌ VBT integration → Phase 2 (Month 2-3)
❌ Loom video messaging → Phase 2 (complete later)
❌ Exercise library with videos → Phase 2
❌ Mobile app → PWA in Phase 2
❌ Wearables integration → Phase 3
❌ Template marketplace → Phase 3
❌ Nutrition tracking → Phase 4
❌ Team/multi-coach features → Phase 4

---

## Week 1: Payments & Core UX (Mar 8-14)

### Day 1-2: Stripe Integration
- [ ] Create Stripe products (Free, Starter $29, Pro $99)
- [ ] Build subscription checkout flow
- [ ] Implement webhook handlers (subscription.created, updated, deleted)
- [ ] Add subscription status to coach profile
- [ ] Enforce client limits by tier

### Day 3-4: Client Dashboard Foundation
- [ ] Create `/client/dashboard` page
- [ ] Show assigned programs
- [ ] Display upcoming workouts
- [ ] Basic navigation structure

### Day 5-7: Program Assignment
- [ ] Build "Assign to Client" flow from coach side
- [ ] Update database schema for program assignments
- [ ] Show assigned programs on client dashboard
- [ ] Test full flow: Create program → Assign → Client views

**End of Week 1 Checkpoint:**
- Coaches can subscribe and pay
- Coaches can assign programs to clients
- Clients can view assigned programs

---

## Week 2: Workout Logging & Progress (Mar 15-21)

### Day 1-3: Workout Logging Interface
- [ ] Build workout detail page for clients
- [ ] Create logging form (sets, reps, weight per exercise)
- [ ] Save workout logs to database
- [ ] Display logged vs. prescribed values

### Day 4-5: Basic Progress Tracking
- [ ] Show workout history (last 5 sessions)
- [ ] Display personal records (PR tracking)
- [ ] Simple charts (weight progression per exercise)

### Day 6-7: Coach View of Client Progress
- [ ] Dashboard showing client activity
- [ ] View client workout logs
- [ ] See completion rates
- [ ] Basic analytics (programs created, active clients)

**End of Week 2 Checkpoint:**
- Clients can log workouts
- Coaches can see client progress
- Basic analytics working

---

## Week 3: Polish & Monitoring (Mar 22-28)

### Day 1-2: Error Monitoring & Analytics
- [ ] Set up Sentry for error tracking
- [ ] Add PostHog for product analytics
- [ ] Implement key event tracking:
  - Signup
  - Subscription start
  - Program created
  - Workout logged
- [ ] Set up email alerts for critical errors

### Day 3-4: UI/UX Polish
- [ ] Fix mobile responsiveness issues
- [ ] Add loading states everywhere
- [ ] Improve error messages
- [ ] Add success toasts for actions
- [ ] Optimize page load speeds

### Day 5-7: Email & Notifications
- [ ] Welcome email sequence (3 emails)
- [ ] Subscription confirmation emails
- [ ] Program assignment notifications
- [ ] Daily workout reminders
- [ ] Set up Resend or SendGrid

**End of Week 3 Checkpoint:**
- Production-ready monitoring
- Polished user experience
- Email notifications working

---

## Week 4: Testing & Launch (Mar 29 - Apr 4)

### Day 1-2: Beta Testing
- [ ] Recruit 5 beta coaches
- [ ] Give them free Pro accounts for 3 months
- [ ] Watch them use the product (screen shares)
- [ ] Fix critical bugs immediately
- [ ] Document feedback for post-launch

### Day 3-4: Production Readiness
- [ ] Set up production database backups
- [ ] Configure environment variables on Vercel
- [ ] Set up custom domain (if not done)
- [ ] SSL/security audit
- [ ] Performance testing (Lighthouse scores)
- [ ] Write basic documentation/help docs

### Day 5: Soft Launch
- [ ] Announce on Reddit (r/strengthtraining)
- [ ] Post on Twitter/X
- [ ] Email friends/colleagues in coaching
- [ ] Turn on paid signups
- [ ] Monitor for bugs/issues

### Day 6-7: Observe & Iterate
- [ ] Monitor error logs
- [ ] Watch signup funnel analytics
- [ ] Fix any critical issues
- [ ] Plan next week's improvements

**End of Week 4: LAUNCH ✅**
- Product live and accepting payments
- 5-10 beta coaches using it
- 20-50 clients logging workouts
- First paying customers

---

## Technical Debt & Shortcuts (OK for MVP)

These are acceptable for a 4-week launch:

✅ **Allowed Shortcuts:**
- Hardcoded exercise list (expand later)
- No video demonstrations (add Phase 2)
- Basic charts (can improve UX later)
- Email templates are simple text (not fancy HTML)
- Mobile is "good enough" (not perfect)
- No program templates yet (coaches create from scratch)
- AI models might be slow (optimize later)
- Manual customer support (no in-app chat yet)

❌ **Not Allowed (Must Be Right):**
- Payments/Stripe integration
- Authentication security
- Data privacy/encryption
- Database backups
- Error handling

---

## Daily Standup Checklist

Every morning, answer these 3 questions:
1. What did I ship yesterday?
2. What am I shipping today?
3. What's blocking me?

**Commit to GitHub daily.** Small commits > perfect code.

---

## Success Metrics (4 Weeks)

### Must-Have (Required for Launch)
- [ ] 5 beta coaches actively using platform
- [ ] At least 1 paying customer
- [ ] 25+ workout logs submitted
- [ ] Zero critical bugs in production
- [ ] Payment flow tested end-to-end

### Nice-to-Have (Bonus)
- [ ] 10+ signups in first week
- [ ] $100+ MRR by end of Week 4
- [ ] 4.5+ star feedback from beta users
- [ ] Sub-1s page load times
- [ ] Featured in 1 Reddit thread

---

## Risk Mitigation

### Top Risks & Mitigation Plans

**Risk 1: Stripe integration too complex**
- Mitigation: Use Stripe Checkout (hosted), not custom payment flow
- Fallback: Use Gumroad for payments temporarily

**Risk 2: Can't recruit beta coaches**
- Mitigation: Offer 6 months free Pro instead of 3
- Fallback: Use fake data to test, launch anyway

**Risk 3: Scope creep / trying to do too much**
- Mitigation: Refer to this document daily
- Fallback: Cut features ruthlessly

**Risk 4: Technical blockers (bugs, API issues)**
- Mitigation: Ask for help (AI, forums, Discord communities)
- Fallback: Ship with known minor bugs, fix in Week 5

---

## Post-Launch (Week 5-8)

Once launched, focus on:

1. **Customer feedback loop** (daily check-ins with early users)
2. **Fix critical bugs** within 24 hours
3. **Marketing** (Reddit, Twitter, content)
4. **Week 5-6:** Complete Loom integration
5. **Week 7-8:** Build exercise library

---

## Tools & Resources Needed

### Services to Set Up (Week 1)
- [x] Vercel account (already have)
- [x] Supabase account (already have)
- [ ] Stripe account (test + production mode)
- [ ] Sentry account (free tier)
- [ ] PostHog or Mixpanel (free tier)
- [ ] Email service (Resend or SendGrid)
- [ ] Domain name (if custom domain desired)

### Estimated Costs (Month 1)
- Vercel: $20/mo (Pro plan)
- Supabase: $25/mo (Pro plan)
- Sentry: Free
- PostHog: Free (up to 1M events)
- Email: $10/mo (SendGrid or Resend)
- **Total: ~$55/mo**

---

## Weekly Time Commitment

**Full-Time (40h/week):** Can hit all milestones
**Part-Time (20h/week):** Cut workout logging, focus on payments + program assignment only
**Side Project (10h/week):** Extend to 6-8 weeks, cut more features

What's your availability?

---

## Questions for Week 1 Kickoff

Before starting Week 1, confirm:

1. ✅ **Target launch:** April 5, 2026 (4 weeks)
2. ❓ **Time commitment:** How many hours/week can you dedicate?
3. ❓ **Stripe account:** Do you have one, or need to set it up?
4. ❓ **Beta coaches:** Do you know 5 coaches who'd test this?
5. ❓ **Custom domain:** Use existing domain or register new one?
6. ❓ **Email provider:** Preference for Resend, SendGrid, or other?
7. ❓ **Analytics:** PostHog or Mixpanel or other?
8. ❓ **Launch marketing:** Reddit + Twitter, or other channels?
9. ❓ **Pricing:** Keep $29/$99, or adjust based on market research?

Answer these and we'll start Week 1 development immediately!

---

*Created: March 8, 2026*
*Target Launch: April 5, 2026*
