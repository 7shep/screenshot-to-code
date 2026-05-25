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
    const path = writeComponent({ code: CODE, imageDir: TMP, componentName: "Navbar" });
    expect(path).toBe(resolve(join(TMP, "Navbar.tsx")));
    expect(existsSync(path)).toBe(true);
    expect(readFileSync(path, "utf-8")).toBe(CODE);
  });

  it("returns an absolute path", () => {
    const path = writeComponent({ code: CODE, imageDir: TMP, componentName: "Foo" });
    expect(path).toBe(resolve(path));
  });

  it("uses --output directory override and appends ComponentName.tsx", () => {
    const outDir = join(TMP, "components");
    mkdirSync(outDir);
    const path = writeComponent({ code: CODE, imageDir: TMP, componentName: "Hero", outputOverride: outDir });
    expect(path).toBe(resolve(join(outDir, "Hero.tsx")));
    expect(existsSync(path)).toBe(true);
  });

  it("uses --output file path override exactly when it has a .tsx extension", () => {
    const outFile = join(TMP, "custom", "MyComp.tsx");
    mkdirSync(join(TMP, "custom"));
    const path = writeComponent({ code: CODE, imageDir: TMP, componentName: "Hero", outputOverride: outFile });
    expect(path).toBe(resolve(outFile));
    expect(existsSync(path)).toBe(true);
  });

  it("writes the code content verbatim", () => {
    const path = writeComponent({ code: CODE, imageDir: TMP, componentName: "Foo" });
    expect(readFileSync(path, "utf-8")).toBe(CODE);
  });

  it("overwrites an existing file", () => {
    const path = writeComponent({ code: "old", imageDir: TMP, componentName: "Foo" });
    writeComponent({ code: CODE, imageDir: TMP, componentName: "Foo" });
    expect(readFileSync(path, "utf-8")).toBe(CODE);
  });
});
