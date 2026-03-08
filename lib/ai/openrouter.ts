import OpenAI from "openai"
import { prisma } from "../prisma"

// API endpoints
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"
const VENICE_BASE_URL = "https://api.venice.ai/api/v1"

// Free models (no cost) - updated March 2026
export const FREE_MODELS = {
  META_LLAMA: "meta-llama/llama-3.3-70b-instruct:free",
  GEMINI_PRO: "google/gemini-2.5-pro-exp-03-25:free",
}

// Venice.ai models (privacy-focused, no data retention, ~25 prompts/day free)
export const VENICE_MODELS = {
  LLAMA_70B: "llama-3.3-70b",
  LLAMA_405B: "llama-3.1-405b",
}

// Premium models (for pay-per-program)
export const PREMIUM_MODELS = {
  CLAUDE_SONNET: "anthropic/claude-sonnet-4",
  GPT4_TURBO: "openai/gpt-4-turbo",
  CLAUDE_OPUS: "anthropic/claude-opus-4",
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

  // Determine which AI provider/model to use
  let apiKey: string
  let model: string
  let baseURL: string = OPENROUTER_BASE_URL

  switch (coach.aiProvider) {
    case "GEMINI_FREE":
      // Use our OpenRouter key with free model
      apiKey = process.env.OPENROUTER_API_KEY || ""
      model = FREE_MODELS.META_LLAMA

      // Check monthly limit (5 free programs)
      if (coach.totalProgramsGenerated >= 5) {
        throw new Error("Free tier limit reached. Upgrade to pay-per-program or add your own API key.")
      }
      break

    case "VENICE_FREE":
      // Use Venice.ai (privacy-focused, no data retention, ~25 prompts/day free)
      apiKey = process.env.VENICE_API_KEY || ""
      model = VENICE_MODELS.LLAMA_70B
      baseURL = VENICE_BASE_URL

      if (!apiKey) {
        throw new Error("Venice.ai API key not configured. Please contact support.")
      }
      break

    case "PAY_PER_PROGRAM":
      // Use our OpenRouter key with premium model
      apiKey = process.env.OPENROUTER_API_KEY || ""
      model = PREMIUM_MODELS.CLAUDE_SONNET

      // Check credits
      if (coach.aiCredits < 1) {
        throw new Error("Insufficient credits. Purchase more credits to continue.")
      }

      // Deduct credit
      await prisma.coachProfile.update({
        where: { id: params.coachId },
        data: { aiCredits: { decrement: 1 } },
      })
      break

    case "BRING_YOUR_OWN_KEY":
      // Use coach's own OpenRouter key
      if (!coach.openrouterApiKey) {
        throw new Error("No API key configured. Please add your OpenRouter API key in settings.")
      }
      apiKey = coach.openrouterApiKey
      model = coach.preferredModel || PREMIUM_MODELS.CLAUDE_SONNET
      break

    default:
      throw new Error("Invalid AI provider configuration")
  }

  // Initialize OpenAI client (compatible with OpenRouter and Venice)
  const openai = new OpenAI({
    baseURL: baseURL,
    apiKey: apiKey,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXTAUTH_URL || "https://wod.coach",
      "X-Title": "WOD Coach",
    },
  })

  // Optimized prompts to reduce token usage
  const systemPrompt = `Expert S&C coach. Create periodized training programs with proper mesocycle/microcycle structure, exercise selection, and progression.`

  const userPrompt = `${params.programLength}wk program
Goals: ${params.clientGoals}
Exp: ${params.experience}
Days: ${params.trainingDays}/wk
Equip: ${params.equipment.join(", ")}${params.injuries ? `\nLimits: ${params.injuries}` : ""}

Return compact JSON:
{
  "n":"Program Name",
  "d":"Brief description",
  "w":${params.programLength},
  "r":"Why this periodization",
  "m":[{
    "n":"Phase Name",
    "f":"HYPERTROPHY|STRENGTH|POWER|ENDURANCE|DELOAD",
    "w":4,
    "d":"Phase description",
    "c":[{
      "wk":1,
      "d":"Week notes",
      "wo":[{
        "day":1,
        "n":"Workout Name",
        "d":"Brief",
        "ex":[{
          "n":"Exercise Name",
          "s":3,
          "r":"8-12",
          "rest":90,
          "tempo":"3-1-1-0",
          "note":"RPE 8"
        }]
      }]
    }]
  }]
}

Return JSON only, no markdown.`

  try {
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 4000, // Reduced from 8000 due to compact format
    })

    const responseContent = completion.choices[0]?.message?.content

    if (!responseContent) {
      throw new Error("No response from AI")
    }

    // Clean response (remove markdown code blocks if present)
    const cleanedResponse = responseContent
      .replace(/```json\s*/g, "")
      .replace(/```\s*/g, "")
      .trim()

    // Parse compact JSON response
    const compactData = JSON.parse(cleanedResponse)

    // Expand compact format to full format
    const programData = {
      programName: compactData.n,
      description: compactData.d,
      totalWeeks: compactData.w,
      rationale: compactData.r,
      mesocycles: compactData.m.map((meso: any) => ({
        name: meso.n,
        focus: meso.f,
        durationWeeks: meso.w,
        description: meso.d,
        microcycles: meso.c.map((micro: any) => ({
          weekNumber: micro.wk,
          description: micro.d,
          workouts: micro.wo.map((workout: any) => ({
            dayOfWeek: workout.day,
            name: workout.n,
            description: workout.d,
            exercises: workout.ex.map((ex: any) => ({
              name: ex.n,
              sets: ex.s,
              reps: ex.r,
              restSeconds: ex.rest,
              tempo: ex.tempo || null,
              notes: ex.note || null,
            })),
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
      creditsRemaining: coach.aiProvider === "PAY_PER_PROGRAM" ? coach.aiCredits - 1 : null,
    }
  } catch (error: any) {
    // Refund credit if generation failed and we charged
    if (coach.aiProvider === "PAY_PER_PROGRAM") {
      await prisma.coachProfile.update({
        where: { id: params.coachId },
        data: { aiCredits: { increment: 1 } },
      })
    }

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
      openrouterApiKey: true,
    },
  })

  return coach
}
