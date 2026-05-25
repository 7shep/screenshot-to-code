import { describe, it, expect, vi, beforeEach } from "vitest";
import { stripFences, generateComponent, analyzeScreenshot } from "../src/generate.js";

// ---------------------------------------------------------------------------
// Mock the Gemini SDK
// ---------------------------------------------------------------------------

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: vi.fn(() => ({
      generateContent: mockGenerateContent,
    })),
  })),
}));

// Clear call history before every test so counts are per-test
beforeEach(() => vi.clearAllMocks());

function mockResponse(text: string) {
  return { response: { text: () => text } };
}

const FAKE_IMAGE = { base64: "aGVsbG8=", mediaType: "image/png" as const };
const FAKE_ANALYSIS = JSON.stringify({ layout: "single column", colorPalette: {} });
const FAKE_TSX = `import React from 'react';\nconst Foo = () => <div>foo</div>;\nexport default Foo;`;

// ---------------------------------------------------------------------------
// stripFences
// ---------------------------------------------------------------------------

describe("stripFences", () => {
  it("returns code unchanged when no fences are present", () => {
    expect(stripFences(FAKE_TSX)).toBe(FAKE_TSX);
  });

  it("strips ```tsx fences", () => {
    expect(stripFences("```tsx\n" + FAKE_TSX + "\n```")).toBe(FAKE_TSX);
  });

  it("strips ```ts fences", () => {
    expect(stripFences("```ts\n" + FAKE_TSX + "\n```")).toBe(FAKE_TSX);
  });

  it("strips plain ``` fences", () => {
    expect(stripFences("```\n" + FAKE_TSX + "\n```")).toBe(FAKE_TSX);
  });

  it("strips a leading fence with no trailing fence", () => {
    expect(stripFences("```tsx\n" + FAKE_TSX)).toBe(FAKE_TSX);
  });

  it("preserves the code content exactly", () => {
    const withFences = "```tsx\nconst x = 1;\nconst y = 2;\n```";
    expect(stripFences(withFences)).toBe("const x = 1;\nconst y = 2;");
  });
});

// ---------------------------------------------------------------------------
// analyzeScreenshot
// ---------------------------------------------------------------------------

describe("analyzeScreenshot", () => {
  beforeEach(() => mockGenerateContent.mockResolvedValue(mockResponse(FAKE_ANALYSIS)));

  it("returns the model's text response", async () => {
    const result = await analyzeScreenshot(FAKE_IMAGE);
    expect(result).toBe(FAKE_ANALYSIS);
  });

  it("calls generateContent exactly once", async () => {
    await analyzeScreenshot(FAKE_IMAGE);
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("passes the image as inlineData", async () => {
    await analyzeScreenshot(FAKE_IMAGE);
    const payload = mockGenerateContent.mock.lastCall?.[0];
    const parts = payload.contents[0].parts;
    expect(parts[0].inlineData.data).toBe(FAKE_IMAGE.base64);
    expect(parts[0].inlineData.mimeType).toBe("image/png");
  });

  it("throws when the API returns empty text", async () => {
    mockGenerateContent.mockResolvedValue(mockResponse(""));
    await expect(analyzeScreenshot(FAKE_IMAGE)).rejects.toThrow("no analysis");
  });

  it("strips fences from the analysis response", async () => {
    mockGenerateContent.mockResolvedValue(mockResponse("```json\n" + FAKE_ANALYSIS + "\n```"));
    const result = await analyzeScreenshot(FAKE_IMAGE);
    expect(result).toBe(FAKE_ANALYSIS);
  });
});

// ---------------------------------------------------------------------------
// generateComponent
// ---------------------------------------------------------------------------

describe("generateComponent", () => {
  beforeEach(() => mockGenerateContent.mockResolvedValue(mockResponse(FAKE_TSX)));

  it("returns the generated TSX code", async () => {
    const result = await generateComponent({ ...FAKE_IMAGE, componentName: "Foo" });
    expect(result).toBe(FAKE_TSX);
  });

  it("calls generateContent exactly once", async () => {
    await generateComponent({ ...FAKE_IMAGE, componentName: "Foo" });
    expect(mockGenerateContent).toHaveBeenCalledTimes(1);
  });

  it("includes the component name in the prompt text", async () => {
    await generateComponent({ ...FAKE_IMAGE, componentName: "MyNavbar" });
    const payload = mockGenerateContent.mock.lastCall?.[0];
    const parts = payload.contents[0].parts;
    const textPart = parts.find((p: { text?: string }) => p.text?.includes("MyNavbar"));
    expect(textPart).toBeDefined();
  });

  it("includes the analysis block when provided", async () => {
    await generateComponent({ ...FAKE_IMAGE, componentName: "Foo", analysis: FAKE_ANALYSIS });
    const payload = mockGenerateContent.mock.lastCall?.[0];
    const parts = payload.contents[0].parts;
    const analysisPart = parts.find((p: { text?: string }) => p.text?.includes("Design analysis:"));
    expect(analysisPart).toBeDefined();
    expect(analysisPart.text).toContain(FAKE_ANALYSIS);
  });

  it("omits the analysis block when not provided", async () => {
    await generateComponent({ ...FAKE_IMAGE, componentName: "Foo" });
    const payload = mockGenerateContent.mock.lastCall?.[0];
    const parts = payload.contents[0].parts;
    const analysisPart = parts.find((p: { text?: string }) => p.text?.includes("Design analysis:"));
    expect(analysisPart).toBeUndefined();
  });

  it("strips fences from the generated code", async () => {
    mockGenerateContent.mockResolvedValue(mockResponse("```tsx\n" + FAKE_TSX + "\n```"));
    const result = await generateComponent({ ...FAKE_IMAGE, componentName: "Foo" });
    expect(result).toBe(FAKE_TSX);
  });

  it("throws when the API returns empty text", async () => {
    mockGenerateContent.mockResolvedValue(mockResponse(""));
    await expect(
      generateComponent({ ...FAKE_IMAGE, componentName: "Foo" })
    ).rejects.toThrow("no text content");
  });
});
