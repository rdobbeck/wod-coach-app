import test from "node:test"
import assert from "node:assert/strict"
import { baseName, labelFrom, sideOf, slugify } from "../../lib/learn-slug"

test("side suffix is stripped from the id and reported separately", () => {
  assert.equal(slugify("Rectus femoris muscle.r"), "rectus-femoris-muscle")
  assert.equal(slugify("Rectus femoris muscle.l"), "rectus-femoris-muscle")
  assert.equal(sideOf("Rectus femoris muscle.r"), "r")
  assert.equal(sideOf("Rectus femoris muscle.l"), "l")
  assert.equal(sideOf("Diaphragm"), "m")
  assert.equal(baseName("Foot bones.r"), "Foot bones")
})

test("awkward source names give safe ids", () => {
  assert.equal(slugify("Inferior vein of left ventricle (//Posterior '')"), "inferior-vein-of-left-ventricle-posterior")
  assert.equal(slugify("(Adductor minimus)"), "adductor-minimus")
  assert.equal(slugify("Vagus nerve (X)"), "vagus-nerve-x")
  assert.equal(slugify("Apicoposterior segmental bronchus of left lung (BI+BII)"), "apicoposterior-segmental-bronchus-of-left-lung-bi-bii")
})

test("labels drop the word muscle and wrapping parentheses", () => {
  assert.equal(labelFrom("Rectus femoris muscle"), "Rectus femoris")
  assert.equal(labelFrom("External intercostal muscles"), "External intercostal")
  assert.equal(labelFrom("(Adductor minimus)"), "Adductor minimus")
  assert.equal(labelFrom("Femur"), "Femur")
  assert.equal(labelFrom("long head of biceps femoris"), "Long head of biceps femoris")
})

test("labels drop Z-Anatomy's editorial asterisks and doubled spaces", () => {
  assert.equal(labelFrom("Paracentral gyrus and sulcus*"), "Paracentral gyrus and sulcus")
  assert.equal(labelFrom("Lateral occipital gyrus (Middle occipital gyrus*)"), "Lateral occipital gyrus (Middle occipital gyrus)")
  assert.equal(labelFrom("Orbital part of  inferior frontal gyrus"), "Orbital part of inferior frontal gyrus")
})
