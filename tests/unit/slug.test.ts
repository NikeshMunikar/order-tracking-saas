import assert from "node:assert/strict";
import { test } from "node:test";

import { randomSlugSuffix, slugify } from "../../src/lib/business/slug.ts";

test("slugify lowercases and hyphenates a normal business name", () => {
  assert.equal(slugify("Kathmandu Bakery"), "kathmandu-bakery");
});

test("slugify converts non [a-z0-9] characters to hyphens", () => {
  assert.equal(slugify("Ram & Sita's Café!"), "ram-sita-s-caf");
});

test("slugify trims leading and trailing hyphens", () => {
  assert.equal(slugify("!!!Best Bakery!!!"), "best-bakery");
});

test("slugify collapses repeated hyphens", () => {
  assert.equal(slugify("A    B---C"), "a-b-c");
});

test("slugify caps length at 60 characters and re-trims a dangling trailing hyphen", () => {
  const longName = "A".repeat(70);
  const slug = slugify(longName);
  assert.equal(slug.length, 60);
  assert.equal(slug, "a".repeat(60));

  // A name whose 60th character lands exactly on a hyphen boundary must
  // not leave a dangling trailing hyphen after truncation.
  const nameWithHyphenAtBoundary = `${"a".repeat(59)}-bbbb`;
  const truncated = slugify(nameWithHyphenAtBoundary);
  assert.ok(!truncated.endsWith("-"), `expected no trailing hyphen, got "${truncated}"`);
});

test("slugify falls back to 'business' when nothing usable remains", () => {
  assert.equal(slugify("!!!"), "business");
  assert.equal(slugify(""), "business");
  assert.equal(slugify("   "), "business");
});

test("randomSlugSuffix produces a lowercase alphanumeric string of the requested length", () => {
  const suffix = randomSlugSuffix(6);
  assert.equal(suffix.length, 6);
  assert.match(suffix, /^[a-z0-9]{6}$/);
});

test("randomSlugSuffix is not constant across calls", () => {
  const suffixes = new Set(Array.from({ length: 20 }, () => randomSlugSuffix(8)));
  // 20 draws of an 8-char alphanumeric suffix colliding would indicate a
  // broken RNG, not bad luck.
  assert.ok(suffixes.size > 1, "expected randomSlugSuffix to vary across calls");
});
