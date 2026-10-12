/**
 * Shared types for the Support tour engine. Nothing here imports from the app,
 * from React or from the DOM, so every later Support module (and the pure
 * state machine) can depend on it freely.
 */

/** A step only explains a control (default) or, rarely, lets the user try it. */
export type StepSafety = 'explain-only' | 'try-it';

/** What a step points at: one control, a whole region, or text with no anchor of its own. */
export type StepKind = 'control' | 'region' | 'info';

/** Where to look for a target: the page, the app shell, or the topmost open layer. */
export type TargetScope = 'page' | 'shell' | 'layer';

export type TargetPick = 'first' | 'nth';

export type Workflow = 'SALES_PROCESS' | 'LEGACY_QUOTATIONS';

export type PermissionScope = 'OWN' | 'TEAM' | 'ALL';

/**
 * What a user needs for a step to apply. Semantics copy `usePermission` (a key
 * is held if it is present) and `useNavigation` (workflow compare), so Support
 * never disagrees with the menu.
 */
export interface Requirement {
  /** Every listed key must be held. */
  permission?: string | string[];
  /** At least one listed key must be held. */
  anyPermission?: string[];
  /** The scope `permission` must be held at or above. Unscoped grants (`true`) count as `ALL`. */
  minScope?: PermissionScope;
  workflow?: Workflow;
  viewport?: 'desktop' | 'mobile';
}

/** How to find a step's element on the page as it is right now. */
export interface TargetSpec {
  /** Token in `data-tour`, e.g. `clients.list.add`. */
  id: string;
  /** True when the id is deliberately on more than one element (rows, cards). */
  repeat?: boolean;
  pick?: TargetPick;
  /** Zero-based, for `pick: 'nth'`. */
  nth?: number;
  /** A parent target id: the element is looked up inside the first match of it. */
  within?: string;
  scope?: TargetScope;
}

export interface GuideStep {
  /** Unique within the guide. Copy keys are `<pageId>.<id>.title|body|when|warning|disabled`. */
  id: string;
  /** The `data-tour` token of the element to highlight. */
  target: string;
  kind: StepKind;
  safety?: StepSafety;
  repeat?: boolean;
  pick?: TargetPick;
  nth?: number;
  within?: string;
  requires?: Requirement;
  /** Id of the layer (dialog, menu) this step's control opens; steps in `group` explain what it shows. */
  opens?: string;
  /** Steps that belong to a layer this step opens; reachable only after the layer opens. */
  group?: string;
  warning?: boolean;
  /** Reuse another step's copy. */
  use?: string;
  scope?: TargetScope;
  /** A state the page must be in for this step to apply (for example `empty`). */
  needs?: string;
}

export interface PageGuide {
  pageId: string;
  /** Bumped when the guide changes enough to re-offer the tour. */
  version: number;
  namespace: string;
  steps: GuideStep[];
}

/** Where a step's element is right now. */
export type TargetStatus = 'found' | 'disabled' | 'offscreen' | 'pending' | 'missing' | 'lost';

/** The part of a step the machine needs. */
export interface StepRef {
  id: string;
  /** Present for steps that belong to a layer opened by another step. */
  group?: string;
}

export type TourOutcome = 'completed' | 'skipped' | 'exited';

interface ActiveFields {
  steps: StepRef[];
  /** Index into `steps` of the current step. */
  index: number;
  /** The step whose layer the tour is inside, or null at the top level. */
  parentId: string | null;
}

export type MachineState =
  | { status: 'idle' }
  | ({ status: 'running' } & ActiveFields)
  | ({ status: 'waiting'; reason: 'loading' | 'user-action'; layerId: string | null } & ActiveFields)
  | ({ status: 'lost' } & ActiveFields)
  | { status: 'finished'; outcome: TourOutcome; lastStepId: string | null };

export type MachineEvent =
  | { type: 'START'; steps: StepRef[]; resumeAtId?: string }
  | { type: 'NEXT' }
  | { type: 'BACK' }
  | { type: 'SKIP_TOUR' }
  | { type: 'EXIT' }
  | { type: 'STEPS_CHANGED'; steps: StepRef[] }
  | { type: 'TARGET_PENDING' }
  | { type: 'TARGET_READY' }
  | { type: 'TARGET_LOST' }
  | { type: 'TARGET_RESTORED' }
  | { type: 'HOLD_FOR_USER'; layerId: string }
  | { type: 'LAYER_OPENED'; group: string }
  | { type: 'LAYER_CLOSED' };
