'use client';

import { useState, type FormEvent } from 'react';
import {
  PAYMENT_METHODS,
  SERVICE_TYPES,
  type PaymentMethod,
  type ServiceType,
  type UploadInstructions,
} from '@crimson-copies/shared';
import { UploadInstructionsCard } from './UploadInstructionsCard';

interface OrderCreateResponse {
  orderId: number;
  uploadInstructions: UploadInstructions;
}

function isOrderCreateResponse(value: unknown): value is OrderCreateResponse {
  return (
    typeof value === 'object' &&
    value !== null &&
    'orderId' in value &&
    'uploadInstructions' in value
  );
}

/** The order form. Submits to the storefront's own BFF route. */
export function OrderForm() {
  const [serviceType, setServiceType] = useState<ServiceType>(SERVICE_TYPES[0]);
  const [quantity, setQuantity] = useState(1);
  const [specNotes, setSpecNotes] = useState('');
  const [customerName, setCustomerName] = useState('');
  const [customerEmail, setCustomerEmail] = useState('');
  const [customerPhone, setCustomerPhone] = useState('');
  const [paymentMethod, setPaymentMethod] = useState<PaymentMethod>(PAYMENT_METHODS[0]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [res, setRes] = useState<OrderCreateResponse | null>(null);

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
      setRes(body);
    } catch {
      setError('Network error -- please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  if (res) {
    return (
      <div>
        <h2>Order #{res.orderId} submitted</h2>
        <p>
          A confirmation email is on its way. See your order at{' '}
          <a href={`/orders/${res.orderId}`}>order status</a>.
        </p>
        <UploadInstructionsCard />
      </div>
    );
  }

  return (
    <form onSubmit={handleSubmit}>
      <label>
        Name
        <input
          type="text"
          required
          value={customerName}
          onChange={(e) => setCustomerName(e.target.value)}
        />
      </label>
      <label>
        Email
        <input
          type="email"
          required
          value={customerEmail}
          onChange={(e) => setCustomerEmail(e.target.value)}
        />
      </label>
      <label>
        Phone (optional)
        <input
          type="tel"
          value={customerPhone}
          onChange={(e) => setCustomerPhone(e.target.value)}
        />
      </label>
      <label>
        Service type
        <select
          value={serviceType}
          onChange={(e) => setServiceType(e.target.value as ServiceType)}
        >
          {SERVICE_TYPES.map((type) => (
            <option key={type} value={type}>
              {type}
            </option>
          ))}
        </select>
      </label>
      <label>
        Quantity
        <input
          type="number"
          min={1}
          required
          value={quantity}
          onChange={(e) => setQuantity(Number(e.target.value))}
        />
      </label>
      <label>
        Spec notes (optional)
        <textarea value={specNotes} onChange={(e) => setSpecNotes(e.target.value)} rows={4} />
      </label>
      <label>
        Payment method
        <select
          value={paymentMethod}
          onChange={(e) => setPaymentMethod(e.target.value as PaymentMethod)}
        >
          {PAYMENT_METHODS.map((method) => (
            <option key={method} value={method}>
              {method}
            </option>
          ))}
        </select>
      </label>
      {error && <p className="error">{error}</p>}
      <button type="submit" disabled={submitting}>
        {submitting ? 'Submitting...' : 'Submit order'}
      </button>
    </form>
  );
}
