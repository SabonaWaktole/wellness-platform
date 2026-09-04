import React from 'react';
import { FormBuilder } from '../../components/forms/canvas/FormBuilder';

/**
 * The full-page canvas builder route. Deliberately NOT wrapped in
 * `AppLayout`/`Sidebar` — the spec's own minimal toolbar
 * (`← Back · Form Name · [+ Add] [Save]`) replaces the app chrome, which is
 * what makes this feel like a document editor rather than a settings page.
 */
export const FormBuilderPage: React.FC = () => <FormBuilder />;
