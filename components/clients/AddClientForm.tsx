'use client'

import { useState } from "react"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface AddClientFormProps {
  coachId: string
}

export default function AddClientForm({ coachId }: AddClientFormProps) {
  const router = useRouter()
  const [loading, setLoading] = useState(false)
  const [formData, setFormData] = useState({
    name: "",
    email: "",
    password: "changeme123", // Default password
    goals: "",
    equipment: [] as string[],
    injuries: "",
  })

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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setLoading(true)

    try {
      const res = await fetch("/api/clients/create", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          coachId,
          ...formData,
          goals: formData.goals.split(",").map(g => g.trim()).filter(Boolean),
        }),
      })

      if (!res.ok) {
        const error = await res.json()
        throw new Error(error.error || "Failed to create client")
      }

      toast.success("Client added successfully!")
      router.push("/coach")
    } catch (error: any) {
      toast.error(error.message || "Failed to add client")
    } finally {
      setLoading(false)
    }
  }

  return (
    <form onSubmit={handleSubmit} className="bg-white rounded-lg shadow p-6 space-y-6">
      {/* Basic Info */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Client Name *
        </label>
        <input
          type="text"
          required
          value={formData.name}
          onChange={(e) => setFormData({ ...formData, name: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="John Doe"
        />
      </div>

      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Email Address *
        </label>
        <input
          type="email"
          required
          value={formData.email}
          onChange={(e) => setFormData({ ...formData, email: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent"
          placeholder="john@example.com"
        />
        <p className="text-xs text-gray-500 mt-1">
          Client will receive an invite email with login credentials
        </p>
      </div>

      {/* Goals */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Training Goals
        </label>
        <textarea
          value={formData.goals}
          onChange={(e) => setFormData({ ...formData, goals: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent h-24"
          placeholder="Build muscle, increase strength, improve conditioning (comma separated)"
        />
        <p className="text-xs text-gray-500 mt-1">
          Separate multiple goals with commas
        </p>
      </div>

      {/* Equipment */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Available Equipment
        </label>
        <div className="grid grid-cols-2 md:grid-cols-3 gap-2">
          {EQUIPMENT_OPTIONS.map((eq) => (
            <label key={eq} className="flex items-center space-x-2">
              <input
                type="checkbox"
                checked={formData.equipment.includes(eq)}
                onChange={(e) => {
                  if (e.target.checked) {
                    setFormData({ ...formData, equipment: [...formData.equipment, eq] })
                  } else {
                    setFormData({ ...formData, equipment: formData.equipment.filter(e => e !== eq) })
                  }
                }}
                className="rounded border-gray-300 text-primary-600 focus:ring-primary-500"
              />
              <span className="text-sm">{eq}</span>
            </label>
          ))}
        </div>
      </div>

      {/* Injuries/Limitations */}
      <div>
        <label className="block text-sm font-medium text-gray-700 mb-2">
          Injuries or Limitations
        </label>
        <textarea
          value={formData.injuries}
          onChange={(e) => setFormData({ ...formData, injuries: e.target.value })}
          className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 focus:border-transparent h-20"
          placeholder="Any injuries, mobility issues, or training limitations..."
        />
      </div>

      {/* Submit */}
      <div className="flex gap-4">
        <button
          type="button"
          onClick={() => router.back()}
          className="flex-1 px-6 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition"
        >
          Cancel
        </button>
        <button
          type="submit"
          disabled={loading}
          className="flex-1 px-6 py-3 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition disabled:opacity-50"
        >
          {loading ? "Adding Client..." : "Add Client"}
        </button>
      </div>
    </form>
  )
}
