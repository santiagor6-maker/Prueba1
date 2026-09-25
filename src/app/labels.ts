import type { TxType } from '../domain/types.ts';

export const TYPE_LABELS: Record<TxType, string> = {
  BUY: 'Compra',
  SELL: 'Venta',
  DIVIDEND: 'Dividendo',
  INTEREST: 'Interés',
  DEPOSIT: 'Depósito',
  WITHDRAWAL: 'Retiro',
  TRANSFER_OUT: 'Transferencia enviada',
  TRANSFER_IN: 'Transferencia recibida',
  FEE: 'Comisión',
  TAX: 'Impuesto',
  WRITE_OFF: 'Baja (pérdida total)',
  CAPITAL_CALL: 'Cuota pagada (inmueble)',
  COMMITMENT: 'Compromiso de compra (precio total)',
  VALUATION: 'Valor de mercado (manual)',
};
