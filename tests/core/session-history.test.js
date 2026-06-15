import { describe, it, expect } from 'vitest';
import {
  collapseWorkoutsByDay,
  countDoneSessions,
  findDaySession,
  isWorkoutDone,
} from '../../src/core/sessionHistory.js';

const checkin = {
  id: 'daily-2026-06-15',
  source: 'daily_checkin',
  performedAt: '2026-06-15T12:00:00.000Z',
  completed: true,
  sessionRpe: 6,
  fatigue: 4,
  sleepHours: 7.5,
  symptoms: { dyspnea: false, jointPain: false, dizziness: false, tachycardia: false },
  hasAlarmSymptoms: false,
  exercises: [],
};

const manual = {
  id: 'abc123',
  source: 'manual',
  performedAt: '2026-06-15T12:00:00.000Z',
  completed: true,
  sessionRpe: 8,
  durationMinutes: 60,
  exercises: [
    { id: 'gym-back-squat', name: 'Sentadilla', weightKg: 100, reps: 5, sets: 3 },
    { id: 'cal-pushup', name: 'Flexiones', weightKg: null, reps: 12, sets: 3 }, // peso corporal
  ],
};

const strava = {
  id: 'strava-999',
  source: 'strava',
  performedAt: '2026-06-15T18:00:00.000Z',
  completed: true,
  distanceKm: 8.2,
  avgHeartRate: 150,
  durationMinutes: 45,
  exercises: [],
};

describe('sessionHistory: fusión por día', () => {
  it('colapsa check-in + manual + Strava del mismo día en UNA sesión', () => {
    const sessions = collapseWorkoutsByDay([checkin, manual, strava]);
    expect(sessions).toHaveLength(1);
    const s = sessions[0];
    expect(s.sources.sort()).toEqual(['daily_checkin', 'manual', 'strava']);
    expect(s.merged).toBe(true);
    // info más rica = registro manual (más contenido) → id base
    expect(s.id).toBe('abc123');
    expect(s.workoutId).toBe('abc123');
    // bienestar del check-in, métricas de Strava, RPE del registro de sesión
    expect(s.fatigue).toBe(4);
    expect(s.sleepHours).toBe(7.5);
    expect(s.distanceKm).toBe(8.2);
    expect(s.avgHeartRate).toBe(150);
    expect(s.sessionRpe).toBe(8);
  });

  it('cuenta 1 sesión por día, no 1 por documento', () => {
    expect(countDoneSessions([checkin, manual, strava])).toBe(1);
    const otherDay = { ...manual, id: 'def456', performedAt: '2026-06-16T12:00:00.000Z' };
    expect(countDoneSessions([checkin, manual, strava, otherDay])).toBe(2);
  });

  it('conserva ejercicios sin peso (peso corporal)', () => {
    const [s] = collapseWorkoutsByDay([manual]);
    const names = s.exercises.map((e) => e.name);
    expect(names).toContain('Flexiones');
  });

  it('excluye el check-in no completado', () => {
    const skipped = { ...checkin, completed: false };
    expect(isWorkoutDone(skipped)).toBe(false);
    expect(collapseWorkoutsByDay([skipped])).toHaveLength(0);
    expect(countDoneSessions([skipped])).toBe(0);
  });

  it('findDaySession devuelve la sesión del día o null', () => {
    expect(findDaySession([checkin, manual], '2026-06-15')?.id).toBe('abc123');
    expect(findDaySession([checkin, manual], '2026-06-14')).toBeNull();
  });
});
