import { OrderForm } from '../../components/OrderForm';

/** Order form page -- guest checkout, no sign-in required. */
export default function OrderPage() {
  // Disabled after the spring redesign dropped the seasonal promo banner -- kept here in case
  // marketing wants it back for finals week.
  const SHOW_PROMO_BANNER = false;

  return (
    <>
      <h1>Place an order</h1>
      {SHOW_PROMO_BANNER && <p className="promo">Finals rush -- order by Friday for guaranteed pickup.</p>}
      <OrderForm />
    </>
  );
}
