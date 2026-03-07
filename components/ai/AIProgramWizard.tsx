'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface Client {
  id: string
  clientId: string
  client: {
    id: string
    name: string | null
    email: string | null
    clientProfile: {
      goals: string[]
      equipment: string[]
      injuries: string | null
    } | null
  }
}

interface AIProgramWizardProps {
  coach: {
    id: string
    aiProvider: "GEMINI_FREE" | "VENICE_FREE" | "PAY_PER_PROGRAM" | "BRING_YOUR_OWN_KEY"
    aiCredits: number
    totalProgramsGenerated: number
  }
  clients: Client[]
}

const EQUIPMENT_OPTIONS = [
  "Barbell",
  "Dumbbells",
  "Kettlebells",
  "Resistance Bands",
  "Pull-up Bar",
  "Bench",
  "Squat Rack",
  "Cable Machine",
  "Bodyweight Only",
]

const EXPERIENCE_LEVELS = [
  { value: "BEGINNER", label: "Beginner", description: "< 1 year training" },
  { value: "INTERMEDIATE", label: "Intermediate", description: "1-3 years training" },
  { value: "ADVANCED", label: "Advanced", description: "3+ years training" },
]

export default function AIProgramWizard({ coach, clients }: AIProgramWizardProps) {
  const router = useRouter()
  const [step, setStep] = useState(1)
  const [generating, setGenerating] = useState(false)
  const [saving, setSaving] = useState(false)
  const [generatedProgram, setGeneratedProgram] = useState<any>(null)

  // Form state
  const [selectedClient, setSelectedClient] = useState<Client | null>(null)
  const [clientGoals, setClientGoals] = useState("")
  const [trainingDays, setTrainingDays] = useState(3)
  const [equipment, setEquipment] = useState<string[]>([])
  const [experience, setExperience] = useState<"BEGINNER" | "INTERMEDIATE" | "ADVANCED">("INTERMEDIATE")
  const [programLength, setProgramLength] = useState(12)
  const [injuries, setInjuries] = useState("")

  const canProceed = () => {
    switch (step) {
      case 1:
        return selectedClient !== null
      case 2:
        return clientGoals.trim().length > 10
      case 3:
        return equipment.length > 0
      case 4:
        return true // Review step
      default:
        return false
    }
  }

  const handleGenerate = async () => {
    if (!selectedClient) return

    // Check if coach has access
    if (coach.aiProvider === "GEMINI_FREE" && coach.totalProgramsGenerated >= 5) {
      toast.error("Free tier limit reached. Upgrade to continue generating programs.")
      router.push("/coach/settings/ai")
      return
    }

    if (coach.aiProvider === "PAY_PER_PROGRAM" && coach.aiCredits < 1) {
      toast.error("Insufficient credits. Purchase more credits to continue.")
      router.push("/coach/settings/ai")
      return
    }

    setGenerating(true)

    try {
      const res = await fetch("/api/ai/generate-program", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          clientGoals,
          trainingDays,
          equipment,
          experience,
          programLength,
          injuries: injuries || undefined,
          clientId: selectedClient.clientId,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to generate program")
      }

      const data = await res.json()
      setGeneratedProgram(data.program)
      setStep(5) // Move to preview step
      toast.success("Program generated successfully!")
    } catch (error: any) {
      console.error("Generation error:", error)
      toast.error(error.message || "Failed to generate program")
    } finally {
      setGenerating(false)
    }
  }

  const handleSaveProgram = async () => {
    if (!selectedClient || !generatedProgram) return

    setSaving(true)

    try {
      const res = await fetch("/api/programs/save", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          programData: generatedProgram,
          clientId: selectedClient.clientId,
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to save program")
      }

      const data = await res.json()
      toast.success(`${generatedProgram.programName} saved successfully!`)
      router.push(`/coach/programs/${data.programId}`)
    } catch (error: any) {
      console.error("Save error:", error)
      toast.error(error.message || "Failed to save program")
    } finally {
      setSaving(false)
    }
  }

  const handleEquipmentToggle = (item: string) => {
    setEquipment((prev) =>
      prev.includes(item) ? prev.filter((e) => e !== item) : [...prev, item]
    )
  }

  // Auto-fill from client profile if available
  const handleClientSelect = (client: Client) => {
    setSelectedClient(client)
    if (client.client.clientProfile) {
      const profile = client.client.clientProfile
      if (profile.goals.length > 0) {
        setClientGoals(profile.goals.join(", "))
      }
      if (profile.equipment.length > 0) {
        setEquipment(profile.equipment)
      }
      if (profile.injuries) {
        setInjuries(profile.injuries)
      }
    }
  }

  return (
    <div className="bg-white rounded-lg shadow-lg overflow-hidden">
      {/* Progress Bar */}
      <div className="bg-gray-100 px-6 py-4">
        <div className="flex justify-between items-center mb-2">
          <span className="text-sm font-medium text-gray-700">Step {step} of 5</span>
          <span className="text-sm text-gray-500">
            {coach.aiProvider === "GEMINI_FREE" && `${5 - coach.totalProgramsGenerated} free programs left`}
            {coach.aiProvider === "PAY_PER_PROGRAM" && `${coach.aiCredits} credits remaining`}
          </span>
        </div>
        <div className="w-full bg-gray-200 rounded-full h-2">
          <div
            className="bg-primary-600 h-2 rounded-full transition-all duration-300"
            style={{ width: `${(step / 5) * 100}%` }}
          />
        </div>
      </div>

      <div className="p-8">
        {/* Step 1: Select Client */}
        {step === 1 && (
          <div>
            <h2 className="text-2xl font-bold mb-2">Select Your Client</h2>
            <p className="text-gray-600 mb-6">Who is this program for?</p>

            {clients.length === 0 ? (
              <div className="bg-yellow-50 border border-yellow-200 rounded-lg p-6 text-center">
                <p className="text-yellow-800 mb-4">
                  You don't have any active clients yet. Add a client first to create programs.
                </p>
                <button
                  onClick={() => router.push("/coach/clients/new")}
                  className="bg-primary-600 text-white px-6 py-2 rounded-lg hover:bg-primary-700"
                >
                  Add Client
                </button>
              </div>
            ) : (
              <div className="grid gap-4">
                {clients.map((client) => (
                  <button
                    key={client.id}
                    onClick={() => handleClientSelect(client)}
                    className={`text-left border-2 rounded-lg p-4 transition ${
                      selectedClient?.id === client.id
                        ? "border-primary-600 bg-primary-50"
                        : "border-gray-200 hover:border-primary-300"
                    }`}
                  >
                    <div className="font-semibold text-lg">{client.client.name || "Unnamed Client"}</div>
                    <div className="text-sm text-gray-500">{client.client.email || "No email"}</div>
                    {client.client.clientProfile?.goals && client.client.clientProfile.goals.length > 0 && (
                      <div className="text-sm text-gray-600 mt-2">
                        Goals: {client.client.clientProfile.goals.join(", ")}
                      </div>
                    )}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}

        {/* Step 2: Client Goals */}
        {step === 2 && (
          <div>
            <h2 className="text-2xl font-bold mb-2">Training Goals</h2>
            <p className="text-gray-600 mb-6">What does {selectedClient?.client.name || "your client"} want to achieve?</p>

            <textarea
              value={clientGoals}
              onChange={(e) => setClientGoals(e.target.value)}
              placeholder="e.g., Increase squat 1RM by 50lbs, build muscle mass in upper body, improve work capacity"
              className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent h-32"
            />
            <p className="text-sm text-gray-500 mt-2">Be specific. The AI will use this to design the program.</p>
          </div>
        )}

        {/* Step 3: Training Details */}
        {step === 3 && (
          <div>
            <h2 className="text-2xl font-bold mb-6">Training Details</h2>

            {/* Training Days */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Training Days Per Week
              </label>
              <div className="flex gap-2">
                {[2, 3, 4, 5, 6].map((days) => (
                  <button
                    key={days}
                    onClick={() => setTrainingDays(days)}
                    className={`flex-1 py-3 rounded-lg border-2 transition ${
                      trainingDays === days
                        ? "border-primary-600 bg-primary-600 text-white"
                        : "border-gray-200 hover:border-primary-300"
                    }`}
                  >
                    {days}
                  </button>
                ))}
              </div>
            </div>

            {/* Equipment */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Available Equipment
              </label>
              <div className="grid grid-cols-2 md:grid-cols-3 gap-3">
                {EQUIPMENT_OPTIONS.map((item) => (
                  <button
                    key={item}
                    onClick={() => handleEquipmentToggle(item)}
                    className={`py-2 px-4 rounded-lg border-2 transition text-sm ${
                      equipment.includes(item)
                        ? "border-primary-600 bg-primary-50 text-primary-700"
                        : "border-gray-200 hover:border-primary-300"
                    }`}
                  >
                    {item}
                  </button>
                ))}
              </div>
            </div>

            {/* Experience Level */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Training Experience
              </label>
              <div className="grid grid-cols-3 gap-4">
                {EXPERIENCE_LEVELS.map((level) => (
                  <button
                    key={level.value}
                    onClick={() => setExperience(level.value as any)}
                    className={`text-left border-2 rounded-lg p-3 transition ${
                      experience === level.value
                        ? "border-primary-600 bg-primary-50"
                        : "border-gray-200 hover:border-primary-300"
                    }`}
                  >
                    <div className="font-semibold text-sm">{level.label}</div>
                    <div className="text-xs text-gray-500 mt-1">{level.description}</div>
                  </button>
                ))}
              </div>
            </div>

            {/* Program Length */}
            <div className="mb-6">
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Program Length: {programLength} weeks
              </label>
              <input
                type="range"
                min="4"
                max="16"
                value={programLength}
                onChange={(e) => setProgramLength(Number(e.target.value))}
                className="w-full"
              />
              <div className="flex justify-between text-xs text-gray-500 mt-1">
                <span>4 weeks</span>
                <span>16 weeks</span>
              </div>
            </div>

            {/* Injuries */}
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-3">
                Injuries or Limitations (Optional)
              </label>
              <textarea
                value={injuries}
                onChange={(e) => setInjuries(e.target.value)}
                placeholder="e.g., Previous shoulder injury, avoid overhead pressing"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent h-24"
              />
            </div>
          </div>
        )}

        {/* Step 4: Review & Generate */}
        {step === 4 && (
          <div>
            <h2 className="text-2xl font-bold mb-2">Review & Generate</h2>
            <p className="text-gray-600 mb-6">Confirm the details before generating</p>

            <div className="bg-gray-50 rounded-lg p-6 space-y-4">
              <div>
                <div className="text-sm font-medium text-gray-500">Client</div>
                <div className="text-lg font-semibold">{selectedClient?.client.name || "Unnamed Client"}</div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-500">Goals</div>
                <div>{clientGoals}</div>
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div>
                  <div className="text-sm font-medium text-gray-500">Training Days</div>
                  <div className="font-semibold">{trainingDays} days/week</div>
                </div>
                <div>
                  <div className="text-sm font-medium text-gray-500">Program Length</div>
                  <div className="font-semibold">{programLength} weeks</div>
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-500">Equipment</div>
                <div className="flex flex-wrap gap-2 mt-1">
                  {equipment.map((item) => (
                    <span key={item} className="bg-white px-3 py-1 rounded-full text-sm border border-gray-200">
                      {item}
                    </span>
                  ))}
                </div>
              </div>

              <div>
                <div className="text-sm font-medium text-gray-500">Experience Level</div>
                <div className="font-semibold capitalize">{experience.toLowerCase()}</div>
              </div>

              {injuries && (
                <div>
                  <div className="text-sm font-medium text-gray-500">Injuries/Limitations</div>
                  <div>{injuries}</div>
                </div>
              )}
            </div>

            <div className="mt-6 bg-blue-50 border border-blue-200 rounded-lg p-4">
              <p className="text-sm text-blue-800">
                <strong>Note:</strong> AI will create a complete periodized program with mesocycles, microcycles, and specific workouts.
                {coach.aiProvider === "PAY_PER_PROGRAM" && " This will use 1 credit."}
                {coach.aiProvider === "GEMINI_FREE" && ` You have ${5 - coach.totalProgramsGenerated} free generations left this month.`}
              </p>
            </div>
          </div>
        )}

        {/* Step 5: Generated Program Preview */}
        {step === 5 && generatedProgram && (
          <div>
            <h2 className="text-2xl font-bold mb-2">✨ Program Generated!</h2>
            <p className="text-gray-600 mb-6">Review and edit before saving</p>

            <div className="bg-gray-50 rounded-lg p-6 mb-6">
              <h3 className="text-xl font-bold mb-2">{generatedProgram.programName}</h3>
              <p className="text-gray-600 mb-4">{generatedProgram.description}</p>

              <div className="bg-white rounded-lg p-4 mb-4">
                <h4 className="font-semibold mb-2">AI Rationale</h4>
                <p className="text-sm text-gray-600">{generatedProgram.rationale}</p>
              </div>

              <div className="space-y-4">
                <h4 className="font-semibold">Program Structure</h4>
                {generatedProgram.mesocycles.map((meso: any, idx: number) => (
                  <div key={idx} className="border-l-4 border-primary-600 pl-4">
                    <div className="font-semibold">{meso.name}</div>
                    <div className="text-sm text-gray-600">{meso.description}</div>
                    <div className="text-sm text-gray-500 mt-1">
                      {meso.durationWeeks} weeks • {meso.microcycles.length} microcycles • Focus: {meso.focus}
                    </div>
                  </div>
                ))}
              </div>
            </div>

            <div className="flex gap-4">
              <button
                onClick={handleSaveProgram}
                disabled={saving}
                className="flex-1 bg-primary-600 text-white py-3 rounded-lg hover:bg-primary-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
              >
                {saving ? "Saving..." : "💾 Save Program"}
              </button>
              <button
                onClick={() => {
                  setGeneratedProgram(null)
                  setStep(4)
                }}
                disabled={saving}
                className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 font-semibold disabled:opacity-50"
              >
                Generate Different Program
              </button>
            </div>
          </div>
        )}

        {/* Navigation Buttons */}
        {step < 4 && (
          <div className="flex gap-4 mt-8">
            {step > 1 && (
              <button
                onClick={() => setStep(step - 1)}
                className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 font-semibold"
              >
                ← Back
              </button>
            )}
            <button
              onClick={() => {
                if (step === 3) {
                  setStep(4)
                } else {
                  setStep(step + 1)
                }
              }}
              disabled={!canProceed()}
              className="flex-1 bg-primary-600 text-white py-3 rounded-lg hover:bg-primary-700 font-semibold disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {step === 3 ? "Review →" : "Next →"}
            </button>
          </div>
        )}

        {step === 4 && !generating && (
          <div className="flex gap-4 mt-8">
            <button
              onClick={() => setStep(3)}
              className="flex-1 bg-gray-200 text-gray-700 py-3 rounded-lg hover:bg-gray-300 font-semibold"
            >
              ← Back
            </button>
            <button
              onClick={handleGenerate}
              className="flex-1 bg-primary-600 text-white py-3 rounded-lg hover:bg-primary-700 font-semibold"
            >
              🤖 Generate with AI
            </button>
          </div>
        )}

        {generating && (
          <div className="mt-8 text-center">
            <div className="inline-block animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mb-4" />
            <p className="text-gray-600">AI is creating your program... This may take 30-60 seconds.</p>
          </div>
        )}
      </div>
    </div>
  )
}
