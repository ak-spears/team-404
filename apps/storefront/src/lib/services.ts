import type { PaymentMethod, ServiceType } from '@crimson-copies/shared';

interface ServiceDetail {
  title: string;
  blurb: string;
  unit: string;
  /** What the quantity counts, for the order form's stepper. */
  quantityLabel: string;
  /** Prompt for the spec-notes box -- the things staff most often have to ask about. */
  notesHint: string;
}

export const SERVICE_DETAILS: Record<ServiceType, ServiceDetail> = {
  department_job: {
    title: 'Department jobs',
    blurb: 'Bulk and recurring work for campus departments. Staff price each job individually.',
    unit: 'per job',
    quantityLabel: 'Jobs',
    notesHint: 'Department, account number, page count, paper, binding, and when you need it.',
  },
  poster: {
    title: 'Posters',
    blurb: 'Large-format prints for events, classes, and research presentations.',
    unit: 'each',
    quantityLabel: 'Posters',
    notesHint: 'Size (e.g. 24×36 in), matte or glossy, and when you need it.',
  },
  resume_portfolio: {
    title: 'Resumes & portfolios',
    blurb: 'Resumes, cover letters, and portfolio pages.',
    unit: 'each',
    quantityLabel: 'Copies',
    notesHint: 'Paper weight, color or black & white, and whether to staple.',
  },
  class_assignment: {
    title: 'Class assignments',
    blurb: 'Papers, readers, and handouts for your courses.',
    unit: 'per page',
    quantityLabel: 'Pages',
    notesHint: 'Single or double-sided, color or black & white, stapled or loose.',
  },
  personal_printing: {
    title: 'Personal printing',
    blurb: 'Everyday documents, forms, and tickets.',
    unit: 'per page',
    quantityLabel: 'Pages',
    notesHint: 'Single or double-sided, color or black & white.',
  },
};

export const PAYMENT_LABELS: Record<PaymentMethod, string> = {
  bama_cash: 'Bama Cash',
  card: 'Card',
  cash: 'Cash',
};

export function formatPrice(cents: number | null): string {
  if (cents === null) return 'Quoted';
  return `$${(cents / 100).toFixed(2)}`;
}
