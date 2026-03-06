import OpenAI from "openai"
import { prisma } from "../prisma"

// OpenRouter API endpoint
const OPENROUTER_BASE_URL = "https://openrouter.ai/api/v1"

// Free models (no cost)
export const FREE_MODELS = {
  GEMINI_FLASH: "google/gemini-2.0-flash-exp:free",
  GEMINI_PRO: "google/gemini-pro-1.5-exp",
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

  switch (coach.aiProvider) {
    case "GEMINI_FREE":
      // Use our OpenRouter key with free model
      apiKey = process.env.OPENROUTER_API_KEY || ""
      model = FREE_MODELS.GEMINI_FLASH

      // Check monthly limit (5 free programs)
      if (coach.totalProgramsGenerated >= 5) {
        throw new Error("Free tier limit reached. Upgrade to pay-per-program or add your own API key.")
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

  // Initialize OpenAI client (compatible with OpenRouter)
  const openai = new OpenAI({
    baseURL: OPENROUTER_BASE_URL,
    apiKey: apiKey,
    defaultHeaders: {
      "HTTP-Referer": process.env.NEXTAUTH_URL || "https://wod.coach",
      "X-Title": "WOD Coach",
    },
  })

  // Create the program generation prompt
  const systemPrompt = `You are an elite strength and conditioning coach with a PhD in Exercise Science. You specialize in evidence-based periodized program design.

Your expertise includes:
- Linear, block, and undulating periodization models
- Progressive overload and volume management
- Exercise selection for specific adaptations (hypertrophy, strength, power, endurance)
- Deload timing and fatigue management
- Velocity-based training (VBT) principles
- Autoregulation strategies
- Movement pattern balancing

Create scientifically-backed, practical programs that coaches can implement immediately.`

  const userPrompt = `Create a complete ${params.programLength}-week training program with this information:

CLIENT PROFILE:
- Training Goals: ${params.clientGoals}
- Training Experience: ${params.experience}
- Available Training Days: ${params.trainingDays} days per week
- Equipment Available: ${params.equipment.join(", ")}
${params.injuries ? `- Injuries/Limitations: ${params.injuries}` : ""}

REQUIREMENTS:
1. Structure the program with proper periodization (mesocycles and microcycles)
2. Include specific exercises, sets, reps, rest periods
3. Progress intensity and volume appropriately
4. Include deload week(s) if program is 8+ weeks
5. Explain the rationale for your phase structure

Return ONLY valid JSON in this exact format:
{
  "programName": "string",
  "description": "string",
  "totalWeeks": number,
  "rationale": "string explaining your periodization choices",
  "mesocycles": [
    {
      "name": "string (e.g., Hypertrophy Phase)",
      "focus": "HYPERTROPHY" | "STRENGTH" | "POWER" | "ENDURANCE" | "DELOAD",
      "durationWeeks": number,
      "description": "string",
      "microcycles": [
        {
          "weekNumber": number,
          "description": "string",
          "workouts": [
            {
              "dayOfWeek": number (0-6, where 0 is Sunday),
              "name": "string (e.g., Upper Body Push)",
              "description": "string",
              "exercises": [
                {
                  "name": "string (e.g., Barbell Bench Press)",
                  "sets": number,
                  "reps": "string (e.g., 8-12 or 5)",
                  "restSeconds": number,
                  "tempo": "string (e.g., 3-1-1-0)" | null,
                  "notes": "string" | null
                }
              ]
            }
          ]
        }
      ]
    }
  ]
}

IMPORTANT: Return ONLY the JSON object, no markdown, no explanatory text before or after.`

  try {
    const completion = await openai.chat.completions.create({
      model: model,
      messages: [
        { role: "system", content: systemPrompt },
        { role: "user", content: userPrompt },
      ],
      temperature: 0.7,
      max_tokens: 8000,
    })

    const responseContent = completion.choices[0]?.message?.content

    if (!responseContent) {
      throw new Error("No response from AI")
    }

    // Parse JSON response
    const programData = JSON.parse(responseContent)

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
