import { describe, expect, it } from 'vitest';
import { OrderStatus } from '../types/types';
import { canTransitionOrderStatus, getAllowedOrderStatusTransitions } from './orderStatusService';

describe('orderStatusService', () => {
  it('allows same status transitions for idempotent updates', () => {
    expect(canTransitionOrderStatus(OrderStatus.PENDING_PAYMENT, OrderStatus.PENDING_PAYMENT)).toBe(true);
  });

  it('allows valid payment transition path', () => {
    expect(
      canTransitionOrderStatus(OrderStatus.PENDING_ADMIN_CONFIRMATION, OrderStatus.PENDING_PAYMENT)
    ).toBe(true);
    expect(
      canTransitionOrderStatus(OrderStatus.PENDING_PAYMENT, OrderStatus.AWAITING_CONFIRMATION)
    ).toBe(true);
    expect(
      canTransitionOrderStatus(OrderStatus.AWAITING_CONFIRMATION, OrderStatus.PAYMENT_CONFIRMED)
    ).toBe(true);
    expect(
      canTransitionOrderStatus(OrderStatus.PAYMENT_CONFIRMED, OrderStatus.PROCESSING)
    ).toBe(true);
  });

  it('blocks invalid backward transition from delivered state', () => {
    expect(canTransitionOrderStatus(OrderStatus.DELIVERED, OrderStatus.PROCESSING)).toBe(false);
  });

  it('returns configured allowed transitions', () => {
    const transitions = getAllowedOrderStatusTransitions(OrderStatus.OUT_FOR_DELIVERY);
    expect(transitions).toEqual([
      OrderStatus.IN_TRANSIT,
      OrderStatus.DELIVERED,
      OrderStatus.CANCELLED,
    ]);
  });

  it('returns empty transitions for unknown status values', () => {
    expect(getAllowedOrderStatusTransitions('NOT_A_REAL_STATUS')).toEqual([]);
    expect(canTransitionOrderStatus('NOT_A_REAL_STATUS', OrderStatus.PENDING_ADMIN_CONFIRMATION)).toBe(false);
  });

  it('blocks transitions from terminal states (COMPLETED, REFUNDED)', () => {
    expect(canTransitionOrderStatus(OrderStatus.COMPLETED, OrderStatus.CANCELLED)).toBe(false);
    expect(canTransitionOrderStatus(OrderStatus.REFUNDED, OrderStatus.DELIVERED)).toBe(false);
    expect(canTransitionOrderStatus(OrderStatus.CANCELLED, OrderStatus.PENDING_ADMIN_CONFIRMATION)).toBe(false);
    expect(getAllowedOrderStatusTransitions(OrderStatus.COMPLETED)).toEqual([]);
    expect(getAllowedOrderStatusTransitions(OrderStatus.REFUNDED)).toEqual([]);
  });

  it('allows cancellation from most active states', () => {
    const cancellableStates = [
      OrderStatus.PENDING_ADMIN_CONFIRMATION,
      OrderStatus.CONFIRMED,
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.AWAITING_CONFIRMATION,
      OrderStatus.PAYMENT_CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.IN_TRANSIT,
    ];
    for (const state of cancellableStates) {
      expect(canTransitionOrderStatus(state, OrderStatus.CANCELLED)).toBe(true);
    }
  });

  it('returns a copy (not reference) from getAllowedOrderStatusTransitions', () => {
    const t1 = getAllowedOrderStatusTransitions(OrderStatus.PENDING_ADMIN_CONFIRMATION);
    const t2 = getAllowedOrderStatusTransitions(OrderStatus.PENDING_ADMIN_CONFIRMATION);
    expect(t1).toEqual(t2);
    expect(t1).not.toBe(t2);
  });

  it('validates full delivery flow', () => {
    const flow = [
      OrderStatus.PENDING_ADMIN_CONFIRMATION,
      OrderStatus.CONFIRMED,
      OrderStatus.PENDING_PAYMENT,
      OrderStatus.AWAITING_CONFIRMATION,
      OrderStatus.PAYMENT_CONFIRMED,
      OrderStatus.PROCESSING,
      OrderStatus.READY_FOR_PICKUP,
      OrderStatus.PICKUP_SCHEDULED,
      OrderStatus.PICKED_UP,
      OrderStatus.IN_TRANSIT,
      OrderStatus.DELIVERED,
      OrderStatus.COMPLETED,
    ];
    for (let i = 0; i < flow.length - 1; i++) {
      expect(canTransitionOrderStatus(flow[i], flow[i + 1])).toBe(true);
    }
  });
});
