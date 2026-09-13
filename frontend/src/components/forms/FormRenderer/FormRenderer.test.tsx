// @ts-nocheck
import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { useForm } from 'react-hook-form';
import { FormRenderer } from './FormRenderer';
import { emptyPageGeometry } from '../../../types/form';

const box = { x: 0, y: 0, width: 200, height: 60 };

const field = (over = {}) => ({
  key: 'company_name',
  label: 'Company Name',
  dataType: 'TEXT',
  required: false,
  ...over,
});

/** A one-page v3 document holding the given elements in one section. */
const doc = (elements, sectionOver = {}) => ({
  version: 3,
  page: emptyPageGeometry(),
  pages: [
    {
      id: 'p1',
      sections: [
        { id: 's1', title: 'Company Information', x: 20, y: 20, width: 400, height: 300, elements, ...sectionOver },
      ],
    },
  ],
});

const Harness = ({ layout: l, errors = {}, ...rest }) => {
  const { control } = useForm({ defaultValues: { data: {} } });
  return <FormRenderer layout={l} control={control} errors={errors} {...rest} />;
};

describe('FormRenderer', () => {
  it('shows a section title, with no auto-numbered badge', () => {
    render(<Harness layout={doc([])} />);
    expect(screen.getByRole('heading', { name: 'Company Information' })).toBeInTheDocument();
    expect(screen.queryByText('1')).not.toBeInTheDocument();
  });

  it('does not draw a title band when no background is set (backward compatibility)', () => {
    render(<Harness layout={doc([])} />);
    const heading = screen.getByRole('heading', { name: 'Company Information' });
    expect(heading.parentElement?.style.background).toBe('');
  });

  it('draws the title band background on the header, not the heading text', () => {
    render(
      <Harness
        layout={doc([], { titleStyles: { background: '#1d4ed8', color: '#ffffff' } })}
      />
    );
    const heading = screen.getByRole('heading', { name: 'Company Information' });
    expect(heading.parentElement?.style.background).toBe('rgb(29, 78, 216)');
    expect(heading.style.color).toBe('rgb(255, 255, 255)');
  });

  it('renders a text field labelled from the FIELD, not from any definition', () => {
    render(<Harness layout={doc([{ id: 'i1', type: 'INPUT', ...box, field: field() }])} />);
    expect(screen.getByLabelText(/Company Name/)).toBeInTheDocument();
  });

  /*
   * A radio group and a dropdown store the same value; which one appears is
   * the COMPONENT TYPE — presentation — while dataType says what is stored.
   * That split is the whole point of the two-representation model.
   */
  it('renders a SINGLE_SELECT as radio buttons when the component says so', () => {
    render(
      <Harness
        layout={doc([
          {
            id: 'i1',
            type: 'RADIO_GROUP',
            ...box,
            field: field({ dataType: 'SINGLE_SELECT', options: [
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ] }),
          },
        ])}
      />
    );
    expect(screen.getAllByRole('radio')).toHaveLength(2);
  });

  it('renders the same field as a dropdown when the component is DROPDOWN', () => {
    render(
      <Harness
        layout={doc([
          {
            id: 'i1',
            type: 'DROPDOWN',
            ...box,
            field: field({ dataType: 'SINGLE_SELECT', options: [
              { value: 'male', label: 'Male' },
              { value: 'female', label: 'Female' },
            ] }),
          },
        ])}
      />
    );
    expect(screen.getByRole('combobox')).toBeInTheDocument();
    expect(screen.queryAllByRole('radio')).toHaveLength(0);
  });

  it('renders a MULTI_SELECT as a checkbox group', () => {
    render(
      <Harness
        layout={doc([
          {
            id: 'i1',
            type: 'CHECKBOX_GROUP',
            ...box,
            field: field({ dataType: 'MULTI_SELECT', options: [
              { value: 'noise', label: 'Noise' },
              { value: 'dust', label: 'Dust' },
              { value: 'machinery', label: 'Machinery' },
            ] }),
          },
        ])}
      />
    );
    expect(screen.getAllByRole('checkbox')).toHaveLength(3);
  });

  /* Errors are keyed by field.key — the durable data identity. */
  it('shows the error passed for a field, keyed by field.key', () => {
    render(
      <Harness
        layout={doc([{ id: 'i1', type: 'INPUT', ...box, field: field() }])}
        errors={{ company_name: 'This field is required' }}
      />
    );
    expect(screen.getByRole('alert')).toHaveTextContent('This field is required');
  });

  it('renders a TEXT block that collects no value', () => {
    render(
      <Harness
        layout={doc([
          {
            id: 'i1',
            type: 'TEXT',
            ...box,
            content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Tell us about your staff.' }] }] },
          },
        ])}
      />
    );
    expect(screen.getByText('Tell us about your staff.')).toBeInTheDocument();
  });

  it('renders a DIVIDER without collecting a value', () => {
    const { container } = render(
      <Harness
        layout={doc([{ id: 'i1', type: 'DIVIDER', ...box, content: { orientation: 'horizontal', thickness: 2 } }])}
      />
    );
    expect(container.querySelector('div[aria-hidden="true"]')).toBeTruthy();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  /* Spec §18: a signature area must read as a signature area on paper. */
  it('renders a SIGNATURE as a ruled block with its caption', () => {
    render(
      <Harness
        layout={doc([{ id: 'i1', type: 'SIGNATURE', ...box, field: field({ key: 'sig', label: 'Company Stamp', dataType: 'SIGNATURE' }) }])}
      />
    );
    expect(screen.getByText('Company Stamp')).toBeInTheDocument();
  });

  it('renders values as static text in print mode', () => {
    render(
      <FormRenderer
        layout={doc([{ id: 'i1', type: 'INPUT', ...box, field: field() }])}
        mode="print"
        values={{ company_name: 'WorkMed Ltd' }}
      />
    );
    expect(screen.getByText('WorkMed Ltd')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  /*
   * A field's "Text colour" must survive into print, or the styling silently
   * disappears the moment a form is submitted or printed.
   */
  it('applies the field text colour to the value in print mode', () => {
    render(
      <FormRenderer
        layout={doc([{ id: 'i1', type: 'INPUT', ...box, styles: { textColor: '#16a34a' }, field: field() }])}
        mode="print"
        values={{ company_name: 'WorkMed Ltd' }}
      />
    );
    expect(screen.getByText('WorkMed Ltd')).toHaveStyle({ color: '#16a34a' });
  });

  it('shows a dash for an unfilled value in print mode', () => {
    render(
      <FormRenderer
        layout={doc([{ id: 'i1', type: 'INPUT', ...box, field: field() }])}
        mode="print"
        values={{}}
      />
    );
    expect(screen.getByText('—')).toBeInTheDocument();
  });

  /*
   * `fieldLayout: 'inline'` has to look the same whether the field is being
   * filled in or already printed — `inputRenderer` draws each mode through
   * separate markup (a live CustomFieldInput for fill, hand-rolled <p> tags
   * for print), and a fix applied to only one of them is exactly the
   * builder/print disagreement the shared renderer exists to prevent.
   */
  it('draws an inline field as one row in fill mode', () => {
    render(
      <Harness
        layout={doc([{ id: 'i1', type: 'INPUT', ...box, styles: { fieldLayout: 'inline' }, field: field() }])}
        mode="fill"
      />
    );
    expect(document.querySelector('[class*="inline"]')).not.toBeNull();
  });

  it('draws an inline field as one row in print mode too', () => {
    render(
      <FormRenderer
        layout={doc([{ id: 'i1', type: 'INPUT', ...box, styles: { fieldLayout: 'inline' }, field: field() }])}
        mode="print"
        values={{ company_name: 'WorkMed Ltd' }}
      />
    );
    expect(document.querySelector('[class*="readOnlyInline"]')).not.toBeNull();
    expect(screen.getByText('WorkMed Ltd')).toBeInTheDocument();
  });

  it('draws a stacked field with no inline marker in either mode (backward compatibility)', () => {
    const { unmount } = render(
      <Harness layout={doc([{ id: 'i1', type: 'INPUT', ...box, field: field() }])} mode="fill" />
    );
    expect(document.querySelector('[class*="inline"]')).toBeNull();
    unmount();

    render(
      <FormRenderer
        layout={doc([{ id: 'i1', type: 'INPUT', ...box, field: field() }])}
        mode="print"
        values={{ company_name: 'WorkMed Ltd' }}
      />
    );
    expect(document.querySelector('[class*="readOnlyInline"]')).toBeNull();
  });

  /*
   * `density: 'compact'` has the same builder/print consistency requirement
   * as `fieldLayout: 'inline'` above — a live CustomFieldInput in fill mode,
   * hand-rolled markup in print mode, and both must shrink together.
   */
  it('draws a compact field smaller in fill mode', () => {
    render(
      <Harness
        layout={doc([{ id: 'i1', type: 'INPUT', ...box, styles: { density: 'compact' }, field: field() }])}
        mode="fill"
      />
    );
    expect(document.querySelector('[class*="compact"]')).not.toBeNull();
  });

  it('draws a compact field smaller in print mode too, even with no explicit fontSize', () => {
    render(
      <FormRenderer
        layout={doc([{ id: 'i1', type: 'INPUT', ...box, styles: { density: 'compact' }, field: field() }])}
        mode="print"
        values={{ company_name: 'WorkMed Ltd' }}
      />
    );
    expect(screen.getByText('WorkMed Ltd')).toHaveStyle({ fontSize: '10px' });
  });

  it('leaves print font size alone for a default-density field (backward compatibility)', () => {
    render(
      <FormRenderer
        layout={doc([{ id: 'i1', type: 'INPUT', ...box, field: field() }])}
        mode="print"
        values={{ company_name: 'WorkMed Ltd' }}
      />
    );
    expect(screen.getByText('WorkMed Ltd')).not.toHaveStyle({ fontSize: '10px' });
  });

  it('an explicit fontSize still wins over the compact default in print mode', () => {
    render(
      <FormRenderer
        layout={doc([
          { id: 'i1', type: 'INPUT', ...box, styles: { density: 'compact', fontSize: 18 }, field: field() },
        ])}
        mode="print"
        values={{ company_name: 'WorkMed Ltd' }}
      />
    );
    expect(screen.getByText('WorkMed Ltd')).toHaveStyle({ fontSize: '18px' });
  });

  /* A USER_SELECT must print the person's NAME, never their opaque id. */
  it('resolves a USER_SELECT value to its label in print mode', () => {
    render(
      <FormRenderer
        layout={doc([{ id: 'i1', type: 'USER_SELECT', ...box, field: field({ key: 'assigned_to', label: 'Assigned To', dataType: 'USER_REFERENCE' }) }])}
        mode="print"
        values={{ assigned_to: 'u-42' }}
        userOptions={[{ id: 'u-42', label: 'Ada Lovelace' }]}
      />
    );
    expect(screen.getByText('Ada Lovelace')).toBeInTheDocument();
    expect(screen.queryByText('u-42')).not.toBeInTheDocument();
  });

  it('positions elements absolutely at their stored coordinates', () => {
    const { container } = render(
      <Harness layout={doc([{ id: 'i1', type: 'INPUT', x: 40, y: 55, width: 200, height: 60, field: field() }])} />
    );
    expect(container.querySelector('[style*="left: 40px"]')).toBeTruthy();
  });

  /* Spec §5/§6: a document is a stack of fixed A4 sheets. */
  it('renders one fixed-size sheet per page', () => {
    const twoPages = {
      version: 3,
      page: emptyPageGeometry(),
      pages: [
        { id: 'p1', sections: [] },
        { id: 'p2', sections: [] },
      ],
    };
    const { container } = render(<Harness layout={twoPages} />);
    const sheets = container.querySelectorAll('[style*="width: 794px"]');
    expect(sheets.length).toBe(2);
  });
});

/*
 * THE LINE BETWEEN AUTHORING AND FILLING.
 *
 * The builder lets the owner put a caret anywhere the page is not already
 * occupied and simply write. The client is doing something else entirely —
 * filling a document in, not designing one — and the same rendering must not
 * carry that capability across. The two modes render the same document and
 * differ only in what answers a click.
 */
describe('FormRenderer — the client fills the form, it does not edit it', () => {
  const textBlock = {
    id: 'copy',
    type: 'TEXT',
    ...box,
    content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Please read carefully.' }] }] },
  };
  const input = { id: 'e1', type: 'INPUT', ...box, y: 100, field: field() };

  it('gives the client no editable surface anywhere on the page', () => {
    const { container } = render(<Harness layout={doc([textBlock, input])} mode="fill" />);

    expect(container.querySelectorAll('[contenteditable="true"]')).toHaveLength(0);
    expect(container.querySelectorAll('[contenteditable]')).toHaveLength(0);
  });

  it('leaves the static text of the document read-only', () => {
    const { container } = render(<Harness layout={doc([textBlock, input])} mode="fill" />);

    expect(screen.getByText(/please read carefully/i)).toBeInTheDocument();
    expect(container.querySelector('[contenteditable="true"]')).toBeNull();
  });

  it('leaves the section title read-only', () => {
    const { container } = render(<Harness layout={doc([input])} mode="fill" />);
    const heading = screen.getByRole('heading', { name: 'Company Information' });

    expect(heading.hasAttribute('contenteditable')).toBe(false);
    expect(container.querySelector('input[class*="sectionTitleInput"]')).toBeNull();
  });

  /* The only editable regions are the interactive fields themselves (§8). */
  it('accepts input only inside the form\'s own fields', () => {
    const { container } = render(<Harness layout={doc([textBlock, input])} mode="fill" />);
    const editable = [...container.querySelectorAll('input, select, textarea')];

    expect(editable).toHaveLength(1);
    expect(editable[0].tagName).toBe('INPUT');
  });

  /* None of the builder's authoring chrome may reach the client (§9). */
  it('carries none of the builder\'s selection or drag chrome', () => {
    const { container } = render(<Harness layout={doc([textBlock, input])} mode="fill" />);

    expect(container.querySelector('[class*="elementOverlay"]')).toBeNull();
    expect(container.querySelector('[class*="sectionOverlay"]')).toBeNull();
    expect(container.querySelector('[class*="sectionDragHandle"]')).toBeNull();
    expect(container.querySelector('[class*="handle-"]')).toBeNull();
  });
});

/*
 * A text host holds words typed straight onto the page. The owner asked for a
 * caret, not a section, so the container must not appear as one — on the
 * canvas, in the client's form, or in print. Drawing it would put a bordered,
 * filled box on the paper exactly where they wanted bare page.
 */
describe('FormRenderer — a text host is not a box', () => {
  const hosted = (id) => ({
    version: 3,
    page: emptyPageGeometry(),
    pages: [
      {
        id: 'p1',
        sections: [
          {
            id,
            title: '',
            x: 40,
            y: 40,
            width: 320,
            height: 40,
            elements: [
              {
                id: 't1',
                type: 'TEXT',
                x: 0,
                y: 0,
                width: 320,
                height: 40,
                content: { type: 'doc', content: [{ type: 'paragraph', content: [{ type: 'text', text: 'Appendix A' }] }] },
              },
            ],
          },
        ],
      },
    ],
  });

  it('draws no section box around text typed onto the page', () => {
    const { container } = render(<Harness layout={hosted('text-host-abc')} mode="fill" />);
    const section = container.querySelector('[data-section-id]');

    expect(section.className).toBe('');
  });

  it('still draws the box for a section the owner actually made', () => {
    const { container } = render(<Harness layout={hosted('s1')} mode="fill" />);
    const section = container.querySelector('[data-section-id]');

    expect(section.className).not.toBe('');
  });

  it('shows the text either way', () => {
    render(<Harness layout={hosted('text-host-abc')} mode="fill" />);
    expect(screen.getByText('Appendix A')).toBeInTheDocument();
  });
});
