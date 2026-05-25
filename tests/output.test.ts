import { describe, it, expect, beforeEach, afterEach } from "vitest";
import { mkdirSync, rmSync, existsSync, readFileSync } from "fs";
import { join, resolve } from "path";
import { tmpdir } from "os";
import { writeComponent } from "../src/output.js";

const TMP = join(tmpdir(), "s2c-output-tests");
const CODE = "const Foo = () => <div>foo</div>;\nexport default Foo;";

beforeEach(() => mkdirSync(TMP, { recursive: true }));
afterEach(() => rmSync(TMP, { recursive: true, force: true }));

describe("writeComponent", () => {
  it("writes to <imageDir>/<ComponentName>.tsx by default", () => {
    const { tsx } = writeComponent({ code: CODE, imageDir: TMP, componentName: "Navbar" });
    expect(tsx).toBe(resolve(join(TMP, "Navbar.tsx")));
    expect(existsSync(tsx)).toBe(true);
    expect(readFileSync(tsx, "utf-8")).toBe(CODE);
  });

  it("returns an absolute path", () => {
    const { tsx } = writeComponent({ code: CODE, imageDir: TMP, componentName: "Foo" });
    expect(tsx).toBe(resolve(tsx));
  });

  it("uses --output directory override and appends ComponentName.tsx", () => {
    const outDir = join(TMP, "components");
    mkdirSync(outDir);
    const { tsx } = writeComponent({ code: CODE, imageDir: TMP, componentName: "Hero", outputOverride: outDir });
    expect(tsx).toBe(resolve(join(outDir, "Hero.tsx")));
    expect(existsSync(tsx)).toBe(true);
  });

  it("uses --output file path override exactly when it has a .tsx extension", () => {
    const outFile = join(TMP, "custom", "MyComp.tsx");
    mkdirSync(join(TMP, "custom"));
    const { tsx } = writeComponent({ code: CODE, imageDir: TMP, componentName: "Hero", outputOverride: outFile });
    expect(tsx).toBe(resolve(outFile));
    expect(existsSync(tsx)).toBe(true);
  });

  it("writes the code content verbatim", () => {
    const { tsx } = writeComponent({ code: CODE, imageDir: TMP, componentName: "Foo" });
    expect(readFileSync(tsx, "utf-8")).toBe(CODE);
  });

  it("overwrites an existing file", () => {
    const { tsx } = writeComponent({ code: "old", imageDir: TMP, componentName: "Foo" });
    writeComponent({ code: CODE, imageDir: TMP, componentName: "Foo" });
    expect(readFileSync(tsx, "utf-8")).toBe(CODE);
  });
});
