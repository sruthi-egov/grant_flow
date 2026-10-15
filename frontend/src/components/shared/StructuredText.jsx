import { useState } from "react";
import { ChevronDown, ChevronUp } from "lucide-react";

/**
 * Parses text into structured blocks (numbered items with optional sub-bullets, or plain bullets).
 * Returns an array of { type: 'numbered'|'bullet'|'paragraph', items: [...] }
 */
function parseStructured(text) {
  if (!text || typeof text !== "string") return [];
  const raw = text.trim();
  if (!raw) return [];

  // Split on newlines first, then detect numbered patterns
  const lines = raw.split(/\n/).map(l => l.trim()).filter(Boolean);

  // Detect if there are numbered items: "1.", "2.", "(1)", "1)", "Phase 1", "Milestone 1", "Step 1"
  const numberedPattern = /^(\d+[\.\)]|[(\d+)]|\(Step\s+\d+\)|(Phase|Milestone|Step|Stage|Payment|Service|Task|Activity|Work Package)\s+\d+)/i;
  const bulletPattern = /^[-•*–]\s+/;

  const hasNumbered = lines.some(l => numberedPattern.test(l));
  const hasBullets = lines.some(l => bulletPattern.test(l));

  if (!hasNumbered && !hasBullets) {
    // Try to split on semicolons if there are multiple of them
    const semicolonParts = raw.split(/;\s*/).map(s => s.trim()).filter(s => s.length > 10);
    if (semicolonParts.length >= 3) {
      return [{ type: "bullet", items: semicolonParts }];
    }
    // Return as plain paragraph(s)
    return [{ type: "paragraph", text: raw }];
  }

  // Parse line-by-line into groups
  const groups = [];
  let currentGroup = null;

  for (const line of lines) {
    if (numberedPattern.test(line)) {
      if (currentGroup) groups.push(currentGroup);
      currentGroup = { type: "numbered", heading: line, bullets: [] };
    } else if (bulletPattern.test(line) && currentGroup?.type === "numbered") {
      currentGroup.bullets.push(line.replace(bulletPattern, ""));
    } else if (bulletPattern.test(line)) {
      if (!currentGroup || currentGroup.type !== "bullet") {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { type: "bullet", items: [] };
      }
      currentGroup.items.push(line.replace(bulletPattern, ""));
    } else {
      // Plain continuation line — append to current group or start paragraph
      if (currentGroup?.type === "numbered") {
        // treat as sub-detail of current numbered item
        currentGroup.bullets.push(line);
      } else if (currentGroup?.type === "paragraph") {
        currentGroup.text += " " + line;
      } else {
        if (currentGroup) groups.push(currentGroup);
        currentGroup = { type: "paragraph", text: line };
      }
    }
  }
  if (currentGroup) groups.push(currentGroup);

  return groups;
}

function NumberedGroup({ heading, bullets, index }) {
  return (
    <div className="flex gap-3">
      <div className="w-6 h-6 rounded-full bg-primary/10 text-primary text-xs font-bold flex items-center justify-center shrink-0 mt-0.5">
        {index + 1}
      </div>
      <div className="flex-1 pb-1">
        <p className="text-sm font-medium text-foreground leading-snug">{stripLeadingNumber(heading)}</p>
        {bullets.length > 0 && (
          <ul className="mt-1.5 space-y-1">
            {bullets.map((b, i) => (
              <li key={i} className="flex gap-2 text-sm text-muted-foreground">
                <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-muted-foreground/50 shrink-0" />
                <span>{b}</span>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}

function stripLeadingNumber(text) {
  return text.replace(/^(\d+[\.\)]|\(\d+\)|(Phase|Milestone|Step|Stage|Payment|Service|Task|Activity|Work Package)\s+\d+:?)\s*/i, "").trim();
}

/**
 * Main component: renders structured text with optional "View original" toggle.
 */
export default function StructuredText({ text, showOriginal = true }) {
  const [expanded, setExpanded] = useState(false);

  if (!text) return null;

  const groups = parseStructured(text);
  const isSimple = groups.length === 1 && groups[0].type === "paragraph";

  if (isSimple) {
    return <p className="text-sm text-muted-foreground whitespace-pre-line leading-relaxed">{text}</p>;
  }

  return (
    <div className="space-y-3">
      {groups.map((group, gi) => {
        if (group.type === "numbered") {
          return <NumberedGroup key={gi} heading={group.heading} bullets={group.bullets} index={gi} />;
        }
        if (group.type === "bullet") {
          return (
            <ul key={gi} className="space-y-1.5">
              {group.items.map((item, ii) => (
                <li key={ii} className="flex gap-2 text-sm text-muted-foreground">
                  <span className="mt-1.5 w-1.5 h-1.5 rounded-full bg-primary/50 shrink-0" />
                  <span>{item}</span>
                </li>
              ))}
            </ul>
          );
        }
        return (
          <p key={gi} className="text-sm text-muted-foreground leading-relaxed">{group.text}</p>
        );
      })}

      {showOriginal && (
        <div className="pt-1">
          <button
            onClick={() => setExpanded(e => !e)}
            className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground transition-colors"
          >
            {expanded ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />}
            {expanded ? "Hide" : "View"} original extracted text
          </button>
          {expanded && (
            <pre className="mt-2 text-xs text-muted-foreground bg-muted/40 rounded-md p-3 whitespace-pre-wrap font-mono leading-relaxed border">
              {text}
            </pre>
          )}
        </div>
      )}
    </div>
  );
}