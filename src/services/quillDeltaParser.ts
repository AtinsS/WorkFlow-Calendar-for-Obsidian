/**
 * Converts SingularityApp Quill delta (rich text) to Markdown.
 * SingularityApp stores task descriptions as Quill delta JSON:
 * [{"insert":"text","attributes":{"bold":true}},{"insert":"\n"}]
 */

interface QuillOp {
  insert: string | Record<string, unknown>;
  attributes?: Record<string, unknown>;
}

/**
 * Parse Quill delta JSON to Markdown string.
 * Returns the original string if it's not valid JSON or not a delta.
 */
export function quillDeltaToMarkdown(raw: string | undefined): string {
  if (!raw) return "";

  // If it doesn't look like JSON array, return as-is (plain text)
  const trimmed = raw.trim();
  if (!trimmed.startsWith("[")) return raw;

  let ops: QuillOp[];
  try {
    ops = JSON.parse(trimmed);
  } catch {
    return raw; // not valid JSON — treat as plain text
  }

  if (!Array.isArray(ops) || ops.length === 0) return raw;

  // Check if it looks like a delta (objects with "insert" key)
  if (!ops.some((op) => op && typeof op === "object" && "insert" in op)) {
    return raw;
  }

  let result = "";

  for (const op of ops) {
    if (typeof op.insert !== "string") {
      // Embedded content (images, etc.) — skip
      if (op.insert && typeof op.insert === "object" && "image" in op.insert) {
        result += `![image](${op.insert.image})`;
      }
      continue;
    }

    const text = op.insert;
    const attrs = op.attributes || {};

    // Process inline formatting
    let formatted = text;

    if (attrs.code) {
      formatted = `\`${formatted}\``;
    }
    if (attrs.bold) {
      formatted = `**${formatted}**`;
    }
    if (attrs.italic) {
      formatted = `*${formatted}*`;
    }
    if (attrs.strike) {
      formatted = `~~${formatted}~~`;
    }
    if (attrs.link) {
      formatted = `[${formatted}](${attrs.link})`;
    }

    // Process block-level formatting (applied to newline characters)
    if (text.includes("\n")) {
      const lines = formatted.split("\n");
      for (let i = 0; i < lines.length; i++) {
        const line = lines[i];
        const isLastLine = i === lines.length - 1 && line === "";

        if (isLastLine) break;

        if (attrs.header) {
          const level = Number(attrs.header);
          result += `${"#".repeat(level)} ${line}`;
        } else if (attrs.list === "bullet") {
          result += `- ${line}`;
        } else if (attrs.list === "ordered") {
          result += `1. ${line}`;
        } else if (attrs.list === "check") {
          const checked = attrs.checked ? "x" : " ";
          result += `- [${checked}] ${line}`;
        } else if (attrs.blockquote) {
          result += `> ${line}`;
        } else if (attrs["code-block"]) {
          result += `\`\`\`\n${line}`;
        } else {
          result += line;
        }

        if (i < lines.length - 1) {
          result += "\n";
        }
      }
    } else {
      result += formatted;
    }
  }

  return result.trim();
}
