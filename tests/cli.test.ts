import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { parseArgs } from "../src/args.js";
import { DEFAULT_MODEL } from "../src/generate.js";

// Scoped to each test so Vitest's own process.exit calls aren't intercepted
let exitSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  exitSpy = vi.spyOn(process, "exit").mockImplementation((() => {
    throw new Error("process.exit called");
  }) as never);
  vi.spyOn(console, "error").mockImplementation(() => {});
  vi.spyOn(console, "log").mockImplementation(() => {});
});

afterEach(() => {
  vi.restoreAllMocks();
});

// Convenience: build a fake argv array the same way Node does
function argv(...args: string[]) {
  return ["node", "dist/index.js", ...args];
}

describe("parseArgs", () => {
  it("returns null when no arguments are given", () => {
    expect(parseArgs(argv())).toBeNull();
  });

  it("parses a bare image path", () => {
    const result = parseArgs(argv("./hero.png"));
    expect(result).toMatchObject({
      imagePath: "./hero.png",
      model: DEFAULT_MODEL,
      noOpen: false,
      animate: false,
      componentName: undefined,
      outputPath: undefined,
    });
  });

  it("parses --name", () => {
    expect(parseArgs(argv("img.png", "--name", "HeroSection"))?.componentName).toBe("HeroSection");
  });

  it("parses -n shorthand", () => {
    expect(parseArgs(argv("img.png", "-n", "Foo"))?.componentName).toBe("Foo");
  });

  it("parses --output", () => {
    expect(parseArgs(argv("img.png", "--output", "./out"))?.outputPath).toBe("./out");
  });

  it("parses -o shorthand", () => {
    expect(parseArgs(argv("img.png", "-o", "./out"))?.outputPath).toBe("./out");
  });

  it("parses --model", () => {
    expect(parseArgs(argv("img.png", "--model", "gemini-2.0-flash"))?.model).toBe("gemini-2.0-flash");
  });

  it("parses -m shorthand", () => {
    expect(parseArgs(argv("img.png", "-m", "gemini-2.5-pro"))?.model).toBe("gemini-2.5-pro");
  });

  it("parses --no-open", () => {
    expect(parseArgs(argv("img.png", "--no-open"))?.noOpen).toBe(true);
  });

  it("defaults noOpen to false when flag is absent", () => {
    expect(parseArgs(argv("img.png"))?.noOpen).toBe(false);
  });

  it("handles all flags together", () => {
    const result = parseArgs(argv(
      "hero.png",
      "--name", "Hero",
      "--output", "./src",
      "--model", "gemini-2.5-pro",
      "--no-open"
    ));
    expect(result).toMatchObject({
      imagePath: "hero.png",
      componentName: "Hero",
      outputPath: "./src",
      model: "gemini-2.5-pro",
      noOpen: true,
    });
  });

  it("parses --watch", () => {
    const result = parseArgs(argv("--watch", "./screenshots"));
    expect(result).toMatchObject({ watchDir: "./screenshots", imagePath: "" });
  });

  it("parses -w shorthand", () => {
    expect(parseArgs(argv("-w", "./shots"))?.watchDir).toBe("./shots");
  });

  it("parses --watch with --output", () => {
    const result = parseArgs(argv("--watch", "./screenshots", "--output", "./src"));
    expect(result).toMatchObject({ watchDir: "./screenshots", outputPath: "./src" });
  });

  it("returns non-null when only --watch is given (no image path)", () => {
    expect(parseArgs(argv("--watch", "./screenshots"))).not.toBeNull();
  });

  it("parses --animate", () => {
    expect(parseArgs(argv("img.png", "--animate"))?.animate).toBe(true);
  });

  it("parses -a shorthand", () => {
    expect(parseArgs(argv("img.png", "-a"))?.animate).toBe(true);
  });

  it("defaults animate to false when flag is absent", () => {
    expect(parseArgs(argv("img.png"))?.animate).toBe(false);
  });

  it("defaults watchDir to '.' when --watch has no argument", () => {
    expect(parseArgs(argv("--watch"))?.watchDir).toBe(".");
  });

  it("defaults watchDir to '.' when --watch is followed by another flag", () => {
    const result = parseArgs(argv("--watch", "--output", "./src"));
    expect(result).toMatchObject({ watchDir: ".", outputPath: "./src" });
  });

  it("calls process.exit on an unknown flag", () => {
    expect(() => parseArgs(argv("img.png", "--unknown"))).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(1);
  });

  it("calls process.exit for --help", () => {
    expect(() => parseArgs(argv("--help"))).toThrow("process.exit called");
    expect(exitSpy).toHaveBeenCalledWith(0);
  });
});
