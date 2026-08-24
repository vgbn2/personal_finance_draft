export function extractProposedOrdersPayload(payload: any): any[] {
  if (Array.isArray(payload)) return payload;
  if (payload && Array.isArray(payload.orders)) return payload.orders;
  if (payload && Array.isArray(payload.proposedOrders)) return payload.proposedOrders;
  return [];
}

export interface ProposedOrder {
  instrumentId: string;
  side: 'buy' | 'sell';
  quantity: number;
  price?: number;
  type: 'market' | 'limit';
}

export interface NormalizedProposedOrderResult {
  ok: boolean;
  index: number;
  errors: string[];
  order: ProposedOrder | null;
  preview: {
    instrumentId: string;
    side: string;
    quantity: number;
    type: string;
    price: number | null;
  };
}

export function normalizeProposedOrder(record: any, index = 0): NormalizedProposedOrderResult {
  const errors: string[] = [];
  const instrumentId = String(record?.instrumentId || record?.symbol || '').trim();
  const side = String(record?.side || '').trim().toLowerCase();
  const type = String(record?.type || 'market').trim().toLowerCase();
  const quantity = Number(record?.quantity ?? record?.qty ?? 0);
  const priceValue = record?.price !== undefined && record?.price !== null && record?.price !== ''
    ? Number(record.price)
    : undefined;
  const price = Number.isFinite(priceValue) ? priceValue : undefined;

  if (!instrumentId) errors.push('instrumentId missing');
  if (!['buy', 'sell'].includes(side)) errors.push('side must be buy or sell');
  if (!Number.isFinite(quantity) || quantity <= 0) errors.push('quantity must be positive');
  if (!['market', 'limit'].includes(type)) errors.push('type must be market or limit');
  if (type === 'limit' && (!Number.isFinite(price) || price! <= 0)) errors.push('limit orders require a positive price');

  return {
    ok: errors.length === 0,
    index,
    errors,
    order: errors.length === 0
      ? {
          instrumentId,
          side: side as 'buy' | 'sell',
          quantity,
          price,
          type: type as 'market' | 'limit',
        }
      : null,
    preview: {
      instrumentId,
      side,
      quantity,
      type,
      price: price ?? null,
    },
  };
}

export interface ValidateProposedOrdersResult {
  ok: boolean;
  total: number;
  orders: ProposedOrder[];
  errors: Array<{ index: number; errors: string[]; preview: any }>;
  preview: Array<{
    instrumentId: string;
    side: string;
    quantity: number;
    type: string;
    price: number | null;
  }>;
}

export function validateProposedOrdersPayload(payload: any): ValidateProposedOrdersResult {
  const rawOrders = extractProposedOrdersPayload(payload);
  const normalized: ProposedOrder[] = [];
  const errors: Array<{ index: number; errors: string[]; preview: any }> = [];

  rawOrders.forEach((record, index) => {
    const result = normalizeProposedOrder(record, index);
    if (result.ok && result.order) {
      normalized.push(result.order);
    } else {
      errors.push({ index, errors: result.errors, preview: result.preview });
    }
  });

  return {
    ok: errors.length === 0,
    total: rawOrders.length,
    orders: normalized,
    errors,
    preview: normalized.slice(0, 5).map((order) => ({
      instrumentId: order.instrumentId,
      side: order.side,
      quantity: order.quantity,
      type: order.type,
      price: order.price ?? null,
    })),
  };
}
