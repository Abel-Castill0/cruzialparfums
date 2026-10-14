import { Fragment, type ReactNode } from "react";
import { parseRestrictedMarkdown, type RichInline } from "@/lib/rich-text/parse";
import styles from "./rich-text.module.css";

function renderInline(nodes: readonly RichInline[]): ReactNode {
  return nodes.map((node, index) => {
    switch (node.type) {
      case "text":
        return <Fragment key={index}>{node.value}</Fragment>;
      case "break":
        return <br key={index} />;
      case "strong":
        return <strong key={index}>{renderInline(node.children)}</strong>;
      case "em":
        return <em key={index}>{renderInline(node.children)}</em>;
      case "link":
        // The target already passed parseSafeHttpsUrl (absolute https, no credentials); it is external, so it opens apart and leaks nothing.
        return (
          <a key={index} href={node.href} target="_blank" rel="noopener noreferrer">
            {renderInline(node.children)}
          </a>
        );
    }
  });
}

/**
 * Renders restricted Markdown (`lib/rich-text/parse.ts`) with the design system's type. A Server Component with no client
 * code: the output is React elements only, so author text can never become markup. `tone="dark"` is for the dark bands.
 */
export function RichText({ source, tone = "light", className }: { source: string; tone?: "light" | "dark"; className?: string }) {
  const blocks = parseRestrictedMarkdown(source);
  if (blocks.length === 0) return null;
  return (
    <div className={[styles.richText, tone === "dark" ? styles.dark : "", className ?? ""].filter(Boolean).join(" ")} data-rich-text>
      {blocks.map((block, index) =>
        block.type === "paragraph" ? (
          <p key={index}>{renderInline(block.children)}</p>
        ) : (
          <ul key={index}>
            {block.items.map((item, itemIndex) => (
              <li key={itemIndex}>{renderInline(item)}</li>
            ))}
          </ul>
        ),
      )}
    </div>
  );
}
