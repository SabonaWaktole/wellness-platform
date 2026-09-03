import { describe, it, expect, vi } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import { PrintableForm } from './PrintableForm';
import { emptyPageGeometry } from '../../../types/form';

const doc = () => ({
  version: 3 as const,
  page: emptyPageGeometry(),
  pages: [
    {
      id: 'p1',
      sections: [
        {
          id: 's1',
          x: 20,
          y: 20,
          width: 400,
          height: 300,
          elements: [
            {
              id: 'e1',
              type: 'INPUT' as const,
              x: 0,
              y: 0,
              width: 200,
              height: 60,
              field: { key: 'company_name', label: 'Company Name', dataType: 'TEXT' as const, required: false },
            },
          ],
        },
      ],
    },
  ],
});

describe('PrintableForm', () => {
  it('renders the given title and the document in print mode', () => {
    render(<PrintableForm title="Client Intake" formDocument={doc()} values={{ company_name: 'Acme' }} onBack={() => {}} />);
    expect(screen.getByText('Client Intake')).toBeInTheDocument();
    // print mode renders the stored value as static text, not an <input>.
    expect(screen.getByText('Acme')).toBeInTheDocument();
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument();
  });

  it('calls onBack when the back action is used', () => {
    const onBack = vi.fn();
    render(<PrintableForm title="Client Intake" formDocument={doc()} onBack={onBack} />);
    fireEvent.click(screen.getByText('Back'));
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('invokes window.print from the print action', () => {
    const printSpy = vi.spyOn(window, 'print').mockImplementation(() => {});
    render(<PrintableForm title="Client Intake" formDocument={doc()} onBack={() => {}} />);
    fireEvent.click(screen.getByText('Print'));
    expect(printSpy).toHaveBeenCalledTimes(1);
    printSpy.mockRestore();
  });
});
