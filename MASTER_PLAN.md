# WOD.COACH Master Plan

## Executive Summary
WOD.COACH is a SaaS platform for strength coaches, personal trainers, and performance specialists. It combines AI-powered program design, client management, and optional VBT (velocity-based training) subscriptions to create a complete coaching business toolkit with multiple revenue streams.

---

## Current State (March 2026)

### ✅ Implemented Core Features
- **Authentication & User Management**
  - NextAuth with email/password
  - Role-based access (Coach/Client)
  - Session management

- **AI Program Builder**
  - Multi-provider support (OpenRouter Free, Venice, BYOK, Pay-per-program)
  - Generates periodized programs (mesocycles/microcycles/workouts)
  - 4 pricing tiers: Free (200/day), Venice (requires credits), Pay-per-program ($3), BYOK
  - Database schema for programs with full periodization structure

- **Client Management**
  - Add/view clients
  - Client profiles (goals, equipment, injuries)
  - Client-coach relationships

- **Database Architecture**
  - Supabase PostgreSQL
  - Prisma ORM
  - Full schema for users, programs, clients, video messages

- **Landing Page**
  - Professional marketing site
  - Clear value propositions
  - Pricing tiers displayed
  - Call-to-action flows

### 🚧 Partially Implemented
- **Loom Video Messaging** (ON HOLD)
  - Database schema ready
  - Components written
  - Awaiting Public App ID from Loom
  - Documentation in `LOOM_INTEGRATION_PLAN.md`

### ❌ Not Yet Implemented
- Stripe subscription payments
- Client workout logging
- VBT tracking functionality
- Progress tracking & analytics
- Wearables integration (WHOOP, Oura, Garmin)
- Exercise library with videos
- Workout check-ins
- Mobile app (Progressive Web App)
- White-label functionality
- Multi-coach/team features
- Nutrition tracking
- Program templates/library

---

## Phase 1: MVP Launch (Weeks 1-4)

**Goal:** Get paying coaches using the platform with core features working.

### Week 1: Testing & Stabilization
- [ ] Test AI program generation with real use cases
- [ ] Fix any critical bugs in client/program management
- [ ] Test all authentication flows
- [ ] Set up error monitoring (Sentry)
- [ ] Configure production database backups

### Week 2: Stripe Integration
- [ ] Set up Stripe products for subscription tiers
- [ ] Implement subscription checkout flow
- [ ] Create customer portal for subscription management
- [ ] Add webhook handlers for subscription events
- [ ] Test payment flows (free trial → paid)
- [ ] Implement client limits based on tier

### Week 3: Client Experience
- [ ] Build client dashboard
- [ ] Implement program viewing for clients
- [ ] Add workout logging interface
- [ ] Create progress tracking (weight, reps, sets)
- [ ] Build simple analytics for clients

### Week 4: Polish & Deploy
- [ ] Final bug fixes
- [ ] Performance optimization
- [ ] SEO optimization
- [ ] Set up analytics (PostHog/Mixpanel)
- [ ] Soft launch to beta testers
- [ ] Collect feedback

**Success Metrics:**
- 10 beta coaches signed up
- 5 coaches on paid tiers
- 50+ clients using the platform
- <100ms average page load time
- Zero critical bugs

---

## Phase 2: Core Feature Completion (Weeks 5-12)

### Exercise Library (Weeks 5-6)
- [ ] Build exercise database
- [ ] Add video demonstrations (embed YouTube/Vimeo)
- [ ] Create exercise search/filter
- [ ] Tag exercises by muscle group, equipment
- [ ] Allow coaches to add custom exercises

### Program Templates & Sharing (Weeks 7-8)
- [ ] Create template system
- [ ] Build template marketplace
- [ ] Allow coaches to share/sell templates
- [ ] Implement program cloning
- [ ] Add template categories (strength, hypertrophy, sport-specific)

### Communication & Retention (Weeks 9-10)
- [ ] Complete Loom video integration
- [ ] Build in-app messaging system
- [ ] Add workout check-in notifications
- [ ] Create automated reminder system
- [ ] Build progress photo uploads

### Mobile Experience (Weeks 11-12)
- [ ] Convert to Progressive Web App (PWA)
- [ ] Optimize mobile UI/UX
- [ ] Add offline workout logging
- [ ] Test on iOS/Android devices
- [ ] Submit to app stores (optional)

**Success Metrics:**
- 50 paying coaches
- 500+ active clients
- 80% coach retention after 3 months
- 4.5+ star rating from users
- 1000+ programs created

---

## Phase 3: VBT & Advanced Features (Weeks 13-20)

### VBT Core (Weeks 13-16)
**DECISION NEEDED: Build custom or integrate existing VBT hardware/software?**

**Option A: Partner with existing VBT provider (e.g., GymAware, PUSH)**
- Pros: Faster to market, proven hardware
- Cons: Revenue share, dependency on partner

**Option B: Build custom VBT solution**
- Requires: Hardware partnerships (accelerometer manufacturers)
- Mobile app for velocity measurement
- Bluetooth integration
- Algorithm for velocity calculation

**Minimum VBT Features:**
- [ ] Real-time bar velocity measurement
- [ ] Autoregulated load recommendations
- [ ] Force-velocity profiling
- [ ] Fatigue monitoring
- [ ] Readiness scores
- [ ] Client VBT subscription ($4.99/week)
- [ ] Coach VBT markup configuration

### Wearables Integration (Weeks 17-18)
- [ ] WHOOP API integration (sleep, recovery, strain)
- [ ] Oura Ring API (sleep, readiness)
- [ ] Garmin Connect (workouts, HR)
- [ ] Display readiness scores in coach dashboard
- [ ] Auto-adjust programming based on readiness

### Advanced Analytics (Weeks 19-20)
- [ ] Volume/intensity tracking over time
- [ ] Trend analysis & insights
- [ ] Predicted 1RM calculations
- [ ] Client progress reports (PDF export)
- [ ] Coach business analytics (retention, revenue)

**Success Metrics:**
- 100 paying coaches
- 20+ coaches offering VBT subscriptions
- 200+ clients on VBT add-on
- $10k MRR from VBT subscriptions
- Integration with 2+ wearables platforms

---

## Phase 4: Scale & Enterprise (Weeks 21-32)

### Team/Multi-Coach Features (Weeks 21-24)
- [ ] Gym/facility accounts
- [ ] Multiple coach seats
- [ ] Shared client pools
- [ ] Coach permissions & roles
- [ ] Team analytics dashboard
- [ ] White-label branding options

### Nutrition & Lifestyle (Weeks 25-28)
- [ ] Macro tracking
- [ ] Meal planning templates
- [ ] Nutrition goal setting
- [ ] Habit tracking
- [ ] Sleep/stress monitoring
- [ ] Integration with MyFitnessPal

### API & Integrations (Weeks 29-32)
- [ ] Public API for third-party integrations
- [ ] Zapier integration
- [ ] Webhook support
- [ ] CSV import/export
- [ ] Integration with scheduling software (Calendly)

**Success Metrics:**
- 500 paying coaches
- 50+ gym/facility accounts
- $50k MRR
- 95% uptime SLA
- Enterprise contracts signed

---

## Business Model Deep Dive

### Revenue Streams

1. **Coach Subscriptions (Primary)**
   - Free: $0/mo (1-5 clients, unlimited programs)
   - Starter: $29/mo (6-50 clients)
   - Pro: $99/mo (51-150 clients)
   - Enterprise: Custom (unlimited, teams, white-label)

2. **VBT Client Subscriptions (Secondary)**
   - Client pays: $4.99/week ($259.48/year)
   - Platform fee: TBD (e.g., $2.50/week, coach keeps $2.49/week)
   - At scale: 1000 VBT clients = $2500/week = $130k/year platform revenue

3. **Program Templates Marketplace (Tertiary)**
   - Coaches sell templates
   - Platform takes 30% commission
   - Premium templates: $20-$100 each

4. **API Access & Integrations (Future)**
   - Enterprise API access: $500+/mo
   - Per-request pricing for high-volume users

### Target Customer Segments

**Primary: Independent Coaches**
- Personal trainers with 10-50 clients
- Online coaches managing remote clients
- Strength & conditioning specialists
- Pain point: Spreadsheet chaos, no VBT tools

**Secondary: Small Gyms (2-5 coaches)**
- CrossFit boxes
- Performance training facilities
- Boutique fitness studios
- Pain point: Multiple coaches, no shared system

**Tertiary: Enterprise (50+ coaches)**
- University S&C programs
- Professional sports teams
- Corporate wellness programs
- Pain point: Fragmented systems, compliance needs

---

## Marketing & Growth Strategy

### Phase 1: Founder-Led Growth (Months 1-6)
- Reddit: r/strengthtraining, r/personaltraining, r/strengthandconditioning
- Twitter/X: Engage with fitness influencers, S&C coaches
- YouTube: Tutorial videos, case studies
- Instagram: Reels showing platform features
- Content: "How to build a 12-week program in 60 seconds with AI"

### Phase 2: Content Marketing (Months 7-12)
- Blog: SEO-optimized articles on periodization, VBT, programming
- Guest posts on BarBend, Breaking Muscle, EliteFTS
- Podcast appearances: strength coach podcasts
- Free resources: Program templates, exercise library PDFs

### Phase 3: Paid Acquisition (Months 13+)
- Google Ads: "VBT software", "coaching platform"
- Facebook/Instagram Ads: Target personal trainers, S&C coaches
- Affiliate program: 20% recurring commission for referrals
- Conference sponsorships: NSCA, UKSCA

### Viral Mechanics
- Coaches share programs with clients (branded)
- Clients see "Powered by WOD.COACH"
- Referral program: Get 1 month free for each coach referred
- Template marketplace incentivizes coach content creation

---

## Technical Architecture Decisions

### Current Stack
- **Frontend:** Next.js 14, React, TailwindCSS
- **Backend:** Next.js API routes, Prisma ORM
- **Database:** Supabase PostgreSQL
- **Auth:** NextAuth.js
- **Hosting:** Vercel
- **AI:** OpenRouter (multi-provider LLM access)

### Infrastructure Scaling Plan

**Now (0-100 coaches):**
- Vercel Hobby/Pro ($20/mo)
- Supabase Free → Pro ($25/mo)
- Total: ~$50/mo

**Phase 2 (100-500 coaches):**
- Vercel Pro ($20/mo)
- Supabase Pro ($25/mo)
- Upstash Redis for caching ($10/mo)
- Total: ~$100/mo

**Phase 3 (500-2000 coaches):**
- Vercel Team ($100/mo)
- Supabase Team ($599/mo)
- Redis cluster ($50/mo)
- Sentry error monitoring ($26/mo)
- Total: ~$800/mo

**Phase 4 (2000+ coaches, enterprise):**
- Custom infrastructure (Kubernetes on AWS/GCP)
- Dedicated database cluster
- CDN for video content
- Estimated: $2-5k/mo

### Key Technical Challenges

1. **VBT Data Processing**
   - Real-time velocity calculations
   - Bluetooth/hardware integration
   - Mobile app architecture (React Native? Flutter? PWA?)

2. **Video Storage (Loom + Exercise Library)**
   - Bandwidth optimization
   - CDN strategy
   - Cost management at scale

3. **AI Program Generation at Scale**
   - Token cost optimization
   - Rate limiting strategy
   - Fallback providers for reliability

4. **Data Privacy & Compliance**
   - GDPR compliance (EU clients)
   - HIPAA (if storing health data)
   - Data encryption at rest/transit
   - Regular security audits

---

## Competitive Landscape

### Direct Competitors
1. **TrainHeroic**
   - Strengths: Established, VBT support
   - Weaknesses: Expensive, clunky UI, no AI

2. **Trainerize**
   - Strengths: Mobile app, large user base
   - Weaknesses: Generic fitness, no VBT, no periodization

3. **TrueCoach**
   - Strengths: Simple, clean UI
   - Weaknesses: No VBT, no AI, basic features

4. **TeamBuildr**
   - Strengths: Team-focused, good for S&C
   - Weaknesses: Enterprise-only pricing, no VBT

### Competitive Advantages
- ✅ **AI-powered program generation** (unique)
- ✅ **True periodization** (macro/meso/micro)
- ✅ **VBT as recurring revenue** for coaches
- ✅ **Modern, fast UI** (Next.js 14)
- ✅ **Flexible AI providers** (cost control)
- ✅ **Free tier** (low barrier to entry)

### Positioning Statement
"WOD.COACH is the first coaching platform built for the data-driven strength coach. Unlike generic fitness apps, we support true periodization, VBT, and AI-powered programming—helping coaches deliver elite results while building recurring revenue."

---

## Risk Assessment

### Technical Risks
- **VBT hardware integration complexity** → Mitigation: Partner with existing provider initially
- **AI API costs spiral** → Mitigation: Multi-provider strategy, cost monitoring
- **Database scaling costs** → Mitigation: Optimize queries, implement caching

### Business Risks
- **Market too niche** → Mitigation: Expand to adjacent markets (PT, online coaching)
- **Competitors copy AI features** → Mitigation: Build moat with data, network effects
- **VBT adoption slower than expected** → Mitigation: Core platform must be valuable without VBT

### Regulatory Risks
- **Health data regulations** → Mitigation: Legal review, compliance framework
- **Payment processing issues** → Mitigation: Stripe, established payment rails
- **AI liability concerns** → Mitigation: Clear disclaimers, human-in-the-loop

---

## Success Metrics Dashboard

### North Star Metric
**Monthly Recurring Revenue (MRR)**

### Key Performance Indicators

**Acquisition:**
- New coach signups/week
- Signup → activation rate
- Cost per acquisition (CPA)

**Activation:**
- % coaches who create first program
- Time to first program created
- % coaches who add first client

**Retention:**
- Monthly churn rate
- 3-month retention rate
- Net Revenue Retention (NRR)

**Revenue:**
- MRR growth rate
- Average Revenue Per User (ARPU)
- VBT attach rate
- LTV:CAC ratio

**Engagement:**
- Programs created per coach/month
- Active clients per coach
- Daily Active Users (DAU)
- Workout logs per client/week

---

## 12-Month Financial Projections

### Conservative Scenario
| Month | Coaches | Avg MRR/Coach | Total MRR | VBT Clients | VBT MRR | Total MRR |
|-------|---------|---------------|-----------|-------------|---------|-----------|
| 1     | 10      | $15           | $150      | 0           | $0      | $150      |
| 3     | 30      | $20           | $600      | 10          | $100    | $700      |
| 6     | 75      | $25           | $1,875    | 50          | $500    | $2,375    |
| 12    | 200     | $30           | $6,000    | 150         | $1,500  | $7,500    |

### Aggressive Scenario
| Month | Coaches | Avg MRR/Coach | Total MRR | VBT Clients | VBT MRR | Total MRR |
|-------|---------|---------------|-----------|-------------|---------|-----------|
| 1     | 25      | $15           | $375      | 0           | $0      | $375      |
| 3     | 100     | $25           | $2,500    | 50          | $500    | $3,000    |
| 6     | 300     | $30           | $9,000    | 200         | $2,000  | $11,000   |
| 12    | 750     | $35           | $26,250   | 600         | $6,000  | $32,250   |

### Break-Even Analysis
**Monthly Costs:**
- Infrastructure: $100
- Tools (Sentry, analytics): $100
- Marketing: $500
- Founder salary: $0 (bootstrap)
- **Total:** $700/mo

**Break-even:** ~$700 MRR = 24 coaches @ $29/mo

---

## Open Questions & Decisions Needed

1. **VBT Strategy:** Build vs. partner with existing VBT provider?
2. **Mobile App:** PWA vs. React Native vs. Flutter?
3. **Pricing:** Should Free tier have program generation limits?
4. **VBT Revenue Split:** What's the platform fee on $4.99/week?
5. **Target Market:** Focus on independent coaches or gyms first?
6. **Fundraising:** Bootstrap vs. raise seed round?
7. **Team:** Solo founder or find co-founder (technical/business)?
8. **Content Strategy:** Heavy on SEO blog or social media?
9. **Compliance:** Do we need HIPAA for health data?
10. **White-Label:** Build now or wait for enterprise demand?

---

## Immediate Next Steps (This Week)

1. ✅ Fix server errors (DONE)
2. ✅ Create master plan (DONE)
3. [ ] Answer 10 strategic questions (see below)
4. [ ] Deploy to production (Vercel)
5. [ ] Test AI program generation with real scenarios
6. [ ] Set up error monitoring (Sentry)
7. [ ] Begin Stripe integration
8. [ ] Create 3-5 demo programs to showcase
9. [ ] Reach out to 10 beta coaches
10. [ ] Set up analytics tracking

---

*Last Updated: March 8, 2026*
