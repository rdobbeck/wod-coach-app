'use client'

import { useState, useEffect } from "react"
import { oembed } from "@loomhq/loom-embed"

interface LoomVideoPlayerProps {
  videoMessage: {
    id: string
    loomShareUrl: string
    loomEmbedUrl: string
    title: string | null
    description: string | null
    createdAt: Date
    isRead: boolean
    sender: {
      name: string | null
      email: string | null
    }
  }
  onMarkAsRead?: (id: string) => void
}

export default function LoomVideoPlayer({ videoMessage, onMarkAsRead }: LoomVideoPlayerProps) {
  const [embedHtml, setEmbedHtml] = useState<string>("")
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    const fetchEmbed = async () => {
      try {
        const { html } = await oembed(videoMessage.loomShareUrl, { width: 640 })
        setEmbedHtml(html)

        // Mark as read when video is loaded
        if (!videoMessage.isRead && onMarkAsRead) {
          onMarkAsRead(videoMessage.id)
        }
      } catch (error) {
        console.error("Failed to load Loom embed:", error)
      } finally {
        setLoading(false)
      }
    }

    fetchEmbed()
  }, [videoMessage.loomShareUrl, videoMessage.id, videoMessage.isRead, onMarkAsRead])

  return (
    <div className="bg-white rounded-lg shadow-lg p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-xl font-bold text-gray-900">
            {videoMessage.title || "Video Message"}
          </h3>
          <p className="text-sm text-gray-500">
            From {videoMessage.sender.name || videoMessage.sender.email} •{" "}
            {new Date(videoMessage.createdAt).toLocaleDateString()}
          </p>
        </div>
        {!videoMessage.isRead && (
          <span className="bg-blue-100 text-blue-800 text-xs font-semibold px-2.5 py-0.5 rounded">
            New
          </span>
        )}
      </div>

      {videoMessage.description && (
        <p className="text-gray-700 mb-4">{videoMessage.description}</p>
      )}

      <div className="rounded-lg overflow-hidden bg-gray-100">
        {loading ? (
          <div className="aspect-video flex items-center justify-center">
            <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-primary-600"></div>
          </div>
        ) : (
          <div
            dangerouslySetInnerHTML={{ __html: embedHtml }}
            className="loom-embed"
          />
        )}
      </div>

      <div className="mt-4 flex gap-2">
        <a
          href={videoMessage.loomShareUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="text-primary-600 hover:text-primary-700 text-sm font-medium"
        >
          Open in Loom →
        </a>
      </div>
    </div>
  )
}
