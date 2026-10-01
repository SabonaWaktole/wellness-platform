import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { RichTextReadOnly } from './RichTextReadOnly';
import type { RichTextDoc } from '../../../types/form';

const doc = (content: unknown[]): RichTextDoc => ({ type: 'doc', content } as RichTextDoc);

describe('RichTextReadOnly', () => {
  it('renders plain paragraph text', () => {
    render(<RichTextReadOnly content={doc([{ type: 'paragraph', content: [{ type: 'text', text: 'Hello world' }] }])} />);
    expect(screen.getByText('Hello world')).toBeInTheDocument();
  });

  it('renders a heading at the right level', () => {
    render(
      <RichTextReadOnly
        content={doc([{ type: 'heading', attrs: { level: 2 }, content: [{ type: 'text', text: 'Title' }] }])}
      />
    );
    expect(screen.getByRole('heading', { level: 2, name: 'Title' })).toBeInTheDocument();
  });

  it('renders bold, italic, underline and strike marks', () => {
    const { container } = render(
      <RichTextReadOnly
        content={doc([
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'B', marks: [{ type: 'bold' }] },
              { type: 'text', text: 'I', marks: [{ type: 'italic' }] },
              { type: 'text', text: 'U', marks: [{ type: 'underline' }] },
              { type: 'text', text: 'S', marks: [{ type: 'strike' }] },
            ],
          },
        ])}
      />
    );
    expect(container.querySelector('strong')?.textContent).toBe('B');
    expect(container.querySelector('em')?.textContent).toBe('I');
    expect(container.querySelector('u')?.textContent).toBe('U');
    expect(container.querySelector('s')?.textContent).toBe('S');
  });

  it('renders textStyle colour/background/fontFamily/fontSize as inline style', () => {
    render(
      <RichTextReadOnly
        content={doc([
          {
            type: 'paragraph',
            content: [
              {
                type: 'text',
                text: 'Styled',
                marks: [{ type: 'textStyle', attrs: { color: '#1d4ed8', backgroundColor: '#fef3c7', fontFamily: 'Georgia', fontSize: '20px' } }],
              },
            ],
          },
        ])}
      />
    );
    const span = screen.getByText('Styled');
    expect(span).toHaveStyle({ color: '#1d4ed8', backgroundColor: '#fef3c7', fontFamily: 'Georgia', fontSize: '20px' });
  });

  it('renders paragraph textAlign and lineHeight', () => {
    render(
      <RichTextReadOnly
        content={doc([{ type: 'paragraph', attrs: { textAlign: 'center', lineHeight: '1.6' }, content: [{ type: 'text', text: 'x' }] }])}
      />
    );
    expect(screen.getByText('x').closest('p')).toHaveStyle({ textAlign: 'center', lineHeight: '1.6' });
  });

  it('renders bullet and ordered lists', () => {
    render(
      <RichTextReadOnly
        content={doc([
          { type: 'bulletList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'One' }] }] }] },
          { type: 'orderedList', content: [{ type: 'listItem', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Two' }] }] }] },
        ])}
      />
    );
    expect(screen.getAllByRole('list')).toHaveLength(2);
    expect(screen.getAllByRole('listitem').map((li) => li.textContent)).toEqual(['One', 'Two']);
  });

  it('renders a hard break as a line break, not literal text', () => {
    const { container } = render(
      <RichTextReadOnly
        content={doc([{ type: 'paragraph', content: [{ type: 'text', text: 'a' }, { type: 'hardBreak' }, { type: 'text', text: 'b' }] }])}
      />
    );
    expect(container.querySelectorAll('br')).toHaveLength(1);
  });

  it('renders nothing for an empty document, without throwing', () => {
    const { container } = render(<RichTextReadOnly content={doc([])} />);
    expect(container.querySelector('p, h1, h2, h3, ul, ol')).toBeNull();
  });

  it('skips a node type it does not recognise rather than throwing', () => {
    expect(() =>
      render(<RichTextReadOnly content={doc([{ type: 'somethingFuture' }, { type: 'paragraph', content: [{ type: 'text', text: 'still here' }] }])} />)
    ).not.toThrow();
    expect(screen.getByText('still here')).toBeInTheDocument();
  });

  it('NFR-SEC-05 renders an http, https or mailto link as a link that opens apart, and any other href as text', () => {
    const link = (href: string) => ({ type: 'link', attrs: { href } });
    const { container } = render(
      <RichTextReadOnly
        content={doc([
          {
            type: 'paragraph',
            content: [
              { type: 'text', text: 'site', marks: [link('https://wellness.al')] },
              { type: 'text', text: 'mail', marks: [link('mailto:info@wellness.al')] },
              { type: 'text', text: 'bad', marks: [link('javascript:alert(1)')] },
              { type: 'text', text: 'data', marks: [link('data:text/html,x')] },
            ],
          },
        ])}
      />
    );
    const anchors = [...container.querySelectorAll('a')];
    expect(anchors.map((a) => [a.textContent, a.getAttribute('href')])).toEqual([
      ['site', 'https://wellness.al'],
      ['mail', 'mailto:info@wellness.al'],
    ]);
    expect(anchors[0].getAttribute('rel')).toBe('noopener noreferrer');
    // The refused links keep their text, as plain text.
    expect(container.querySelector('p')?.textContent).toBe('sitemailbaddata');
  });
});
