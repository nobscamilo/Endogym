'use client';

import { useMemo, useState } from 'react';

const devHeaders = {
  'content-type': 'application/json',
  'x-dev-user-id': 'demo-athlete',
};

export default function DashboardPage() {
  const [mealStatus, setMealStatus] = useState('');
  const [workoutStatus, setWorkoutStatus] = useState('');
  const [analysisStatus, setAnalysisStatus] = useState('');

  const todayIso = useMemo(() => new Date().toISOString(), []);

  async function createMealDemo() {
    setMealStatus('Guardando comida...');
    const response = await fetch('/api/meals', {
      method: 'POST',
      headers: devHeaders,
      body: JSON.stringify({
        eatenAt: todayIso,
        foods: [{ name: 'Avena + yogur griego', portion: '1 bowl' }],
        totals: { calories: 430, proteinGrams: 28, carbsGrams: 51, fatGrams: 11, glycemicLoad: 14.6 },
      }),
    });
    const data = await response.json();
    setMealStatus(response.ok ? `✅ Comida creada (${data.meal.id})` : `❌ ${data.error}`);
  }

  async function createWorkoutDemo() {
    setWorkoutStatus('Guardando sesión...');
    const response = await fetch('/api/workouts', {
      method: 'POST',
      headers: devHeaders,
      body: JSON.stringify({
        title: 'Push Day',
        mode: 'gym',
        performedAt: todayIso,
        durationMinutes: 60,
        exercises: ['Press banca', 'Press militar', 'Fondos'],
      }),
    });
    const data = await response.json();
    setWorkoutStatus(response.ok ? `✅ Rutina creada (${data.workout.id})` : `❌ ${data.error}`);
  }

  async function analyzePlateDemo() {
    setAnalysisStatus('Analizando plato...');
    const fakeImage = btoa('mock-image');
    const response = await fetch('/api/analyze-plate', {
      method: 'POST',
      headers: devHeaders,
      body: JSON.stringify({
        imageBase64: fakeImage,
        context: { dish: 'Arroz con pollo y ensalada' },
      }),
    });
    const data = await response.json();
    setAnalysisStatus(response.ok ? `✅ GL estimada ${data.analysis.totals.glycemicLoad}` : `❌ ${data.error}`);
  }

  return (
    <main className="container">
      <section className="hero">
        <h1>Endogym</h1>
        <p>Dashboard inicial para nutrición, glucemia, entrenamientos y análisis IA.</p>
      </section>

      <section className="grid">
        <article className="card">
          <h2>Comidas</h2>
          <p>Registra comidas manuales con macros y carga glucémica.</p>
          <button onClick={createMealDemo}>Registrar comida demo</button>
          <small>{mealStatus}</small>
        </article>

        <article className="card">
          <h2>Entrenamiento</h2>
          <p>Guarda sesiones de gimnasio o en casa.</p>
          <button onClick={createWorkoutDemo}>Registrar rutina demo</button>
          <small>{workoutStatus}</small>
        </article>

        <article className="card">
          <h2>Análisis IA</h2>
          <p>Sube foto de plato y estima macros, GL e índice insulínico.</p>
          <button onClick={analyzePlateDemo}>Analizar plato demo</button>
          <small>{analysisStatus}</small>
        </article>
      </section>
    </main>
  );
}
