import React from 'react';
import type { RichTextDoc } from '../../../types/form';

export interface RichTextReadOnlyProps {
  content: RichTextDoc | undefined;
}

/**
 * A pure structural render of a rich-text document — the same node/mark set
 * `richTextDocSchema` (backend) and `RICH_TEXT_EXTENSIONS` (TipTap) share.
 *
 * NOT a TipTap editor instance: `fill` and `print` never need an editable
 * ProseMirror view, only markup, and mounting one per read-only text block
 * across a multi-page document would be needless weight. This is the "one
 * path for builder, preview, fill and print" component (brief §6) for TEXT —
 * every mode renders through this, so a mark the editor can produce and this
 * cannot show would be a silent content loss no test would catch.
 *
 * An unrecognised node type (future editor content viewed on an older build)
 * is skipped, never thrown on — the sibling content around it must still
 * render.
 */
export const RichTextReadOnly: React.FC<RichTextReadOnlyProps> = ({ content }) => {
  if (!content?.content) return null;
  return <>{(content.content as AnyNode[]).map((node, i) => renderNode(node, i))}</>;
};

type AnyNode = { type: string; attrs?: Record<string, unknown>; content?: AnyNode[]; text?: string; marks?: AnyMark[] };
type AnyMark = { type: string; attrs?: Record<string, unknown> };

const renderChildren = (nodes: AnyNode[] | undefined): React.ReactNode =>
  nodes?.map((n, i) => renderNode(n, i));

const blockStyle = (attrs?: Record<string, unknown>): React.CSSProperties => ({
  textAlign: attrs?.textAlign as React.CSSProperties['textAlign'],
  lineHeight: attrs?.lineHeight as string | undefined,
});

const renderNode = (node: AnyNode, key: number): React.ReactNode => {
  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} style={blockStyle(node.attrs)}>
          {renderChildren(node.content)}
        </p>
      );
    case 'heading': {
      const level = (node.attrs?.level as 1 | 2 | 3) ?? 1;
      const Tag = (`h${level}` as unknown) as 'h1' | 'h2' | 'h3';
      return (
        <Tag key={key} style={blockStyle(node.attrs)}>
          {renderChildren(node.content)}
        </Tag>
      );
    }
    case 'bulletList':
      return <ul key={key}>{renderChildren(node.content)}</ul>;
    case 'orderedList':
      return <ol key={key}>{renderChildren(node.content)}</ol>;
    case 'listItem':
      return <li key={key}>{renderChildren(node.content)}</li>;
    case 'hardBreak':
      return <br key={key} />;
    case 'text':
      return (
        <React.Fragment key={key}>{applyMarks(node.text ?? '', node.marks)}</React.Fragment>
      );
    default:
      // Forward-compatible: a node type this build does not know about is
      // skipped, not fatal — see the module doc.
      return null;
  }
};

/** Folds marks onto the text node, innermost mark closest to the text —
 *  matches how TipTap itself nests `<strong><em>text</em></strong>`. */
const applyMarks = (text: string, marks: AnyMark[] | undefined): React.ReactNode => {
  if (!marks || marks.length === 0) return text;

  return marks.reduce<React.ReactNode>((child, mark) => {
    switch (mark.type) {
      case 'bold':
        return <strong>{child}</strong>;
      case 'italic':
        return <em>{child}</em>;
      case 'underline':
        return <u>{child}</u>;
      case 'strike':
        return <s>{child}</s>;
      case 'textStyle': {
        const attrs = mark.attrs ?? {};
        const style: React.CSSProperties = {
          color: attrs.color as string | undefined,
          backgroundColor: attrs.backgroundColor as string | undefined,
          fontFamily: attrs.fontFamily as string | undefined,
          fontSize: attrs.fontSize as string | undefined,
        };
        return <span style={style}>{child}</span>;
      }
      default:
        return child;
    }
  }, text);
};
