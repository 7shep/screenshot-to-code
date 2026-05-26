import { Project, Node } from "ts-morph";
import type { SourceFile, InterfaceDeclaration, TypeAliasDeclaration, ParameterDeclaration } from "ts-morph";

export interface PropInfo {
  name: string;
  type: string;
  optional: boolean;
}

export interface ComponentInfo {
  name: string;
  filePath: string;
  props: PropInfo[];
  jsDoc?: string;
}

export async function scanComponents(dir: string): Promise<ComponentInfo[]> {
  const project = new Project({
    skipAddingFilesFromTsConfig: true,
    skipFileDependencyResolution: true,
  });

  project.addSourceFilesAtPaths(`${dir}/**/*.tsx`);

  const components: ComponentInfo[] = [];
  const seen = new Set<string>();

  for (const sourceFile of project.getSourceFiles()) {
    // Named function declarations: export function Button(...)
    for (const fn of sourceFile.getFunctions()) {
      if (!fn.isExported()) continue;
      const name = fn.getName();
      if (!name || !/^[A-Z]/.test(name) || seen.has(name)) continue;
      seen.add(name);
      const props = extractProps(sourceFile, name, fn.getParameters()[0]);
      const jsDoc = getJsDocComment(fn);
      components.push({ name, filePath: sourceFile.getFilePath(), props, jsDoc });
    }

    // Arrow function exports: export const Button = ({ variant }: ButtonProps) => ...
    for (const stmt of sourceFile.getVariableStatements()) {
      if (!stmt.isExported()) continue;
      for (const decl of stmt.getDeclarations()) {
        const name = decl.getName();
        if (!/^[A-Z]/.test(name) || seen.has(name)) continue;
        const init = decl.getInitializer();
        if (!init || !Node.isArrowFunction(init)) continue;
        seen.add(name);
        const props = extractProps(sourceFile, name, init.getParameters()[0]);
        const jsDoc = getJsDocComment(stmt);
        components.push({ name, filePath: sourceFile.getFilePath(), props, jsDoc });
      }
    }

    // Default exports: export default function Button(...)
    const defaultExportSymbol = sourceFile.getDefaultExportSymbol();
    if (defaultExportSymbol) {
      for (const decl of defaultExportSymbol.getDeclarations()) {
        if (Node.isFunctionDeclaration(decl)) {
          const name = decl.getName();
          if (!name || !/^[A-Z]/.test(name) || seen.has(name)) continue;
          seen.add(name);
          const props = extractProps(sourceFile, name, decl.getParameters()[0]);
          const jsDoc = getJsDocComment(decl);
          components.push({ name, filePath: sourceFile.getFilePath(), props, jsDoc });
        }
      }
    }
  }

  return components;
}

function extractProps(
  sourceFile: SourceFile,
  componentName: string,
  firstParam: ParameterDeclaration | undefined
): PropInfo[] {
  if (!firstParam) return [];

  // Try <ComponentName>Props interface/type by convention
  const conventionalName = `${componentName}Props`;
  const iface = sourceFile.getInterface(conventionalName);
  if (iface) return extractFromInterface(iface);

  const typeAlias = sourceFile.getTypeAlias(conventionalName);
  if (typeAlias) return extractFromTypeAlias(typeAlias);

  // Inline type annotation: ({ label }: { label: string; disabled?: boolean })
  const typeNode = firstParam.getTypeNode();
  if (typeNode) return extractFromInlineType(typeNode.getText());

  return [];
}

function extractFromInterface(iface: InterfaceDeclaration): PropInfo[] {
  return iface.getProperties().map((prop) => ({
    name: prop.getName(),
    type: prop.getType().getText(),
    optional: prop.hasQuestionToken(),
  }));
}

function extractFromTypeAlias(alias: TypeAliasDeclaration): PropInfo[] {
  const typeNode = alias.getTypeNode();
  if (!typeNode || !Node.isTypeLiteral(typeNode)) return [];

  const props: PropInfo[] = [];
  for (const member of typeNode.getMembers()) {
    if (Node.isPropertySignature(member)) {
      props.push({
        name: member.getName(),
        type: member.getType().getText(),
        optional: member.hasQuestionToken(),
      });
    }
  }
  return props;
}

function extractFromInlineType(typeText: string): PropInfo[] {
  const props: PropInfo[] = [];
  const cleaned = typeText.replace(/^\{|\}$/g, "").trim();
  for (const part of cleaned.split(";")) {
    const trimmed = part.trim();
    if (!trimmed) continue;
    const match = trimmed.match(/^(\w+)(\?)?:\s*(.+)$/);
    if (match) {
      props.push({ name: match[1], type: match[3].trim(), optional: !!match[2] });
    }
  }
  return props;
}

function getJsDocComment(node: { getJsDocs?: () => import("ts-morph").JSDoc[] }): string | undefined {
  if (!node.getJsDocs) return undefined;
  const docs = node.getJsDocs();
  if (!docs.length) return undefined;
  // getComment() returns string | JSDocComment[] in ts-morph — getText() is always a string
  const text = docs[0].getText().replace(/^\/\*\*|\*\/$/g, "").replace(/^\s*\*\s?/gm, "").trim();
  // Strip @tag lines, keep the description
  const description = text.split("\n").filter(l => !l.trimStart().startsWith("@")).join(" ").trim();
  return description || undefined;
}
