/* ENDOGYM STUDIO — datos demo */
(function () {
  const user = {
    name: 'Marta', last: 'García', initials: 'M',
    goal: 'Recomposición + control glucémico', goalShort: 'Recomposición',
    modality: 'Gimnasio', streak: 12, plan: 'Plan adaptativo · Semana 6',
    readiness: 82, sleep: 7.2, restHr: 54,
  };

  /* ---- Hoy: sesión de empuje (con vídeo por ejercicio) ---- */
  const todaySession = {
    title: 'Empuje · Fuerza', focus: 'Pecho, hombro y tríceps',
    durationMin: 52, intensity: 'Moderada-alta', readiness: 82, kcal: 410,
    primaryMuscles: ['Pecho', 'Hombro', 'Tríceps'],
    secondaryMuscles: ['Core', 'Antebrazo', 'Espalda alta'],
    list: [
      { name: 'Press banca con mancuernas', scheme: '4 × 8', load: '22 kg', tag: 'Principal', muscle: 'Pecho', dur: '0:48', hue: 55, done: true, yt: 'jrDDz7x1Dpo',
        cues: ['Escápulas retraídas y pecho alto', 'Baja en 2s hasta rozar el pecho', 'Empuja sin bloquear del todo el codo'] },
      { name: 'Press militar de pie', scheme: '4 × 10', load: '14 kg', tag: 'Principal', muscle: 'Hombro', dur: '0:52', hue: 232, done: true, yt: 'n_8dwMLPD8U',
        cues: ['Glúteos y core firmes', 'Barra/mancuernas sobre la coronilla', 'No arquees la zona lumbar'] },
      { name: 'Press inclinado en máquina', scheme: '3 × 12', load: 'Selecciona', tag: 'Accesorio', muscle: 'Pecho alto', dur: '0:41', hue: 18, done: false, yt: 'oTD5g77GgSA',
        cues: ['Banco a 30-45°', 'Recorrido completo y controlado', 'Aprieta arriba 1s'] },
      { name: 'Elevaciones laterales', scheme: '3 × 15', load: '6 kg', tag: 'Accesorio', muscle: 'Deltoides', dur: '0:36', hue: 300, done: false,
        cues: ['Codo ligeramente flexionado', 'Sube hasta la línea del hombro', 'Sin impulso de cadera'] },
      { name: 'Fondos asistidos', scheme: '3 × 10', load: 'Asistencia 20 kg', tag: 'Tríceps', muscle: 'Tríceps', dur: '0:44', hue: 162, done: false,
        cues: ['Pecho ligeramente adelante', 'Baja hasta 90° de codo', 'Hombros lejos de las orejas'] },
      { name: 'Extensión de tríceps en polea', scheme: '3 × 14', load: 'Selecciona', tag: 'Tríceps', muscle: 'Tríceps', dur: '0:38', hue: 78, done: false,
        cues: ['Codos pegados al cuerpo', 'Extiende del todo', 'Vuelve despacio'] },
    ],
  };

  const week = [
    { day: 'Lun', date: 2, focus: 'Empuje', tag: 'Pecho · Hombro · Tríceps', load: 0.82, today: true },
    { day: 'Mar', date: 3, focus: 'Pierna', tag: 'Cuádriceps · Glúteo', load: 0.9 },
    { day: 'Mié', date: 4, focus: 'Movilidad', tag: 'Cardio Z2 · 30 min', load: 0.35 },
    { day: 'Jue', date: 5, focus: 'Tracción', tag: 'Espalda · Bíceps', load: 0.78 },
    { day: 'Vie', date: 6, focus: 'Full body', tag: 'Fuerza general', load: 0.7 },
    { day: 'Sáb', date: 7, focus: 'Descanso activo', tag: 'Paseo · estiramientos', rest: true, load: 0.18 },
    { day: 'Dom', date: 8, focus: 'Descanso', tag: 'Recuperación total', rest: true, load: 0 },
  ];

  /* ---- Vídeos: feed Descubrir ---- */
  const discover = [
    { cat: 'Recomendado para ti', items: [
      { title: 'Técnica perfecta de press banca', author: 'Ignios Coaches', len: '6:24', tag: 'Técnica', hue: 55, views: '1,2 M', yt: 'MeyuOEimrC0' },
      { title: 'Calentamiento de hombro en 5 minutos', author: 'Movilidad Diaria', len: '5:10', tag: 'Movilidad', hue: 232, views: '840 K' },
      { title: 'Cómo progresar en fuerza sin lesionarte', author: 'Ciencia del Músculo', len: '11:38', tag: 'Guía', hue: 300, views: '2,1 M' },
    ]},
    { cat: 'Empuje · tu sesión de hoy', items: [
      { title: 'Press militar: errores comunes', author: 'Ignios Coaches', len: '7:02', tag: 'Técnica', hue: 18, views: '560 K', yt: 'KLT18ahosQw' },
      { title: 'Elevaciones laterales que sí funcionan', author: 'Hipertrofia Lab', len: '4:55', tag: 'Accesorios', hue: 162, views: '930 K' },
      { title: 'Fondos: del asistido al lastrado', author: 'Calistenia Pro', len: '9:14', tag: 'Progresión', hue: 78, views: '410 K' },
    ]},
    { cat: 'Recuperación y movilidad', items: [
      { title: 'Rutina de estiramientos post-entreno', author: 'Movilidad Diaria', len: '12:30', tag: 'Recuperación', hue: 232, views: '3,4 M' },
      { title: 'Respiración para bajar pulsaciones', author: 'Mente y Cuerpo', len: '8:20', tag: 'Bienestar', hue: 300, views: '1,8 M' },
      { title: 'Movilidad de cadera para sentadilla', author: 'Ignios Coaches', len: '6:48', tag: 'Movilidad', hue: 55, views: '720 K' },
    ]},
  ];

  /* ---- Nutrición ---- */
  const macroTargets = { kcal: 1980, protein: 145, carbs: 190, fat: 62 };
  const macroEaten = { kcal: 1240, protein: 96, carbs: 118, fat: 38 };

  const nutritionDays = [
    { day: 'Lun', date: 2, kcal: 1980, today: true },
    { day: 'Mar', date: 3, kcal: 2020 },
    { day: 'Mié', date: 4, kcal: 1880 },
    { day: 'Jue', date: 5, kcal: 1960 },
    { day: 'Vie', date: 6, kcal: 2040 },
    { day: 'Sáb', date: 7, kcal: 2150 },
    { day: 'Dom', date: 8, kcal: 1900 },
  ];

  const meals = [
    { slot: 'Desayuno', emoji: '🥣', dish: 'Yogur griego, avena y frutos rojos', hue: 55,
      kcal: 420, p: 32, c: 48, f: 11, gl: 9, ii: 38, glClass: 'good', time: '08:00', done: true, mins: 5,
      ingredients: ['Yogur griego 200 g', 'Avena 40 g', 'Frutos rojos 80 g', 'Semillas de chía 10 g', 'Canela'],
      steps: ['Mezcla el yogur con la avena y deja reposar 5 min.', 'Añade los frutos rojos y la chía por encima.', 'Espolvorea canela al gusto.'],
      serving: 'Un bol grande. Ideal 60–90 min antes de entrenar.' },
    { slot: 'Comida', emoji: '🍗', dish: 'Pollo, arroz integral y verduras al wok', hue: 78,
      kcal: 540, p: 44, c: 56, f: 13, gl: 16, ii: 52, glClass: 'mid', time: '14:00', done: true, mins: 20,
      ingredients: ['Pechuga de pollo 160 g', 'Arroz integral 60 g', 'Pimiento y brócoli 150 g', 'Aceite de oliva 10 ml', 'Salsa de soja baja en sal'],
      steps: ['Cocina el arroz integral según paquete.', 'Saltea el pollo en wok 6–7 min.', 'Añade las verduras y la salsa, saltea 4 min.', 'Sirve sobre el arroz.'],
      serving: 'Plato único. Reparte en 2 táperes para batch cooking.' },
    { slot: 'Merienda', emoji: '🍎', dish: 'Manzana y crema de cacahuete', hue: 18,
      kcal: 220, p: 8, c: 26, f: 10, gl: 7, ii: 30, glClass: 'good', time: '17:30', done: false, mins: 3,
      ingredients: ['Manzana 1 ud', 'Crema de cacahuete 15 g'],
      steps: ['Corta la manzana en gajos.', 'Acompaña con la crema de cacahuete.'],
      serving: 'Snack pre-entreno ligero.' },
    { slot: 'Cena', emoji: '🐟', dish: 'Salmón al horno con boniato y espárragos', hue: 162,
      kcal: 600, p: 41, c: 40, f: 28, gl: 12, ii: 44, glClass: 'good', time: '21:00', done: false, mins: 30,
      ingredients: ['Salmón 170 g', 'Boniato 180 g', 'Espárragos 120 g', 'Aceite de oliva 12 ml', 'Limón y eneldo'],
      steps: ['Precalienta el horno a 200°C.', 'Asa el boniato en dados 20 min.', 'Añade salmón y espárragos, hornea 12 min.', 'Termina con limón y eneldo.'],
      serving: 'Cena rica en omega-3. Carga glucémica baja para la noche.' },
  ];

  const glycemic = {
    dayLoad: 44, dayClass: 'good', insulinIndex: 41,
    note: 'Carga glucémica del día baja-moderada. Tu cena mantiene la curva plana antes de dormir.',
    points: [28, 62, 48, 70, 52, 38, 44],
  };

  const shopping = [
    { cat: 'Proteína', icon: '🥩', items: [
      { name: 'Pechuga de pollo', qty: '500 g' }, { name: 'Salmón fresco', qty: '350 g' },
      { name: 'Yogur griego natural', qty: '1 kg', checked: true }, { name: 'Huevos', qty: '12 ud' } ] },
    { cat: 'Verdura y fruta', icon: '🥦', items: [
      { name: 'Brócoli', qty: '2 ud' }, { name: 'Espárragos', qty: '1 manojo' },
      { name: 'Manzanas', qty: '6 ud', checked: true }, { name: 'Frutos rojos', qty: '500 g' },
      { name: 'Pimiento rojo', qty: '3 ud' } ] },
    { cat: 'Cereales y otros', icon: '🌾', items: [
      { name: 'Arroz integral', qty: '1 kg' }, { name: 'Avena', qty: '500 g', checked: true },
      { name: 'Boniato', qty: '1 kg' }, { name: 'Crema de cacahuete', qty: '1 bote' } ] },
  ];

  const batch = [
    { title: 'Cocina la base de proteína', desc: 'Asa todo el pollo y el salmón de una vez. Guarda en 4 táperes de 160 g.', time: '25 min', day: 'Domingo', emoji: '🍗' },
    { title: 'Prepara los carbohidratos', desc: 'Cuece 240 g de arroz integral y asa el boniato. Reparte en raciones.', time: '30 min', day: 'Domingo', emoji: '🍚' },
    { title: 'Corta y lava la verdura', desc: 'Brócoli, espárragos y pimiento listos para saltear toda la semana.', time: '15 min', day: 'Domingo', emoji: '🥦' },
    { title: 'Monta los desayunos', desc: 'Deja 3 botes de avena con yogur en la nevera (overnight oats).', time: '10 min', day: 'Lun-Mié', emoji: '🥣' },
  ];

  /* ---- Biblioteca de ejercicios (con vídeo) ---- */
  const library = [
    { name: 'Press banca mancuernas', muscle: 'Pecho', level: 'Intermedio', equip: 'Mancuernas', len: '0:48', hue: 55, yt: 'jrDDz7x1Dpo' },
    { name: 'Sentadilla goblet', muscle: 'Cuádriceps', level: 'Base', equip: 'Mancuerna', len: '0:52', hue: 162 },
    { name: 'Remo con barra', muscle: 'Dorsales', level: 'Intermedio', equip: 'Barra', len: '0:44', hue: 232 },
    { name: 'Peso muerto rumano', muscle: 'Isquios', level: 'Avanzado', equip: 'Barra', len: '0:58', hue: 300 },
    { name: 'Press militar', muscle: 'Hombro', level: 'Intermedio', equip: 'Barra', len: '0:50', hue: 18, yt: 'n_8dwMLPD8U' },
    { name: 'Zancadas', muscle: 'Glúteo', level: 'Base', equip: 'Mancuernas', len: '0:42', hue: 78 },
    { name: 'Plancha', muscle: 'Core', level: 'Base', equip: 'Peso corporal', len: '0:36', hue: 162 },
    { name: 'Curl de bíceps', muscle: 'Bíceps', level: 'Base', equip: 'Mancuernas', len: '0:34', hue: 55 },
  ];

  /* ---- Progreso (data-driven) ---- */
  const progress = {
    weightSeries: [76.4, 76.1, 75.8, 75.9, 75.4, 75.1, 74.8],
    weightNow: 74.8, weightDelta6w: -1.6, weightDeltaWk: -0.3,
    adherence: 82, volumeWk: 3.8, sessionsDone: 2, sessionsPlan: 5,
    strain: [6.2, 8.4, 3.1, 7.8, 7.0, 2.4, 0],
    recovery: 74,
    muscleVolume: [
      { m: 'Pecho', v: 0.86 }, { m: 'Espalda', v: 0.72 }, { m: 'Pierna', v: 0.91 },
      { m: 'Hombro', v: 0.64 }, { m: 'Brazo', v: 0.55 }, { m: 'Core', v: 0.7 },
    ],
    pr: [
      { lift: 'Press banca', val: '24 kg × 8', delta: '+2 kg' },
      { lift: 'Peso muerto', val: '90 kg × 5', delta: '+5 kg' },
      { lift: 'Sentadilla', val: '70 kg × 6', delta: '+2,5 kg' },
    ],
  };

  window.STUDIO = {
    user, todaySession, week, discover, macroTargets, macroEaten,
    nutritionDays, meals, glycemic, shopping, batch, library, progress,
  };
})();
