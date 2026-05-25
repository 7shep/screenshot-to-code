import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { writeFileSync, unlinkSync } from "fs";
import { join } from "path";
import { tmpdir } from "os";
import { deriveComponentName, loadImage } from "../src/image.js";

// ---------------------------------------------------------------------------
// deriveComponentName
// ---------------------------------------------------------------------------

describe("deriveComponentName", () => {
  it("capitalises a simple word", () => {
    expect(deriveComponentName("navbar.png")).toBe("Navbar");
  });

  it("PascalCases hyphen-separated words", () => {
    expect(deriveComponentName("my-navbar.png")).toBe("MyNavbar");
  });

  it("PascalCases underscore-separated words", () => {
    expect(deriveComponentName("hero_section.jpg")).toBe("HeroSection");
  });

  it("PascalCases space-separated words", () => {
    expect(deriveComponentName("sign up form.png")).toBe("SignUpForm");
  });

  it("handles mixed separators", () => {
    expect(deriveComponentName("user--profile_card.png")).toBe("UserProfileCard");
  });

  it("strips leading digits and capitalises the remainder", () => {
    expect(deriveComponentName("123navbar.png")).toBe("Navbar");
  });

  it("strips leading digits with hyphenated words", () => {
    expect(deriveComponentName("01-hero-banner.png")).toBe("HeroBanner");
  });

  it("falls back to Component when name is all symbols", () => {
    expect(deriveComponentName("---.png")).toBe("Component");
  });

  it("falls back to Component when filename is only digits", () => {
    expect(deriveComponentName("123.png")).toBe("Component");
  });

  it("works with a full absolute path", () => {
    expect(deriveComponentName("/screenshots/hero-banner.png")).toBe("HeroBanner");
  });

  it("works with a relative path", () => {
    expect(deriveComponentName("./components/side-bar.webp")).toBe("SideBar");
  });
});

// ---------------------------------------------------------------------------
// loadImage
// ---------------------------------------------------------------------------

// Minimal 8-byte PNG signature — enough for the file to be read and encoded
const PNG_BYTES = Buffer.from("89504e470d0a1a0a", "hex");
const TMP = tmpdir();

function tmpFile(ext: string) {
  return join(TMP, `s2c-test-fixture${ext}`);
}

describe("loadImage", () => {
  const pngPath = tmpFile(".png");

  beforeAll(() => writeFileSync(pngPath, PNG_BYTES));
  afterAll(() => unlinkSync(pngPath));

  it("returns correct base64 and mediaType for .png", () => {
    const result = loadImage(pngPath);
    expect(result.mediaType).toBe("image/png");
    expect(result.base64).toBe(PNG_BYTES.toString("base64"));
  });

  it("maps .jpg to image/jpeg", () => {
    const p = tmpFile(".jpg");
    writeFileSync(p, PNG_BYTES);
    try {
      expect(loadImage(p).mediaType).toBe("image/jpeg");
    } finally {
      unlinkSync(p);
    }
  });

  it("maps .jpeg to image/jpeg", () => {
    const p = tmpFile(".jpeg");
    writeFileSync(p, PNG_BYTES);
    try {
      expect(loadImage(p).mediaType).toBe("image/jpeg");
    } finally {
      unlinkSync(p);
    }
  });

  it("maps .webp to image/webp", () => {
    const p = tmpFile(".webp");
    writeFileSync(p, PNG_BYTES);
    try {
      expect(loadImage(p).mediaType).toBe("image/webp");
    } finally {
      unlinkSync(p);
    }
  });

  it("throws on an unsupported extension", () => {
    expect(() => loadImage("/fake/image.gif")).toThrow("Unsupported image type");
  });

  it("throws when the file does not exist", () => {
    expect(() => loadImage("/definitely/does/not/exist.png")).toThrow();
  });
});
