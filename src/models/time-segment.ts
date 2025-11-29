/**
 * Time Segment Model
 *
 * Represents a time interval between two key state transition points.
 */

import type { MREvent } from './mr-event.js';

/**
 * MR lifecycle phases for high-level time analysis
 */
export enum Phase {
  DEV = 'Dev',           // Development: MR Created → MR Ready
  WAIT = 'Wait',         // Wait for Review: MR Ready → First Review (after MR Ready)
  REVIEW = 'Review',     // Review: First Review → Approved (or Current if not approved)
  MERGE = 'Merge',       // Merge: Approved → Merged
}

/**
 * Key states in MR lifecycle for time segment analysis
 */
export enum KeyState {
  MR_CREATED = 'MR Created',
  MARKED_AS_READY = 'Marked as Ready',
  FIRST_COMMIT = 'Code Updated',
  FIRST_AI_REVIEW = 'First AI Review',
  FIRST_HUMAN_REVIEW = 'First Human Review',
  APPROVED = 'Approved',
  MERGED = 'Merged',
  CURRENT = 'Current',  // For unmerged MRs
}

/**
 * Time Segment - represents time between two key states
 */
export interface TimeSegment {
  from: KeyState;              // Starting state
  to: KeyState;                // Ending state
  fromEvent: MREvent;          // Starting event
  toEvent: MREvent;            // Ending event
  durationSeconds: number;     // Duration in seconds
  percentage: number;          // Percentage of total cycle time (0-100)
}

/**
 * Phase Segment - represents a high-level phase in MR lifecycle
 */
export interface PhaseSegment {
  phase: Phase;                // Phase name
  durationSeconds: number;     // Duration in seconds
  percentage: number;          // Percentage of total cycle time (0-100)
  fromEvent?: MREvent;         // Starting event (optional for missing phases)
  toEvent?: MREvent;           // Ending event (optional for missing phases)
}

/**
 * Validates a time segment
 */
export function validateTimeSegment(segment: TimeSegment): boolean {
  // fromEvent must be before toEvent
  if (segment.fromEvent.timestamp >= segment.toEvent.timestamp) {
    return false;
  }

  // Duration must be non-negative
  if (segment.durationSeconds < 0) {
    return false;
  }

  // Percentage must be in valid range
  if (segment.percentage < 0 || segment.percentage > 100) {
    return false;
  }

  // Duration should match timestamp difference (with tolerance for floating point)
  const expectedDuration =
    (segment.toEvent.timestamp.getTime() - segment.fromEvent.timestamp.getTime()) / 1000;
  const tolerance = 0.1; // 0.1 second tolerance

  if (Math.abs(segment.durationSeconds - expectedDuration) > tolerance) {
    return false;
  }

  return true;
}

/**
 * Validates that all segments' percentages sum to 100% (within tolerance)
 */
export function validateSegmentPercentages(
  segments: TimeSegment[],
  tolerance: number = 1.0
): boolean {
  if (segments.length === 0) {
    return true;
  }

  const totalPercentage = segments.reduce((sum, segment) => sum + segment.percentage, 0);

  return Math.abs(totalPercentage - 100) <= tolerance;
}

/**
 * Calculates percentage of a duration relative to total cycle time
 */
export function calculatePercentage(durationSeconds: number, totalCycleTime: number): number {
  if (totalCycleTime === 0) {
    return 0;
  }

  return (durationSeconds / totalCycleTime) * 100;
}
