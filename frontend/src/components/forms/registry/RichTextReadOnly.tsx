import React from 'react';
import type { RichTextDoc } from '../../../types/form';
import { isAllowedHref } from '../../../utils/safeHref';
import { textMatches } from '../../../utils/textMatches';

export interface RichTextReadOnlyProps {
  content: RichTextDoc | undefined;
  /**
   * Gives the n-th top-level H2 the id `<prefix><n>`, counting from 1: the
   * sales script's sections, numbered as the server lists them (M2 Slice 5,
   * FR-SCR-03). Without it, headings have no id.
   */
  headingAnchorPrefix?: string;
  /** Text to mark wherever it occurs, ignoring case and diacritics (FR-SCR-08). */
  highlight?: string;
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
export const RichTextReadOnly: React.FC<RichTextReadOnlyProps> = ({ content, headingAnchorPrefix, highlight }) => {
  if (!content?.content) return null;
  let section = 0;
  return (
    <>
      {(content.content as AnyNode[]).map((node, i) => {
        const isSection = headingAnchorPrefix !== undefined && node.type === 'heading' && node.attrs?.level === 2;
        const anchor = isSection ? `${headingAnchorPrefix}${(section += 1)}` : undefined;
        return renderNode(node, i, { highlight }, anchor);
      })}
    </>
  );
};

type AnyNode = { type: string; attrs?: Record<string, unknown>; content?: AnyNode[]; text?: string; marks?: AnyMark[] };
type AnyMark = { type: string; attrs?: Record<string, unknown> };
type RenderOptions = { highlight?: string };

const renderChildren = (nodes: AnyNode[] | undefined, options: RenderOptions): React.ReactNode =>
  nodes?.map((n, i) => renderNode(n, i, options));

const blockStyle = (attrs?: Record<string, unknown>): React.CSSProperties => ({
  textAlign: attrs?.textAlign as React.CSSProperties['textAlign'],
  lineHeight: attrs?.lineHeight as string | undefined,
});

const renderNode = (node: AnyNode, key: number, options: RenderOptions, anchor?: string): React.ReactNode => {
  switch (node.type) {
    case 'paragraph':
      return (
        <p key={key} style={blockStyle(node.attrs)}>
          {renderChildren(node.content, options)}
        </p>
      );
    case 'heading': {
      const level = (node.attrs?.level as 1 | 2 | 3) ?? 1;
      const Tag = (`h${level}` as unknown) as 'h1' | 'h2' | 'h3';
      return (
        <Tag key={key} id={anchor} style={blockStyle(node.attrs)}>
          {renderChildren(node.content, options)}
        </Tag>
      );
    }
    case 'bulletList':
      return <ul key={key}>{renderChildren(node.content, options)}</ul>;
    case 'orderedList':
      return <ol key={key}>{renderChildren(node.content, options)}</ol>;
    case 'listItem':
      return <li key={key}>{renderChildren(node.content, options)}</li>;
    case 'hardBreak':
      return <br key={key} />;
    case 'text':
      return (
        <React.Fragment key={key}>{applyMarks(highlighted(node.text ?? '', options.highlight), node.marks)}</React.Fragment>
      );
    default:
      // Forward-compatible: a node type this build does not know about is
      // skipped, not fatal — see the module doc.
      return null;
  }
};

/** The text with every match of `query` wrapped in <mark>, or the text itself when nothing matches. */
const highlighted = (text: string, query: string | undefined): React.ReactNode => {
  const matches = query ? textMatches(text, query) : [];
  if (matches.length === 0) return text;
  const parts: React.ReactNode[] = [];
  let at = 0;
  matches.forEach(([start, end], i) => {
    if (start > at) parts.push(text.slice(at, start));
    parts.push(<mark key={i}>{text.slice(start, end)}</mark>);
    at = end;
  });
  if (at < text.length) parts.push(text.slice(at));
  return parts;
};

/** Folds marks onto the text node, innermost mark closest to the text —
 *  matches how TipTap itself nests `<strong><em>text</em></strong>`. */
const applyMarks = (text: React.ReactNode, marks: AnyMark[] | undefined): React.ReactNode => {
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
      case 'link':
        // Offer texts and the sales script (M2 Slices 4, 5). The server keeps
        // only http, https and mailto links; anything else renders as text.
        return isAllowedHref(mark.attrs?.href) ? (
          <a href={mark.attrs!.href as string} target="_blank" rel="noopener noreferrer">
            {child}
          </a>
        ) : (
          child
        );
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
