import { NextResponse } from "next/server"
import { prisma } from "@/lib/prisma"
import bcrypt from "bcryptjs"
import { checkSlug } from "@/lib/coach-slug-db"
import { suggestSlug } from "@/lib/coach-link"

export async function POST(req: Request) {
  try {
    const body = await req.json()
    const { name, email, password, role, slug: requestedSlug } = body

    if (!name || !email || !password) {
      return NextResponse.json(
        { error: "Missing required fields" },
        { status: 400 }
      )
    }

    if (password.length < 6) {
      return NextResponse.json(
        { error: "Password must be at least 6 characters" },
        { status: 400 }
      )
    }

    const existingUser = await prisma.user.findUnique({
      where: {
        email: email.toLowerCase(),
      },
    })

    if (existingUser) {
      return NextResponse.json(
        { error: "Email already registered" },
        { status: 400 }
      )
    }

    // Coaches get <slug>.wod.coach. Use what they picked; otherwise their first name, numbered if taken.
    let slug: string | null = null
    if (role === "COACH") {
      if (requestedSlug) {
        const r = await checkSlug(String(requestedSlug))
        if (!r.ok) return NextResponse.json({ error: `Your link: ${r.error}` }, { status: 400 })
        slug = r.slug
      } else {
        const base = suggestSlug(name).padEnd(3, "0")
        for (let i = 0; i < 20 && !slug; i++) {
          const r = await checkSlug(i ? `${base}${i + 1}` : base)
          if (r.ok) slug = r.slug
        }
      }
    }

    const hashedPassword = await bcrypt.hash(password, 12)

    const user = await prisma.user.create({
      data: {
        name,
        email: email.toLowerCase(),
        hashedPassword,
        role: role || "CLIENT",
      },
    })

    if (user.role === "COACH") {
      await prisma.coachProfile.create({
        data: {
          userId: user.id,
          slug,
        },
      })
    } else {
      await prisma.clientProfile.create({
        data: {
          userId: user.id,
        },
      })
    }

    return NextResponse.json(
      {
        user: {
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
        },
      },
      { status: 201 }
    )
  } catch (error) {
    console.error("Signup error:", error)
    return NextResponse.json(
      { error: "Something went wrong" },
      { status: 500 }
    )
  }
}
