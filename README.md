# WOD Clone - Fitness Coaching Platform

A comprehensive fitness coaching platform with workout programming, client management, messaging, and wearables integration.

## Features Implemented

### Core Infrastructure ✅
- Next.js 14 with TypeScript and Tailwind CSS
- Prisma ORM with PostgreSQL database
- NextAuth authentication (email/password + Google + GitHub)
- Comprehensive database schema for all features

### Database Models ✅
- User authentication and profiles
- Coach and Client profiles
- Program design (macro/meso/micro periodization)
- Workout and exercise library
- Workout logging and tracking
- Messaging system
- Assessments
- Lifestyle and habits tracking
- Wearables data integration
- Video library
- Subscription management

### Dashboard Pages ✅
- Coach Dashboard - Client list, program overview, quick actions
- Client Dashboard - Workouts, progress tracking, coach info

## Features To Be Built

### High Priority (MVP)
1. **Program Design Interface** - Create macro/meso/microcycles with AI assistance
2. **Workout Builder** - Exercise library with drag-and-drop builder
3. **Messaging System** - Real-time chat between coaches and clients
4. **Workout Accountability** - Log workouts, track completion, progress photos

### Medium Priority
5. **Video Upload System** - Exercise video library management
6. **Analytics Dashboard** - Readiness, sleep, macros, volume, strength progression
7. **Lifestyle Coaching** - Habits, check-ins, assessments interface

### Lower Priority
8. **Wearables Integration** - API connections for Apple Health, WHOOP, Oura, Garmin, Fitbit
9. **Stripe Payments** - Subscription tiers for coaches
10. **AI Program Design** - OpenAI/Anthropic integration for workout suggestions

## Setup

1. Install dependencies:
```bash
yarn install
```

2. Set up your database:
```bash
# Create a PostgreSQL database
# Update .env with your DATABASE_URL
cp .env.example .env

# Run migrations
npx prisma migrate dev --name init

# Seed the database (optional)
npx prisma db seed
```

3. Configure environment variables in `.env`:
- DATABASE_URL
- NEXTAUTH_URL
- NEXTAUTH_SECRET
- OAuth providers (optional)
- Stripe keys (optional)
- Wearables API keys (optional)
- AI API keys (optional)

4. Run the development server:
```bash
yarn dev
```

5. Open [http://localhost:3001](http://localhost:3001)

## Tech Stack

- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript
- **Styling:** Tailwind CSS
- **Database:** PostgreSQL with Prisma ORM
- **Authentication:** NextAuth.js
- **Payments:** Stripe (planned)
- **AI:** OpenAI/Anthropic (planned)

## Project Structure

```
/app
  /api
    /auth - NextAuth API routes
  /coach - Coach dashboard and features
  /client - Client dashboard and features
  layout.tsx - Root layout
  page.tsx - Landing page

/components
  (Reusable UI components)

/lib
  auth.ts - NextAuth configuration
  prisma.ts - Prisma client singleton

/prisma
  schema.prisma - Database schema

/types
  next-auth.d.ts - NextAuth type extensions
```

## Database Schema Highlights

- **Periodization:** Program → Mesocycle → Microcycle → Workout → WorkoutExercise
- **Tracking:** WorkoutLog → SetLog (detailed exercise tracking)
- **Relationships:** Many-to-many coach-client relationships
- **Flexibility:** JSON fields for assessments, wearables data, habits

## Next Steps

1. Build program design interface
2. Implement messaging system
3. Create workout logging interface
4. Add AI program design assistant
5. Integrate wearables APIs
6. Build analytics dashboards
7. Add video upload functionality
8. Implement Stripe subscriptions

## Contributing

This is a personal project. Feel free to fork and customize for your own use.

## License

MIT
