function normalizeList(value) {
  if (Array.isArray(value)) {
    return value
      .map((item) => String(item || '').trim().toLowerCase())
      .filter(Boolean);
  }
  if (typeof value === 'string') {
    return value
      .split(',')
      .map((item) => item.trim().toLowerCase())
      .filter(Boolean);
  }
  return [];
}

function parseNutritionPreferences(profile = {}) {
  const pref = profile.nutritionPreferences || {};
  const dietaryPattern = ['omnivore', 'vegetarian', 'vegan'].includes(pref.dietaryPattern)
    ? pref.dietaryPattern
    : 'omnivore';

  const allergies = normalizeList(pref.allergies);
  const intolerances = normalizeList(pref.intolerances);
  const dislikes = normalizeList(pref.dislikedFoods);
  const blocked = new Set([...allergies, ...intolerances, ...dislikes]);

  return {
    dietaryPattern,
    allergies,
    intolerances,
    dislikes,
    blocked,
  };
}

const BANK = {
  omnivore: {
    breakfast: [
      {
        dish: 'Avena con yogur griego, frutos rojos y nueces',
        ingredients: ['avena', 'yogur griego natural', 'frutos rojos', 'nueces', 'canela'],
        instructions: 'Mezclar y dejar reposar 10 minutos o preparar overnight.',
      },
      {
        dish: 'Tostadas integrales con huevo revuelto y aguacate',
        ingredients: ['pan integral', 'huevos', 'aguacate', 'tomate', 'aceite de oliva'],
        instructions: 'Cocinar huevo a fuego medio y servir con pan tostado.',
      },
      {
        dish: 'Batido de proteína con plátano y crema de cacahuete',
        ingredients: ['proteína en polvo', 'plátano', 'leche o bebida vegetal', 'crema de cacahuete'],
        instructions: 'Batir todo y ajustar textura con agua fría.',
      },
    ],
    lunch: [
      {
        dish: 'Pechuga de pollo con arroz integral y verduras',
        ingredients: ['pollo', 'arroz integral', 'brócoli', 'zanahoria', 'aceite de oliva'],
        instructions: 'Plancha para pollo, arroz cocido y verduras salteadas.',
      },
      {
        dish: 'Salmón al horno con patata y ensalada',
        ingredients: ['salmón', 'patata', 'lechuga', 'pepino', 'aceite de oliva'],
        instructions: 'Hornear salmón y patata; acompañar con ensalada fresca.',
      },
      {
        dish: 'Pavo salteado con quinoa y verduras',
        ingredients: ['pavo', 'quinoa', 'pimiento', 'calabacín', 'ajo'],
        instructions: 'Cocinar quinoa aparte y saltear pavo + verduras.',
      },
    ],
    snack: [
      {
        dish: 'Yogur natural con fruta y semillas',
        ingredients: ['yogur natural', 'fruta', 'semillas de chía'],
        instructions: 'Servir en bol; opción de canela.',
      },
      {
        dish: 'Queso fresco con fruta y frutos secos',
        ingredients: ['queso fresco', 'manzana', 'almendras'],
        instructions: 'Combinar porciones moderadas y ajustar a objetivo calórico.',
      },
      {
        dish: 'Sandwich integral de pavo',
        ingredients: ['pan integral', 'pavo', 'queso bajo grasa', 'rúcula'],
        instructions: 'Montar sandwich y acompañar con agua.',
      },
    ],
    dinner: [
      {
        dish: 'Tortilla de verduras + ensalada',
        ingredients: ['huevos', 'espinacas', 'champiñones', 'tomate', 'aceite de oliva'],
        instructions: 'Tortilla con verduras y ensalada de guarnición.',
      },
      {
        dish: 'Merluza con verduras al vapor y boniato',
        ingredients: ['merluza', 'boniato', 'judías verdes', 'limón'],
        instructions: 'Cocinar al vapor y condimentar suave.',
      },
      {
        dish: 'Ensalada completa con atún y legumbres',
        ingredients: ['atún', 'garbanzos', 'lechuga', 'pepino', 'aceite de oliva'],
        instructions: 'Mezclar y aliñar al momento.',
      },
    ],
  },
  vegetarian: {
    breakfast: [
      {
        dish: 'Avena proteica con bebida vegetal y frutos del bosque',
        ingredients: ['avena', 'bebida vegetal', 'proteína vegetal', 'frutos del bosque'],
        instructions: 'Cocer o hidratar overnight.',
      },
      {
        dish: 'Tostadas con hummus y tomate',
        ingredients: ['pan integral', 'hummus', 'tomate', 'semillas'],
        instructions: 'Untar hummus y añadir tomate fresco.',
      },
      {
        dish: 'Yogur vegetal con granola casera',
        ingredients: ['yogur vegetal', 'granola sin azúcar', 'fruta'],
        instructions: 'Servir frío y ajustar porción.',
      },
    ],
    lunch: [
      {
        dish: 'Bowl de quinoa, tofu y verduras',
        ingredients: ['quinoa', 'tofu', 'brocoli', 'zanahoria', 'aceite de oliva'],
        instructions: 'Marinar tofu y saltear con verduras.',
      },
      {
        dish: 'Lentejas estofadas con verduras',
        ingredients: ['lentejas', 'cebolla', 'pimiento', 'zanahoria', 'laurel'],
        instructions: 'Cocción lenta y ración con ensalada.',
      },
      {
        dish: 'Pasta integral con soja texturizada y tomate',
        ingredients: ['pasta integral', 'soja texturizada', 'tomate triturado', 'ajo'],
        instructions: 'Hidratar soja y mezclar con salsa de tomate casera.',
      },
    ],
    snack: [
      {
        dish: 'Fruta + frutos secos',
        ingredients: ['fruta de temporada', 'nueces o almendras'],
        instructions: 'Controlar porción de frutos secos.',
      },
      {
        dish: 'Yogur vegetal con chía',
        ingredients: ['yogur vegetal', 'semillas de chía', 'canela'],
        instructions: 'Combinar y servir.',
      },
      {
        dish: 'Batido vegetal proteico',
        ingredients: ['proteína vegetal', 'bebida vegetal', 'fruta'],
        instructions: 'Batir y consumir tras entrenamiento si aplica.',
      },
    ],
    dinner: [
      {
        dish: 'Revuelto de tofu con verduras',
        ingredients: ['tofu', 'espinacas', 'cebolla', 'cúrcuma'],
        instructions: 'Saltear tofu desmenuzado y verduras.',
      },
      {
        dish: 'Crema de calabaza + ensalada con legumbres',
        ingredients: ['calabaza', 'garbanzos', 'lechuga', 'pepino'],
        instructions: 'Preparar crema suave y ensalada aparte.',
      },
      {
        dish: 'Wrap integral de tempeh',
        ingredients: ['tortilla integral', 'tempeh', 'verduras', 'aguacate'],
        instructions: 'Plancha tempeh y montar wrap.',
      },
    ],
  },
  vegan: {
    breakfast: [
      {
        dish: 'Porridge de avena con proteína vegetal y frutos rojos',
        ingredients: ['avena', 'bebida vegetal', 'proteína vegetal', 'frutos rojos'],
        instructions: 'Cocer en bebida vegetal y añadir toppings.',
      },
      {
        dish: 'Tostadas de crema de cacahuete y plátano',
        ingredients: ['pan integral', 'crema de cacahuete', 'plátano'],
        instructions: 'Untar y servir con canela opcional.',
      },
      {
        dish: 'Chia pudding con fruta',
        ingredients: ['semillas de chía', 'bebida vegetal', 'fruta'],
        instructions: 'Reposar 8h en frío.',
      },
    ],
    lunch: [
      {
        dish: 'Bowl de arroz integral, garbanzos y verduras',
        ingredients: ['arroz integral', 'garbanzos', 'pimiento', 'brocoli', 'aceite de oliva'],
        instructions: 'Combinar cereales, legumbres y verduras salteadas.',
      },
      {
        dish: 'Tofu teriyaki casero con quinoa',
        ingredients: ['tofu', 'quinoa', 'zanahoria', 'calabacín', 'soja baja sodio'],
        instructions: 'Dorar tofu y añadir salsa ligera.',
      },
      {
        dish: 'Pasta integral con boloñesa vegetal',
        ingredients: ['pasta integral', 'soja texturizada', 'tomate', 'cebolla'],
        instructions: 'Hidratar soja y cocinar salsa base tomate.',
      },
    ],
    snack: [
      {
        dish: 'Hummus con crudités',
        ingredients: ['hummus', 'zanahoria', 'pepino', 'apio'],
        instructions: 'Porción medida de hummus.',
      },
      {
        dish: 'Batido vegetal post-entreno',
        ingredients: ['proteína vegetal', 'bebida vegetal', 'avena fina'],
        instructions: 'Batir y ajustar densidad.',
      },
      {
        dish: 'Fruta + frutos secos',
        ingredients: ['fruta', 'nueces'],
        instructions: 'Priorizar fruta entera.',
      },
    ],
    dinner: [
      {
        dish: 'Salteado de tempeh con verduras',
        ingredients: ['tempeh', 'brócoli', 'setas', 'pimiento'],
        instructions: 'Cocinar a fuego medio con poco aceite.',
      },
      {
        dish: 'Crema de verduras + ensalada de legumbres',
        ingredients: ['calabacín', 'puerro', 'lentejas', 'lechuga'],
        instructions: 'Preparar crema y ensalada complementaria.',
      },
      {
        dish: 'Tacos de tofu y frijoles',
        ingredients: ['tofu', 'frijoles', 'tortilla de maíz', 'verduras'],
        instructions: 'Montar tacos con verduras frescas.',
      },
    ],
  },
};

function includesRestrictedWords(option, blockedWords) {
  const haystack = `${option.dish} ${option.ingredients.join(' ')}`.toLowerCase();
  return Array.from(blockedWords).some((word) => {
    const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
    return new RegExp(`\\b${escaped}\\b`, 'i').test(haystack);
  });
}

function resolveMealType(slot, index, total) {
  const normalized = (slot || '').toLowerCase();
  if (normalized.includes('desayuno')) return 'breakfast';
  if (normalized.includes('cena')) return 'dinner';
  if (normalized.includes('comida')) return 'lunch';
  if (normalized.includes('merienda')) return 'snack';
  if (normalized.includes('pre') || normalized.includes('post')) return 'snack';
  if (index === 0) return 'breakfast';
  if (index === total - 1) return 'dinner';
  if (index === 1) return 'lunch';
  return 'snack';
}

function hashSeed(seed) {
  let h = seed ^ 0x9e3779b9;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b);
  h = Math.imul(h ^ (h >>> 13), 0x45d9f3b);
  return (h ^ (h >>> 16)) >>> 0;
}

function chooseOption(type, pattern, restrictions, dayIndex, mealIndex) {
  const bank = BANK[pattern] || BANK.omnivore;
  const options = (bank[type] || []).filter((option) => !includesRestrictedWords(option, restrictions.blocked));
  if (!options.length) return null;
  const seed = hashSeed(dayIndex * 97 + mealIndex * 13 + type.length);
  return options[seed % options.length];
}

function estimatePrepTimeMinutes(type, ingredientCount) {
  const base = {
    breakfast: 8,
    lunch: 18,
    snack: 5,
    dinner: 16,
  };

  return Math.max(4, (base[type] || 10) + Math.max(0, ingredientCount - 4));
}

function buildMealPrepGuide({ type, selected, slot }) {
  const visibleIngredients = Array.isArray(selected.ingredients) ? selected.ingredients.filter(Boolean) : [];
  const prepTimeMinutes = estimatePrepTimeMinutes(type, visibleIngredients.length);
  const mainIngredients = visibleIngredients.slice(0, 3).join(', ') || 'ingredientes base';
  const methodLabel = (
    type === 'snack'
      ? 'Montaje rápido'
      : selected.instructions.toLowerCase().includes('horno')
        ? 'Horno'
        : selected.instructions.toLowerCase().includes('saltear') || selected.instructions.toLowerCase().includes('plancha')
          ? 'Plancha / sartén'
          : 'Preparación sencilla'
  );

  return {
    prepTimeMinutes,
    methodLabel,
    batchFriendly: type === 'lunch' || type === 'dinner',
    steps: [
      `Prepara y pesa ${mainIngredients}.`,
      selected.instructions,
      type === 'snack'
        ? 'Ajusta la porción al objetivo calórico del bloque.'
        : 'Sirve con una porción de verduras y corrige sal/aceite antes de emplatar.',
    ],
    servingGuide:
      type === 'snack'
        ? `Mantén ${slot.toLowerCase()} ligero y fácil de digerir.`
        : 'Mantén proteína visible, carbohidrato medido y grasa añadida controlada.',
    chefNote:
      type === 'lunch' || type === 'dinner'
        ? 'Si cocinas doble ración, guarda una porción para el siguiente bloque del día o para mañana.'
        : 'Ten esta opción lista con antelación para evitar improvisación.',
  };
}

function buildFallbackMeal(slot, target, type) {
  return {
    slot,
    type: type || 'snack',
    dish: 'Comida de respaldo personalizada',
    ingredients: ['Fuente de proteína magra', 'Carbohidrato complejo', 'Verduras', 'Grasa saludable'],
    instructions:
      'Configura esta comida manualmente con un profesional si tus restricciones eliminan opciones automáticas.',
    target,
    notes: 'Fallback por restricciones alimentarias.',
    prep: {
      prepTimeMinutes: 10,
      methodLabel: 'Montaje guiado',
      batchFriendly: false,
      steps: [
        'Selecciona una proteína compatible con tus restricciones.',
        'Añade un carbohidrato complejo y verduras variadas.',
        'Ajusta las porciones al objetivo del bloque y registra cualquier síntoma digestivo.',
      ],
      servingGuide: 'Usa porciones simples y conocidas hasta revisar el menú con un profesional.',
      chefNote: 'Evita alimentos no tolerados y ultraprocesados.',
    },
  };
}

export function buildWeeklyNutritionPlan({ profile, days = [] }) {
  const restrictions = parseNutritionPreferences(profile);
  const dayPlans = days.map((day, dayIndex) => {
    const meals = Array.isArray(day.meals) ? day.meals : [];
    const mealPlan = meals.map((meal, mealIndex) => {
      const type = resolveMealType(meal.slot, mealIndex, meals.length);
      const selected = chooseOption(type, restrictions.dietaryPattern, restrictions, dayIndex, mealIndex);

      if (!selected) {
        return buildFallbackMeal(meal.slot, meal.target, type);
      }

      return {
        slot: meal.slot,
        type,
        dish: selected.dish,
        ingredients: selected.ingredients,
        instructions: selected.instructions,
        prep: buildMealPrepGuide({ type, selected, slot: meal.slot }),
        target: meal.target,
        notes:
          restrictions.blocked.size > 0
            ? `Se excluyeron alimentos por restricciones: ${Array.from(restrictions.blocked).join(', ')}`
            : 'Sin restricciones excluidas para esta comida.',
      };
    });

    return {
      date: day.date,
      dayName: day.dayName,
      meals: mealPlan,
      hydration: '2-3L agua/día. Aumentar si sudoración elevada.',
      preWorkout:
        day.sessionType === 'resistance' || day.sessionType === 'mixed' || day.sessionType === 'aerobic'
          ? '60-90 min antes: proteína + carbohidrato de fácil digestión.'
          : 'Snack opcional según hambre.',
      postWorkout:
        day.sessionType === 'resistance' || day.sessionType === 'mixed' || day.sessionType === 'aerobic'
          ? 'En 1-2h: proteína de alta calidad + carbohidrato complejo.'
          : 'Priorizar verduras, proteína y descanso.',
    };
  });

  return {
    dietaryPattern: restrictions.dietaryPattern,
    restrictionsApplied: {
      allergies: restrictions.allergies,
      intolerances: restrictions.intolerances,
      dislikedFoods: restrictions.dislikes,
    },
    notes: [
      'Plan nutricional educativo con ajuste a macros objetivo diarios.',
      'Si hay patología clínica o múltiples restricciones, validar menú con nutricionista.',
    ],
    days: dayPlans,
  };
}

export function normalizeNutritionPreferencesInput(input = {}) {
  const source = input.nutritionPreferences || input;
  const dietaryPattern = ['omnivore', 'vegetarian', 'vegan'].includes(source.dietaryPattern)
    ? source.dietaryPattern
    : 'omnivore';

  return {
    dietaryPattern,
    allergies: normalizeList(source.allergies),
    intolerances: normalizeList(source.intolerances),
    dislikedFoods: normalizeList(source.dislikedFoods),
  };
}
