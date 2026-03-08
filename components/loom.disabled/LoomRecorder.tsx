'use client'

import { useState, useEffect } from "react"
import { setup as setupLoom } from "@loomhq/record-sdk"
import { oembed } from "@loomhq/loom-embed"
import { useRouter } from "next/navigation"
import { toast } from "sonner"

interface LoomRecorderProps {
  coachId: string
  clientId: string
  clientName: string
  onVideoSent?: () => void
}

export default function LoomRecorder({ coachId, clientId, clientName, onVideoSent }: LoomRecorderProps) {
  const router = useRouter()
  const [isLoomReady, setIsLoomReady] = useState(false)
  const [recording, setRecording] = useState(false)
  const [processing, setProcessing] = useState(false)
  const [title, setTitle] = useState("")
  const [description, setDescription] = useState("")
  const [showRecorder, setShowRecorder] = useState(false)

  useEffect(() => {
    const initLoom = async () => {
      try {
        const { configureButton } = await setupLoom({
          publicAppId: process.env.NEXT_PUBLIC_LOOM_PUBLIC_APP_ID!,
        })

        const button = document.getElementById("loom-record-btn")
        if (button) {
          const sdkButton = configureButton({ element: button })

          sdkButton.on("insert-click", async (video) => {
            setProcessing(true)
            try {
              // Get video details
              const { html } = await oembed(video.sharedUrl, { width: 400 })

              // Save video message to database
              const res = await fetch("/api/loom/save-video", {
                method: "POST",
                headers: { "Content-Type": "application/json" },
                body: JSON.stringify({
                  senderId: coachId,
                  receiverId: clientId,
                  loomVideoId: video.id,
                  loomShareUrl: video.sharedUrl,
                  loomEmbedUrl: video.embedUrl,
                  title: title || `Video message for ${clientName}`,
                  description,
                }),
              })

              if (!res.ok) throw new Error("Failed to save video")

              toast.success("Video message sent to " + clientName + "!")
              setShowRecorder(false)
              setTitle("")
              setDescription("")
              if (onVideoSent) onVideoSent()
            } catch (error) {
              toast.error("Failed to send video message")
            } finally {
              setProcessing(false)
            }
          })

          setIsLoomReady(true)
        }
      } catch (error) {
        console.error("Failed to initialize Loom:", error)
        toast.error("Failed to initialize video recorder")
      }
    }

    if (showRecorder) {
      initLoom()
    }
  }, [showRecorder, coachId, clientId, clientName, title, description, onVideoSent])

  if (!showRecorder) {
    return (
      <button
        onClick={() => setShowRecorder(true)}
        className="bg-primary-600 text-white px-6 py-3 rounded-lg hover:bg-primary-700 transition flex items-center gap-2"
      >
        🎥 Send Video Message
      </button>
    )
  }

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex justify-between items-center mb-6">
        <h3 className="text-xl font-bold">Send Video Message to {clientName}</h3>
        <button
          onClick={() => setShowRecorder(false)}
          className="text-gray-500 hover:text-gray-700"
        >
          ✕
        </button>
      </div>

      <div className="space-y-4">
        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Video Title (optional)
          </label>
          <input
            type="text"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500"
            placeholder={`Video message for ${clientName}`}
          />
        </div>

        <div>
          <label className="block text-sm font-medium text-gray-700 mb-2">
            Description (optional)
          </label>
          <textarea
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            className="w-full px-4 py-2 border border-gray-300 rounded-lg focus:ring-2 focus:ring-primary-500 h-20"
            placeholder="Add any notes about this video..."
          />
        </div>

        <div className="bg-gray-50 rounded-lg p-8 text-center">
          {processing ? (
            <div className="py-8">
              <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600 mx-auto mb-4"></div>
              <p className="text-gray-600">Processing video...</p>
            </div>
          ) : (
            <>
              <p className="text-gray-600 mb-4">
                Record a video message to send to your client
              </p>
              <button
                id="loom-record-btn"
                className="bg-red-600 text-white px-8 py-3 rounded-lg hover:bg-red-700 transition font-bold"
              >
                🔴 Start Recording
              </button>
              {!isLoomReady && (
                <p className="text-sm text-gray-500 mt-4">
                  Initializing recorder...
                </p>
              )}
            </>
          )}
        </div>

        <div className="bg-blue-50 border border-blue-200 rounded-lg p-4">
          <p className="text-sm text-blue-800">
            💡 <strong>Tip:</strong> Loom allows you to record your screen, camera, or both.
            Great for demonstrating exercise form, reviewing programs, or giving personalized feedback!
          </p>
        </div>
      </div>
    </div>
  )
}
