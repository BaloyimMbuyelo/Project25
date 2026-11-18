// Formatting and arithmetic helpers shared by the services.

// Money and stock quantities are handled in integer hundredths so that
// DECIMAL(10,2) values never pick up floating-point errors.
const toCents = (value) => Math.round(Number(value) * 100);
const fromCents = (cents) => Number((cents / 100).toFixed(2));

// Display references: UB-0105, RS-0240, RC-000512 (System Design 4.5.4)
const formatRef = (prefix, id, width) => `${prefix}-${String(id).padStart(width, '0')}`;
const orderRef = (orderId) => formatRef('UB', orderId, 4);

// Accept "UB-0105", "ub-105" or "105" and return the numeric order id.
function parseOrderRef(value) {
    const match = /^(?:UB-?)?0*(\d{1,9})$/i.exec(String(value ?? '').trim());
    return match ? Number(match[1]) : null;
}

// Prices include 15% VAT, shown separately on receipts (System Design 4.2.5).
function vatBreakdown(totalCents, rate = 0.15) {
    const exclusiveCents = Math.round(totalCents / (1 + rate));
    return {
        subtotal_excl_vat: fromCents(exclusiveCents),
        vat: fromCents(totalCents - exclusiveCents),
        total: fromCents(totalCents)
    };
}

// Local (server) date as YYYY-MM-DD and time as HH:MM
const pad = (n) => String(n).padStart(2, '0');
const localDate = (d = new Date()) => `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;

function addDays(dateString, days) {
    const d = new Date(`${dateString}T00:00:00`);
    d.setDate(d.getDate() + days);
    return localDate(d);
}

const timeToMinutes = (hhmm) => {
    const [h, m] = hhmm.split(':').map(Number);
    return h * 60 + m;
};
const minutesToTime = (minutes) => `${pad(Math.floor(minutes / 60))}:${pad(minutes % 60)}`;

module.exports = {
    toCents,
    fromCents,
    formatRef,
    orderRef,
    parseOrderRef,
    vatBreakdown,
    localDate,
    addDays,
    timeToMinutes,
    minutesToTime
};
