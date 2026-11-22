import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";
import { ESLint } from "eslint";
import ts from "typescript";
import { expect, it } from "vitest";

it("enforces import boundaries for shared rules, server use cases and presentation", async () => {
  const eslint = new ESLint();
  const probes = [
    [
      "src/domain/probe.ts",
      'import "react"; import "../infrastructure/room-server";',
    ],
    [
      "src/application/probe.ts",
      'import "../infrastructure/room-memory"; import "../presentation/App";',
    ],
    [
      "src/presentation/probe.ts",
      'import "../infrastructure/online-client"; import "../domain/engine";',
    ],
  ];
  for (const [filePath, code] of probes) {
    const [result] = await eslint.lintText(code, { filePath });
    expect(
      result?.messages.filter(
        ({ ruleId }) => ruleId === "no-restricted-imports",
      ),
    ).toHaveLength(2);
  }
  const [clock] = await eslint.lintText("Date.now();", {
    filePath: "src/domain/probe.ts",
  });
  expect(
    clock.messages.some(({ ruleId }) => ruleId === "no-restricted-syntax"),
  ).toBe(true);
});

it("keeps source imports acyclic", () => {
  const files = readdirSync("src", { recursive: true, encoding: "utf8" })
    .filter((entry) => /\.tsx?$/.test(entry))
    .map((entry) => resolve("src", entry));
  const graph = new Map(
    files.map((file) => [
      file,
      ts
        .preProcessFile(readFileSync(file, "utf8"), true)
        .importedFiles.flatMap(({ fileName }) => {
          if (!fileName.startsWith(".")) return [];
          const target = ts.resolveModuleName(
            fileName,
            file,
            { moduleResolution: ts.ModuleResolutionKind.Bundler },
            ts.sys,
          ).resolvedModule?.resolvedFileName;
          return target && files.includes(resolve(target))
            ? [resolve(target)]
            : [];
        }),
    ]),
  );
  const visited = new Set<string>();
  const active = new Set<string>();
  function visit(file: string) {
    if (active.has(file)) throw new Error("Circular import through " + file);
    if (visited.has(file)) return;
    active.add(file);
    for (const dependency of graph.get(file) ?? []) visit(dependency);
    active.delete(file);
    visited.add(file);
  }
  files.forEach(visit);
});
