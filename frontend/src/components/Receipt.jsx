import { useEffect } from 'react';
import { formatDateTime, formatRand } from '../utils/format';
import './Receipt.css';

// Receipt / tax invoice (FR-19, System Design Figure 32).
// Prints on 80 mm thermal or A4 through the browser print dialog.

const ORDER_TYPES = { DINE_IN: 'Dine-in', TAKEAWAY: 'Collection' };

function Receipt({ receipt, onClose }) {
  useEffect(() => {
    const clear = () => document.body.classList.remove('printing-receipt');
    window.addEventListener('afterprint', clear);
    return () => {
      window.removeEventListener('afterprint', clear);
      clear();
    };
  }, []);

  useEffect(() => {
    const onKey = (event) => { if (event.key === 'Escape') onClose(); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  function print() {
    document.body.classList.add('printing-receipt');
    window.print();
  }

  const voided = receipt.payment_status === 'VOIDED';

  return (
    <div className="receipt-overlay" role="dialog" aria-modal="true" aria-label={`Receipt ${receipt.receipt_number}`}>
      <div className="receipt-dialog">
        <article className={`receipt-sheet ${voided ? 'voided' : ''}`}>
          {voided && <div className="receipt-void-stamp">VOIDED</div>}

          <header className="receipt-header">
            <h2>{receipt.restaurant.name}</h2>
            <p>{receipt.restaurant.tagline}</p>
            <p className="receipt-small">{receipt.restaurant.address}</p>
          </header>

          <h3 className="receipt-title">TAX INVOICE / RECEIPT</h3>

          <dl className="receipt-meta">
            <div><dt>Receipt no.</dt><dd>{receipt.receipt_number}</dd></div>
            <div><dt>Order no.</dt><dd>{receipt.order_ref}</dd></div>
            <div><dt>Date</dt><dd>{formatDateTime(receipt.paid_at)}</dd></div>
            <div><dt>Cashier</dt><dd>{receipt.cashier}</dd></div>
            <div><dt>Order type</dt><dd>{ORDER_TYPES[receipt.order_type] || receipt.order_type}{receipt.table_number ? ` · ${receipt.table_number}` : ''}</dd></div>
          </dl>

          <table className="receipt-lines">
            <tbody>
              {receipt.lines.map((line, index) => (
                <tr key={`${line.name}-${index}`}>
                  <td>{line.name}</td>
                  <td className="receipt-qty">{line.quantity} × {formatRand(line.unit_price)}</td>
                  <td className="receipt-amount">{formatRand(line.line_total)}</td>
                </tr>
              ))}
            </tbody>
          </table>

          <dl className="receipt-totals">
            <div><dt>Subtotal (excl. VAT)</dt><dd>{formatRand(receipt.subtotal_excl_vat)}</dd></div>
            <div><dt>VAT 15%</dt><dd>{formatRand(receipt.vat)}</dd></div>
            <div className="receipt-total"><dt>TOTAL</dt><dd>{formatRand(receipt.total)}</dd></div>
            <div>
              <dt>Paid – {receipt.method_name}</dt>
              <dd>{formatRand(receipt.amount_tendered ?? receipt.total)}</dd>
            </div>
            {receipt.amount_tendered !== null && (
              <div><dt>Change</dt><dd>{formatRand(receipt.change)}</dd></div>
            )}
            {receipt.reference_number && (
              <div><dt>Reference</dt><dd>{receipt.reference_number}</dd></div>
            )}
          </dl>

          {voided && receipt.void_reason && (
            <p className="receipt-small receipt-void-reason">Voided: {receipt.void_reason}</p>
          )}

          <footer className="receipt-footer">
            <strong>Thank you – Siyabonga!</strong>
            <p className="receipt-small">Prices include VAT. Sample data – academic project.</p>
          </footer>
        </article>

        <div className="receipt-actions">
          <button type="button" className="receipt-print-btn" onClick={print}>Print</button>
          <button type="button" className="receipt-close-btn" onClick={onClose}>Close</button>
        </div>
      </div>
    </div>
  );
}

export default Receipt;
