import { describe, it, expect, vi, beforeEach, afterEach, type Mock } from "vitest";
import { processFile, startWatch } from "../src/watch.js";

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const mockGenerateContent = vi.hoisted(() => vi.fn());

vi.mock("@google/generative-ai", () => ({
  GoogleGenerativeAI: vi.fn(() => ({
    getGenerativeModel: vi.fn(() => ({ generateContent: mockGenerateContent })),
  })),
}));

vi.mock("fs", async (importOriginal) => {
  const actual = await importOriginal<typeof import("fs")>();
  return { ...actual, watch: vi.fn(), existsSync: vi.fn() };
});

vi.mock("../src/image.js", async (importOriginal) => {
  const actual = await importOriginal<typeof import("../src/image.js")>();
  return {
    ...actual,
    loadImage: vi.fn(() => ({ base64: "aGVsbG8=", mediaType: "image/png" })),
  };
});

vi.mock("../src/output.js", () => ({
  writeComponent: vi.fn(() => ({ tsx: "/out/Navbar.tsx" })),
  openInEditor: vi.fn(),
}));

// ---------------------------------------------------------------------------
// Imports that depend on mocks (after vi.mock hoisting)
// ---------------------------------------------------------------------------

import { watch, existsSync } from "fs";
import { writeComponent, openInEditor } from "../src/output.js";

const mockWatch = watch as Mock;
const mockExistsSync = existsSync as Mock;
const mockWriteComponent = writeComponent as Mock;
const mockOpenInEditor = openInEditor as Mock;

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function mockApiResponse(text: string) {
  mockGenerateContent.mockResolvedValue({ response: { text: () => text } });
}

const FAKE_IMAGE_PATH = "/screenshots/navbar.png";
const FAKE_TSX = `const Navbar = () => <nav>nav</nav>;\nexport default Navbar;`;
const FAKE_ANALYSIS = JSON.stringify({ layout: "horizontal bar" });
const FAKE_INTERACTIONS = JSON.stringify({ interactions: [{ element: "Menu button", trigger: "click", behavior: "toggles nav", stateNeeded: "isOpen: boolean" }] });

const BASE_OPTIONS = {
  watchDir: "/screenshots",
  outputPath: "/out",
  model: "gemini-2.5-flash",
  noOpen: true,
  animate: false,
};

beforeEach(() => {
  vi.clearAllMocks();
  mockExistsSync.mockReturnValue(true);
});

// ---------------------------------------------------------------------------
// processFile
// ---------------------------------------------------------------------------

describe("processFile", () => {
  beforeEach(() => {
    // Three sequential API calls: visual analysis, interaction analysis, code generation
    mockGenerateContent
      .mockResolvedValueOnce({ response: { text: () => FAKE_ANALYSIS } })
      .mockResolvedValueOnce({ response: { text: () => FAKE_INTERACTIONS } })
      .mockResolvedValueOnce({ response: { text: () => FAKE_TSX } });
  });

  it("calls the API three times (visual analysis + interaction analysis + generation)", async () => {
    await processFile(FAKE_IMAGE_PATH, BASE_OPTIONS);
    expect(mockGenerateContent).toHaveBeenCalledTimes(3);
  });

  it("calls the API four times when animate is true", async () => {
    mockGenerateContent.mockResolvedValueOnce({ response: { text: () => FAKE_ANALYSIS } })
      .mockResolvedValueOnce({ response: { text: () => FAKE_INTERACTIONS } })
      .mockResolvedValueOnce({ response: { text: () => FAKE_TSX } })
      .mockResolvedValueOnce({ response: { text: () => `import { motion } from 'framer-motion';\n${FAKE_TSX}` } });
    await processFile(FAKE_IMAGE_PATH, { ...BASE_OPTIONS, animate: true });
    expect(mockGenerateContent).toHaveBeenCalledTimes(4);
  });

  it("writes the component to disk", async () => {
    await processFile(FAKE_IMAGE_PATH, BASE_OPTIONS);
    expect(mockWriteComponent).toHaveBeenCalledWith(
      expect.objectContaining({ componentName: "Navbar", outputOverride: "/out" })
    );
  });

  it("does not open the editor when noOpen is true", async () => {
    await processFile(FAKE_IMAGE_PATH, { ...BASE_OPTIONS, noOpen: true });
    expect(mockOpenInEditor).not.toHaveBeenCalled();
  });

  it("opens the editor when noOpen is false", async () => {
    await processFile(FAKE_IMAGE_PATH, { ...BASE_OPTIONS, noOpen: false });
    expect(mockOpenInEditor).toHaveBeenCalledWith("/out/Navbar.tsx");
  });

  it("derives the component name from the file path", async () => {
    await processFile("/screenshots/hero-banner.png", BASE_OPTIONS);
    expect(mockWriteComponent).toHaveBeenCalledWith(
      expect.objectContaining({ componentName: "HeroBanner" })
    );
  });

  it("passes the output override to writeComponent", async () => {
    await processFile(FAKE_IMAGE_PATH, { ...BASE_OPTIONS, outputPath: "./src/components" });
    expect(mockWriteComponent).toHaveBeenCalledWith(
      expect.objectContaining({ outputOverride: "./src/components" })
    );
  });

  it("propagates API errors", async () => {
    // Reset clears the two resolved values from beforeEach so the rejection fires first
    mockGenerateContent.mockReset();
    mockGenerateContent.mockRejectedValue(new Error("API down"));
    await expect(processFile(FAKE_IMAGE_PATH, BASE_OPTIONS)).rejects.toThrow("API down");
  });
});

// ---------------------------------------------------------------------------
// startWatch
// ---------------------------------------------------------------------------

describe("startWatch", () => {
  it("throws when the watch directory does not exist", async () => {
    mockExistsSync.mockReturnValue(false);
    await expect(startWatch(BASE_OPTIONS)).rejects.toThrow("Watch directory not found");
  });

  it("calls fs.watch on the resolved directory", async () => {
    let capturedCallback: ((...args: unknown[]) => void) | undefined;
    mockWatch.mockImplementation((_dir: string, cb: (...args: unknown[]) => void) => {
      capturedCallback = cb;
      return { on: vi.fn(), close: vi.fn() };
    });

    // Start watching (promise never resolves — race with a short timeout to test setup)
    const watchPromise = startWatch(BASE_OPTIONS);
    await new Promise((r) => setTimeout(r, 0)); // flush microtasks

    expect(mockWatch).toHaveBeenCalledWith(
      expect.stringContaining("screenshots"),
      expect.any(Function)
    );
    expect(capturedCallback).toBeDefined();

    // Clean up — reject the promise so the test exits
    watchPromise.catch(() => {});
  });

  it("ignores non-image files added to the directory", async () => {
    let capturedCallback: ((event: string, filename: string) => void) | undefined;
    mockWatch.mockImplementation((_dir: string, cb: (event: string, filename: string) => void) => {
      capturedCallback = cb;
      return { on: vi.fn(), close: vi.fn() };
    });

    const watchPromise = startWatch(BASE_OPTIONS);
    await new Promise((r) => setTimeout(r, 0));

    capturedCallback!("rename", "notes.txt");
    await new Promise((r) => setTimeout(r, 400)); // past the 300ms delay

    expect(mockWriteComponent).not.toHaveBeenCalled();

    watchPromise.catch(() => {});
  });

  it("ignores deletion events (file no longer exists)", async () => {
    let capturedCallback: ((event: string, filename: string) => void) | undefined;
    mockWatch.mockImplementation((_dir: string, cb: (event: string, filename: string) => void) => {
      capturedCallback = cb;
      return { on: vi.fn(), close: vi.fn() };
    });

    // First call (existsSync for watchDir) returns true, subsequent calls return false
    mockExistsSync.mockReturnValueOnce(true).mockReturnValue(false);

    const watchPromise = startWatch(BASE_OPTIONS);
    await new Promise((r) => setTimeout(r, 0));

    capturedCallback!("rename", "navbar.png");
    await new Promise((r) => setTimeout(r, 400));

    expect(mockWriteComponent).not.toHaveBeenCalled();

    watchPromise.catch(() => {});
  });
});
