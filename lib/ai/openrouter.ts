import OpenAI from "openai"
import { prisma } from "../prisma"
import { fundProgram, settleAiCall } from "@/lib/ai-billing"

// API endpoints
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
const VENICE_BASE_URL = "https://api.venice.ai/api/v1"

// Model used for program generation on our OpenRouter key (free tier + pay-per-program).
// Sep 2026: the free Llama/Gemini models were withdrawn by OpenRouter.
export const PROGRAM_MODEL = process.env.AI_PROGRAM_MODEL || "anthropic/claude-fable-5.1"

// Free-tier generations per coach (lifetime). Unset = unlimited: only Ryan coaches
// today, and the OpenRouter key's own spending cap is the cost guard.
export const FREE_PROGRAM_LIMIT = process.env.AI_FREE_PROGRAM_LIMIT ? Number(process.env.AI_FREE_PROGRAM_LIMIT) : null

// Venice.ai models (privacy-focused, no data retention, ~25 prompts/day free)
export const VENICE_MODELS = {
  LLAMA_70B: "llama-3.3-70b",
  LLAMA_405B: "llama-3.1-405b",
}

// Premium models (for pay-per-program)
export const PREMIUM_MODELS = {
  CLAUDE_FABLE: "anthropic/claude-fable-5.1",
  CLAUDE_OPUS: "anthropic/claude-opus-5",
  CLAUDE_SONNET: "anthropic/claude-sonnet-5",
}

interface ProgramGenerationParams {
  coachId: string
  clientGoals: string
  trainingDays: number
  equipment: string[]
  experience: "BEGINNER" | "INTERMEDIATE" | "ADVANCED"
  programLength: number // weeks
  injuries?: string
  clientId?: string
}

export async function generateProgram(params: ProgramGenerationParams) {
  // Get coach's AI settings
  const coach = await prisma.coachProfile.findUnique({
    where: { id: params.coachId },
  })

  if (!coach) {
    throw new Error("Coach profile not found")
  }

  // Who pays: the coach's own key, then the plan's monthly programs, then their balance.
  const funding = await fundProgram(coach.userId)
  const apiKey = funding.mode === "byok" ? funding.apiKey : process.env.OPENROUTER_API_KEY || ""
  const model = (funding.mode === "byok" && funding.model) || PROGRAM_MODEL
  const baseURL = OPENROUTER_BASE_URL

  // Initialize OpenAI client (compatible with OpenRouter and Venice)
  const openai = new OpenAI({
    baseURL: baseURL,
    apiKey: apiKey,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXTAUTH_URL || "https://wod.coach",
      "X-Title": "WOD Coach",
    },
  })

  // The model writes each phase once (weekly layout + a per-week prescription for
  // every exercise); the server expands it into every week. That keeps the reply
  // small enough for 16+ week programs and makes week-to-week progression explicit.
  const systemPrompt = `You are an expert strength & conditioning coach writing a program another coach will deliver to a real client.
Use standard exercise names (e.g. "Back Squat", "Romanian Deadlift", "Pull-Up", "Dumbbell Bench Press") so they match a video library.
Prescriptions are short and specific: sets x reps, load/effort (RPE or %), e.g. "4x6 @ RPE 7" or "3x8 @ 70%".
Progress week to week within a phase, and use deloads where appropriate.`

  // Names Ryan actually programs with, so generated exercises link to his videos.
  const used = await prisma.workoutExercise.findMany({
    where: { exerciseId: { not: null } },
    distinct: ["exerciseId"],
    select: { exercise: { select: { name: true } } },
    take: 500,
  })
  const preferredNames = Array.from(new Set(used.map((u) => u.exercise!.name))).sort()

  const userPrompt = `Program length: ${params.programLength} weeks (phase weeks must add up to exactly ${params.programLength})
Training days per week: ${params.trainingDays}
Client goals: ${params.clientGoals}
Experience: ${params.experience}
Equipment: ${params.equipment.join(", ")}${params.injuries ? `\nInjuries/limitations: ${params.injuries}` : ""}

Return JSON only (no markdown), in exactly this shape:
{
  "n": "Program name",
  "d": "1-2 sentence description",
  "r": "Why this periodization fits the goals",
  "phases": [{
    "n": "Phase name",
    "f": "HYPERTROPHY|STRENGTH|POWER|ENDURANCE|DELOAD",
    "weeks": 4,
    "d": "Phase focus",
    "wk": ["Week 1 note", "Week 2 note", "..."],
    "days": [{
      "day": 1,
      "n": "Workout name",
      "d": "Coach notes for this session",
      "warmup": "Warm-up",
      "ex": [{ "n": "Back Squat", "ss": "A", "rx": ["4x6 @ RPE 7", "4x5 @ RPE 7.5", "..."], "rest": "2-3 min", "note": "cue" }]
    }]
  }]
}
${preferredNames.length ? `Preferred exercise names (the coach's video library; use these exact names whenever one fits):\n${preferredNames.join("; ")}\n\n` : ""}Rules: exactly ${params.trainingDays} entries in "days" per phase; "day" is 1-7 = day of the week counted from the program start date, spread sensibly (e.g. 1,2,4,5); "wk" and every "rx" have one entry per week of the phase; "ss" is a superset letter or omitted.`

  let chargedCents = 0
  try {
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.4,
      max_tokens: 32000,
      // OpenRouter adds the call's real cost to `usage`.
      ...({ usage: { include: true } } as {}),
    })

    // The model time is spent whether or not the reply parses, so book it now.
    const usage = completion.usage as (OpenAI.CompletionUsage & { cost?: number }) | undefined
    const tokensIn = usage?.prompt_tokens ?? 0
    const tokensOut = usage?.completion_tokens ?? 0
    // Fallback price is Fable's ($10 / $50 per million), the priciest we use.
    const costUsd = typeof usage?.cost === "number" ? usage.cost : (tokensIn * 10 + tokensOut * 50) / 1e6
    chargedCents = await settleAiCall(coach.userId, funding, { kind: "generate", model, costUsd, tokensIn, tokensOut, clientId: params.clientId })

    const responseContent = completion.choices[0]?.message?.content
    if (!responseContent) {
      throw new Error("No response from AI")
    }
    if (completion.choices[0]?.finish_reason === "length") {
      throw new Error("The AI response was cut off. Try fewer weeks or training days.")
    }

    // Tolerate code fences or a stray sentence around the JSON.
    const start = responseContent.indexOf("{")
    const end = responseContent.lastIndexOf("}")
    const compactData = JSON.parse(responseContent.slice(start, end + 1))

    const pick = (arr: string[] | undefined, i: number) => (arr?.length ? arr[Math.min(i, arr.length - 1)] : undefined)
    const programData = {
      programName: compactData.n,
      description: compactData.d,
      totalWeeks: compactData.phases.reduce((n: number, p: any) => n + (p.weeks || 0), 0),
      rationale: compactData.r,
      mesocycles: compactData.phases.map((phase: any) => ({
        name: phase.n,
        focus: phase.f,
        durationWeeks: phase.weeks,
        description: phase.d,
        microcycles: Array.from({ length: phase.weeks }, (_, w) => ({
          weekNumber: w + 1,
          description: pick(phase.wk, w) ?? null,
          workouts: phase.days.map((day: any) => ({
            dayOfWeek: Math.min(Math.max((day.day || 1) - 1, 0), 6), // offset within the week
            name: day.n,
            description: day.d || null,
            warmup: day.warmup || null,
            exercises: day.ex.map((ex: any) => {
              const rx = pick(ex.rx, w) ?? ""
              return {
                name: ex.n,
                prescription: [rx, ex.rest && `rest ${ex.rest}`].filter(Boolean).join(", "),
                sets: Number(rx.match(/^(\d+)\s*x/i)?.[1]) || null,
                reps: rx.match(/^\d+\s*x\s*([\w-]+)/i)?.[1] ?? null,
                supersetGroup: ex.ss || null,
                notes: ex.note || null,
              }
            }),
          })),
        })),
      })),
    }

    // Increment coach's total programs generated
    await prisma.coachProfile.update({
      where: { id: params.coachId },
      data: { totalProgramsGenerated: { increment: 1 } },
    })

    return {
      success: true,
      program: programData,
      modelUsed: model,
      paidBy: funding.mode,
      chargedCents,
    }
  } catch (error: any) {
    throw new Error(`Program generation failed: ${error.message}`)
  }
}

export async function purchaseCredits(coachId: string, creditsAmount: number) {
  const pricePerCredit = 3.00
  const totalAmount = creditsAmount * pricePerCredit

  // This will be called after successful Stripe payment
  await prisma.$transaction([
    prisma.coachProfile.update({
      where: { id: coachId },
      data: { aiCredits: { increment: creditsAmount } },
    }),
    prisma.aICreditPurchase.create({
      data: {
        coachId,
        creditsAmount,
        pricePerCredit,
        totalAmount,
      },
    }),
  ])

  return { success: true, newBalance: creditsAmount }
}

export async function getAISettings(coachId: string) {
  const coach = await prisma.coachProfile.findUnique({
    where: { id: coachId },
    select: {
      aiProvider: true,
      aiCredits: true,
      totalProgramsGenerated: true,
      preferredModel: true,
    },
  })

  return coach
}
