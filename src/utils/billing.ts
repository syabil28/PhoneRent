export function costFromDuration(hourlyRate: number, minutes: number): number {
  return Math.round((minutes / 60) * hourlyRate);
}

export function durationFromNominal(hourlyRate: number, amount: number): number {
  if (hourlyRate <= 0) return 0;
  return Math.round((amount / hourlyRate) * 60);
}

export function elapsedMinutes(startTime: number, now: number): number {
  return Math.max(0, (now - startTime) / 60000);
}

export function sessionElapsedMinutes(
  session: { status: string; accumulatedMinutes: number; currentPeriodStart: number | null },
  now: number
): number {
  if (session.status === 'active' && session.currentPeriodStart != null) {
    return session.accumulatedMinutes + elapsedMinutes(session.currentPeriodStart, now);
  }
  return session.accumulatedMinutes;
}

export function remainingMinutes(
  session: { status: string; accumulatedMinutes: number; currentPeriodStart: number | null; plannedMinutes: number | null },
  now: number
): number {
  const planned = session.plannedMinutes ?? 0;
  return planned - sessionElapsedMinutes(session, now);
}

export function estimatedEndTime(
  session: { status: string; accumulatedMinutes: number; currentPeriodStart: number | null; plannedMinutes: number | null },
  now: number
): number {
  return now + remainingMinutes(session, now) * 60000;
}

/**
 * Device swap: nominal (plannedAmount) never changes. The customer's agreed price is fixed.
 * What changes is how much time remains: the nominal not yet "spent" at the old rate is
 * converted into remaining minutes at the new device's rate.
 */
export function swapDeviceMinutes(
  session: {
    status: string;
    accumulatedMinutes: number;
    currentPeriodStart: number | null;
    plannedMinutes: number | null;
    plannedAmount: number | null;
    rateSnapshot: number;
  },
  newRate: number,
  now: number
): number {
  const planned = session.plannedMinutes ?? 0;
  const elapsed = Math.min(sessionElapsedMinutes(session, now), planned);
  const spent = costFromDuration(session.rateSnapshot, elapsed);
  const remainingNominal = Math.max(0, (session.plannedAmount ?? 0) - spent);
  return elapsed + durationFromNominal(newRate, remainingNominal);
}
