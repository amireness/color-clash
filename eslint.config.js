import js from "@eslint/js";
import tseslint from "typescript-eslint";

const layers = {
  domain: ["domain"],
  application: ["application", "domain"],
  infrastructure: ["infrastructure", "application", "domain"],
  presentation: ["presentation", "application"],
  composition: ["composition", "application", "infrastructure"],
};

function boundaries(layer, allowed) {
  const forbidden = Object.keys(layers).filter(
    (candidate) => !allowed.includes(candidate),
  );
  const patterns = forbidden.map((name) => ({
    group: [`**/${name}/**`, `**/${name}`],
    message: `${layer} cannot depend on ${name}.`,
  }));
  if (layer === "domain" || layer === "application") {
    patterns.push({
      regex: "^(?!\\.)",
      message: "Core layers use internal modules only.",
    });
  }
  patterns.push({
    group: ["**/main", "**/main.tsx", "**/tests/**"],
    message: "Layers cannot import entry points or tests.",
  });
  return {
    files: [`src/${layer}/**/*.{ts,tsx}`],
    rules: { "no-restricted-imports": ["error", { patterns }] },
  };
}

export default tseslint.config(
  { ignores: ["dist", "dist-server", "coverage", "node_modules"] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  ...Object.entries(layers).map(([layer, allowed]) =>
    boundaries(layer, allowed),
  ),
  {
    files: ["src/{domain,application}/**/*.ts"],
    rules: {
      "no-restricted-globals": [
        "error",
        "window",
        "document",
        "localStorage",
        "sessionStorage",
        "fetch",
        "WebSocket",
        "indexedDB",
      ],
      "no-restricted-syntax": [
        "error",
        {
          selector:
            "CallExpression[callee.object.name='Math'][callee.property.name='random']",
          message: "Inject randomness at the boundary.",
        },
        {
          selector:
            "CallExpression[callee.object.name='Date'][callee.property.name='now']",
          message: "Inject the clock at the boundary.",
        },
      ],
    },
  },
);
