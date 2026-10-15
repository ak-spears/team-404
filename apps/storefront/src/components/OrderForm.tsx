'use client';

import { useRouter } from 'next/navigation';
import { useState, type FormEvent } from 'react';
import {
  calculatePriceCents,
  PAYMENT_METHODS,
  PRICING_TABLE_CENTS,
  SERVICE_TYPES,
  type PaymentMethod,
  type ServiceType,
} from '@crimson-copies/shared';
import { MAX_UPLOAD_BYTES, uploadErrorMessage, uploadOrderFile } from '../lib/order-files';
import { formatPrice, PAYMENT_LABELS, SERVICE_DETAILS } from '../lib/services';
import { ChoiceGroup } from './ChoiceGroup';
import { FileDrop } from './FileDrop';
import { FormStep } from './FormStep';
import { QuantityStepper } from './QuantityStepper';

/** The upload credential is not in this response -- the BFF keeps it in an HttpOnly cookie. */
interface OrderCreateResponse {
  orderId: number;
}

function isOrderCreateResponse(value: unknown): value is OrderCreateResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    typeof (value as { orderId?: unknown }).orderId === 'number'
  );
}

// Fixed-price services first; quoted ones (department jobs) last.
const SERVICE_CHOICES = [...SERVICE_TYPES]
  .sort((a, b) => Number(PRICING_TABLE_CENTS[a] === null) - Number(PRICING_TABLE_CENTS[b] === null))
  .map((type) => {
    const cents = PRICING_TABLE_CENTS[type];
    return {
      value: type,
      title: SERVICE_DETAILS[type].title,
      meta:
        cents === null ? 'Quoted per job' : `${formatPrice(cents)} ${SERVICE_DETAILS[type].unit}`,
    };
  });

const PAYMENT_CHOICES = PAYMENT_METHODS.map((method) => ({
  value: method,
  title: PAYMENT_LABELS[method],
}));

interface OrderFormProps {
  initialService?: ServiceType;
  defaultName?: string;
  defaultEmail?: string;
}

/** The order form. Submits to the storefront's own BFF route. */
export function OrderForm({ initialService, defaultName = '', defaultEmail = '' }: OrderFormProps) {
  const router = useRouter();
  const [serviceType, setServiceType] = useState<ServiceType>(initialService ?? SERVICE_TYPES[0]);
  const [quantity, setQuantity] = useState(1);
  const [specNotes, setSpecNotes] = useState('');
  const [customerName, setCustomerName] = useState(defaultName);
  const [customerEmail, setCustomerEmail] = useState(defaultEmail);
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PAYMENT_METHODS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [placedOrderId, setPlacedOrderId] = useState<number | null>(null);
  // The file is chosen here but can only be uploaded once the order exists -- order_files rows
  // reference an order id -- so it is held until POST /api/orders returns one.
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState<string | null>(null);
  const [uploadPercent, setUploadPercent] = useState<number | null>(null);

  const service = SERVICE_DETAILS[serviceType];
  const unitCents = PRICING_TABLE_CENTS[serviceType];
  const totalCents = calculatePriceCents(serviceType, quantity);

  function handleFileChosen(file: File | null): void {
    // Checked here as well as server-side so an oversized file is rejected while the customer
    // is still filling the form, not after the order is already placed.
    if (file && file.size > MAX_UPLOAD_BYTES) {
      setFileError(uploadErrorMessage(413));
      setPendingFile(null);
      return;
    }
    setFileError(null);
    setPendingFile(file);
  }

  async function handleSubmit(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setSubmitting(true);
    setError(null);

    try {
      const response = await fetch('/api/orders', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          customerName,
          customerEmail,
          customerPhone: customerPhone || undefined,
          serviceType,
          quantity,
          specNotes: specNotes || undefined,
          paymentMethod,
        }),
      });

      const body: unknown = await response.json();
      if (!response.ok) {
        setError('Could not submit your order. Please check the form and try again.');
        return;
      }
      if (!isOrderCreateResponse(body)) {
        setError('Unexpected response from the server.');
        return;
      }
      setPlacedOrderId(body.orderId);

      // One action for the customer, two requests underneath. A failure here is reported as
      // "the order was placed, the file wasn't" -- never as a failed order, which would leave
      // someone unsure whether they had ordered anything at all. Either way the customer ends
      // up on the order's own page, which reloads the order and its files on every visit, so a
      // refresh never drops them back onto an empty form.
      const outcomeQuery = new URLSearchParams();
      if (pendingFile) {
        setUploadPercent(0);
        const outcome = await uploadOrderFile(body.orderId, pendingFile, setUploadPercent);
        setUploadPercent(null);
        if (outcome.ok) {
          outcomeQuery.set('uploaded', pendingFile.name);
        } else {
          outcomeQuery.set('uploadError', String(outcome.status));
        }
      }
      const query = outcomeQuery.toString();
      router.replace(`/orders/${body.orderId}${query ? `?${query}` : ''}`);
    } catch {
      setError('Network error -- please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (placedOrderId !== null) {
    return (
      <section className="order-placed" role="status">
        <span className="order-placed-check" aria-hidden>
          &#10003;
        </span>
        <h2>Order #{placedOrderId} placed</h2>
        {uploadPercent !== null ? (
          <div className="upload-progress">
            <progress value={uploadPercent} max={100} />
            Uploading {pendingFile?.name}&hellip; {uploadPercent}%
          </div>
        ) : (
          <p className="muted">Opening your order&hellip;</p>
        )}
      </section>
    );
  }

  return (
    <section className="order-builder">
      <form className="order-form" onSubmit={handleSubmit}>
        <div className="order-steps">
          <FormStep step={1} title="What are we printing?">
            <ChoiceGroup
              name="serviceType"
              choices={SERVICE_CHOICES}
              value={serviceType}
              onChange={setServiceType}
            />
          </FormStep>

          <FormStep step={2} title="Details">
            <QuantityStepper
              label={service.quantityLabel}
              value={quantity}
              onChange={setQuantity}
            />
            <label>
              <span>
                Notes for staff <span className="optional">optional</span>
              </span>
              <textarea
                value={specNotes}
                onChange={(e) => setSpecNotes(e.target.value)}
                rows={3}
                maxLength={4000}
                placeholder={service.notesHint}
              />
            </label>
            <div className="field">
              <span className="field-label">
                File to print <span className="optional">optional</span>
              </span>
              <FileDrop
                file={pendingFile}
                error={fileError}
                onFile={handleFileChosen}
                onRejected={setFileError}
              />
            </div>
          </FormStep>

          <FormStep step={3} title="Contact" hint="We'll email you when it's ready for pickup.">
            <div className="field-grid">
              <label>
                Name
                <input
                  type="text"
                  required
                  autoComplete="name"
                  value={customerName}
                  onChange={(e) => setCustomerName(e.target.value)}
                />
              </label>
              <label>
                Email
                <input
                  type="email"
                  required
                  autoComplete="email"
                  value={customerEmail}
                  onChange={(e) => setCustomerEmail(e.target.value)}
                />
              </label>
              <label>
                <span>
                  Phone <span className="optional">optional</span>
                </span>
                <input
                  type="tel"
                  autoComplete="tel"
                  value={customerPhone}
                  onChange={(e) => setCustomerPhone(e.target.value)}
                />
              </label>
            </div>
          </FormStep>

          <FormStep step={4} title="Payment">
            <ChoiceGroup
              name="paymentMethod"
              variant="pills"
              choices={PAYMENT_CHOICES}
              value={paymentMethod}
              onChange={setPaymentMethod}
            />
          </FormStep>
        </div>

        <aside className="order-summary">
          <h2>Your order</h2>
          <SummaryLine label="Service" value={service.title} />
          <SummaryLine
            label={service.quantityLabel}
            value={unitCents === null ? quantity : `${quantity} × ${formatPrice(unitCents)}`}
          />
          <SummaryLine label="File" value={pendingFile?.name ?? 'Add later'} />
          <SummaryLine label="Payment" value={PAYMENT_LABELS[paymentMethod]} />
          <div className="summary-total">
            <span>{totalCents === null ? 'Price' : 'Estimated total'}</span>
            <strong>{totalCents === null ? 'Quoted' : formatPrice(totalCents)}</strong>
          </div>
          {totalCents === null && (
            <p className="summary-note">Staff will price this job individually.</p>
          )}
          {error && (
            <p className="error" role="alert">
              {error}
            </p>
          )}
          <button type="submit" disabled={submitting}>
            {submitting ? 'Placing order…' : 'Place order'}
          </button>
          <p className="summary-note">You can add more files after ordering.</p>
        </aside>
      </form>
    </section>
  );
}

function SummaryLine({ label, value }: { label: string; value: string | number }) {
  return (
    <div className="summary-line">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}
